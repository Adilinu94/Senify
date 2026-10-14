// Idempotency slots of the Store (ADR 0019, ticket 18, R6): claim a key before the operation runs, store its response, mark a committed write whose response was lost, release a failed attempt. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import { isUniqueViolation, toFiniteNumber, toIso, toJson, toJsonParam } from "./store-row-utils.ts";

type IdempotencyRow = {
  fingerprint: string;
  status: unknown;
  response: unknown;
  created_at: unknown;
};

// A completed idempotent response is replayable for a day; a claim without a
// response older than two minutes is a crashed attempt and may be taken over.
// A slot with a committed marker is never taken over and never cleaned up
// before the slot itself expires: the two rows share one lifetime, so a retry
// can never see a free slot for a write that already happened.
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_STALE_MS = 2 * 60 * 1000;

export type IdempotencyClaim =
  | { state: "claimed" }
  | { state: "replay"; status: number; body: unknown }
  | { state: "in_progress" }
  | // The write is committed but its response was lost (R6): the caller must
    // not write again, and there is nothing to replay.
    { state: "committed_unknown" }
  | { state: "mismatch" };


export type IdempotencySlotInput = {
  tokenId: string;
  route: string;
  key: string;
};

export type ClaimIdempotencyKeyInput = IdempotencySlotInput & { fingerprint: string };

export type CompleteIdempotencyKeyInput = IdempotencySlotInput & {
  status: number;
  body: unknown;
};

export class IdempotencyRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  // Claim-first (ticket 18, slice 2): the slot is taken before the operation
  // runs, so two concurrent requests with the same key cannot both write.
  // A completed slot replays its stored response; a slot still in flight
  // answers "in_progress"; a slot from a crashed attempt (older than the stale
  // window) may be taken over once. The fingerprint pins the key to the body,
  // so reusing it for a different request fails loudly instead of replaying a
  // foreign response.
  async claimIdempotencyKey(input: ClaimIdempotencyKeyInput): Promise<IdempotencyClaim> {
    const now = new Date().toISOString();
    const expired = new Date(Date.now() - IDEMPOTENCY_TTL_MS).toISOString();
    // Slot and marker share one lifetime: removing one without the other would
    // hand a retry a free slot for a write that already happened.
    await this.#db.query(`DELETE FROM idempotency_keys WHERE created_at < $1`, [
      expired,
    ]);
    await this.#db.query(
      `DELETE FROM idempotency_committed WHERE created_at < $1`,
      [expired],
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // The committed marker is checked FIRST (R6): it records that the write
      // behind this key already happened even when its slot is gone (the very
      // failure that used to free the slot and invite a second write). Checking
      // it after the insert would claim the freshly free slot anyway and
      // produce exactly the second entity the marker exists to prevent.
      const seed = await this.#db.query<IdempotencyRow>(
        `SELECT fingerprint, status, response, created_at FROM idempotency_keys
         WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [input.tokenId, input.route, input.key],
      );
      const seedRow = seed.rows[0];
      const markerBefore = await this.#db.query(
        `SELECT token_id FROM idempotency_committed
         WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [input.tokenId, input.route, input.key],
      );
      if (markerBefore.rows.length > 0) {
        if (seedRow !== undefined && seedRow.fingerprint !== input.fingerprint) {
          return { state: "mismatch" };
        }
        return { state: "committed_unknown" };
      }
      try {
        await this.#db.query(
          `INSERT INTO idempotency_keys
            (token_id, route, idempotency_key, fingerprint, status, response, created_at)
           VALUES ($1, $2, $3, $4, NULL, NULL, $5)`,
          [input.tokenId, input.route, input.key, input.fingerprint, now],
        );
        return { state: "claimed" };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      const existing = await this.#db.query<IdempotencyRow>(
        `SELECT fingerprint, status, response, created_at FROM idempotency_keys
         WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [input.tokenId, input.route, input.key],
      );
      const row = existing.rows[0];
      // A committed marker outranks every other reading of the slot (R6): the
      // write happened, so neither a slot that looks stale nor a foreign body
      // may hand this key back to another attempt.
      const marker = await this.#db.query(
        `SELECT token_id FROM idempotency_committed
         WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [input.tokenId, input.route, input.key],
      );
      if (marker.rows.length > 0) {
        if (row !== undefined && row.fingerprint !== input.fingerprint) {
          return { state: "mismatch" };
        }
        return { state: "committed_unknown" };
      }
      // Raced with a release between insert and read: try to claim again.
      if (row === undefined) continue;
      if (row.status === null || row.response === null) {
        const age = Date.now() - Date.parse(toIso(row.created_at));
        if (age <= IDEMPOTENCY_STALE_MS) return { state: "in_progress" };
        // A crashed attempt never completes: release it and claim once more.
        await this.#db.query(
          `DELETE FROM idempotency_keys
           WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
          [input.tokenId, input.route, input.key],
        );
        continue;
      }
      if (row.fingerprint !== input.fingerprint) return { state: "mismatch" };
      return {
        state: "replay",
        status: toFiniteNumber(row.status, "status"),
        body: toJson<unknown>(row.response),
      };
    }
    throw new SenifyError(
      "conflict",
      "Idempotency key could not be claimed",
      {
        field: "idempotencyKey",
        suggestion: "Retry the request; use a fresh key for a new operation.",
      },
    );
  }

  async completeIdempotencyKey(input: CompleteIdempotencyKeyInput): Promise<void> {
    const stored = await this.#db.query<{ idempotency_key: unknown }>(
      `UPDATE idempotency_keys SET status = $4, response = $5
       WHERE token_id = $1 AND route = $2 AND idempotency_key = $3
       RETURNING idempotency_key`,
      [
        input.tokenId,
        input.route,
        input.key,
        input.status,
        toJsonParam(input.body ?? null),
      ],
    );
    // An UPDATE that hits no row is not a success: the slot is gone, so the
    // response is stored nowhere and a retry could not replay it. The caller
    // decides what a lost slot means (R6), it must not read this as "done".
    if (stored.rows.length === 0) {
      throw new SenifyError(
        "conflict",
        "The idempotency slot vanished before its response could be stored",
        {
          field: "idempotencyKey",
          suggestion: "Check whether the resource was created before retrying.",
        },
      );
    }
  }

  // Records that the operation behind a key is committed even though its
  // response could not be stored (R6). This is the answer to "may I retry?":
  // no, the write happened, only the response is missing.
  async markIdempotencyCommitted(input: IdempotencySlotInput): Promise<void> {
    try {
      await this.#db.query(
        `INSERT INTO idempotency_committed
          (token_id, route, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4)`,
        [input.tokenId, input.route, input.key, new Date().toISOString()],
      );
    } catch (error) {
      // A concurrent attempt already recorded the fact: nothing to add.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  // A failed attempt does not burn the key: releasing it lets the caller retry
  // with the same key (and a corrected body, if the failure was validation).
  async releaseIdempotencyKey(input: IdempotencySlotInput): Promise<void> {
    await this.#db.query(
      `DELETE FROM idempotency_keys
       WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
      [input.tokenId, input.route, input.key],
    );
  }
}
