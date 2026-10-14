import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { IdempotencyRepository } from "../src/store-idempotency.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the idempotency slots live in `IdempotencyRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return { db: database.db, repo: new IdempotencyRepository(database.db) };
}

const slot = (overrides: Partial<{ tokenId: string; route: string; key: string }> = {}) => ({
  tokenId: "tok-1",
  route: "POST /api/sites",
  key: "key-1",
  ...overrides,
});

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe("IdempotencyRepository", () => {
  it("claims a free key and answers a second claim with in_progress", async () => {
    const { repo } = await fixture();
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" })).toEqual({ state: "claimed" });
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" })).toEqual({ state: "in_progress" });
  });

  it("replays the stored response for the same body and refuses a different body", async () => {
    const { repo } = await fixture();
    await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" });
    await repo.completeIdempotencyKey({ ...slot(), status: 201, body: { id: "created-1" } });
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" })).toEqual({
      state: "replay",
      status: 201,
      body: { id: "created-1" },
    });
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-2" })).toEqual({ state: "mismatch" });
  });

  it("does not read a lost slot as done: completing without a slot is a conflict on idempotencyKey", async () => {
    const { repo } = await fixture();
    const error = await repo
      .completeIdempotencyKey({ ...slot(), status: 201, body: {} })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "conflict", field: "idempotencyKey" });
  });

  it("frees the key on release so the same key can be tried again", async () => {
    const { repo } = await fixture();
    await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" });
    await repo.releaseIdempotencyKey(slot());
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-2" })).toEqual({ state: "claimed" });
  });

  it("keeps keys apart per token and per route", async () => {
    const { repo } = await fixture();
    await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" });
    expect(await repo.claimIdempotencyKey({ ...slot({ tokenId: "tok-2" }), fingerprint: "fp-1" })).toEqual({
      state: "claimed",
    });
    expect(
      await repo.claimIdempotencyKey({ ...slot({ route: "POST /api/pages" }), fingerprint: "fp-1" }),
    ).toEqual({ state: "claimed" });
  });

  it("takes over a slot from a crashed attempt only once it is older than the stale window", async () => {
    const { db, repo } = await fixture();
    const insert = (key: string, createdAt: string) =>
      db.query(
        `INSERT INTO idempotency_keys
          (token_id, route, idempotency_key, fingerprint, status, response, created_at)
         VALUES ($1, $2, $3, $4, NULL, NULL, $5)`,
        ["tok-1", "POST /api/sites", key, "fp-1", createdAt],
      );
    await insert("fresh", minutesAgo(1));
    await insert("crashed", minutesAgo(5));
    expect(await repo.claimIdempotencyKey({ ...slot({ key: "fresh" }), fingerprint: "fp-1" })).toEqual({
      state: "in_progress",
    });
    expect(await repo.claimIdempotencyKey({ ...slot({ key: "crashed" }), fingerprint: "fp-2" })).toEqual({
      state: "claimed",
    });
  });

  it("remembers a committed write: the key is never handed out again, even without its slot (R6)", async () => {
    const { repo } = await fixture();
    await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" });
    await repo.markIdempotencyCommitted(slot());
    // Marking twice records the same fact and is not an error.
    await repo.markIdempotencyCommitted(slot());
    // The marker outranks the slot while it exists (same body or not) ...
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" })).toEqual({
      state: "committed_unknown",
    });
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-2" })).toEqual({ state: "mismatch" });
    // ... and still answers after the slot itself is gone.
    await repo.releaseIdempotencyKey(slot());
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" })).toEqual({
      state: "committed_unknown",
    });
  });

  it("drops slots and markers older than a day on the next claim", async () => {
    const { db, repo } = await fixture();
    const old = minutesAgo(25 * 60);
    await db.query(
      `INSERT INTO idempotency_keys
        (token_id, route, idempotency_key, fingerprint, status, response, created_at)
       VALUES ($1, $2, $3, $4, 201, '{"id":"old"}', $5)`,
      ["tok-1", "POST /api/sites", "old", "fp-1", old],
    );
    await db.query(
      `INSERT INTO idempotency_committed (token_id, route, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4)`,
      ["tok-1", "POST /api/sites", "old", old],
    );
    // The first claim sweeps both tables, so the old key is free again.
    expect(await repo.claimIdempotencyKey({ ...slot({ key: "old" }), fingerprint: "fp-9" })).toEqual({
      state: "claimed",
    });
    const markers = await db.query(`SELECT 1 FROM idempotency_committed WHERE idempotency_key = 'old'`);
    expect(markers.rows).toHaveLength(0);
  });

  it("is what Store delegates to: both see the same slots", async () => {
    const { db, repo } = await fixture();
    const store = new Store(db);
    expect(await store.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" })).toEqual({ state: "claimed" });
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" })).toEqual({ state: "in_progress" });
    await store.completeIdempotencyKey({ ...slot(), status: 200, body: { ok: true } });
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" })).toEqual(
      await store.claimIdempotencyKey({ ...slot(), fingerprint: "fp-1" }),
    );
    await store.markIdempotencyCommitted(slot({ key: "key-2" }));
    expect(await repo.claimIdempotencyKey({ ...slot({ key: "key-2" }), fingerprint: "fp-1" })).toEqual({
      state: "committed_unknown",
    });
    await store.releaseIdempotencyKey(slot());
    expect(await repo.claimIdempotencyKey({ ...slot(), fingerprint: "fp-3" })).toEqual({ state: "claimed" });
  });
});
