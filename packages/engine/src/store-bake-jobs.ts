// Re-bake job queue of the Store (ADR 0019, E12): enqueue with per-site dedup, lease-based claim, retry/backoff and crash recovery. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import { BAKE_JOB_COLUMNS, type BakeJobRow, mapBakeJob } from "./store-job-mappers.ts";
import { toJsonParam } from "./store-row-utils.ts";
import type { BakeJob } from "./types.ts";

export type EnqueueBakeJobInput = {
  siteId: string;
  reason: string;
  paths?: readonly string[];
  maxAttempts?: number;
  now?: string;
};

export type ClaimBakeJobInput = { now: string; leaseMs: number };

export type FailBakeJobInput = {
  id: string;
  error: string;
  backoffMs: number;
  now?: string;
};

export class BakeJobsRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  // Enqueue with dedup: a queued job for the same site absorbs the new request
  // (paths merged, reason appended) instead of stacking a second one. A running
  // job does not absorb — the new job waits in the queue behind it.
  async enqueueBakeJob(input: EnqueueBakeJobInput): Promise<BakeJob> {
    const now = input.now ?? new Date().toISOString();
    const paths = [...new Set(input.paths ?? [])].sort();
    const existing = await this.#db.query<BakeJobRow>(
      `SELECT ${BAKE_JOB_COLUMNS} FROM bake_jobs
       WHERE site_id = $1 AND status = 'queued'
       ORDER BY created_at ASC, id ASC LIMIT 1`,
      [input.siteId],
    );
    const row = existing.rows[0];
    if (row !== undefined) {
      const current = mapBakeJob(row);
      const merged = [...new Set([...current.paths, ...paths])].sort();
      const reason = current.reason.includes(input.reason)
        ? current.reason
        : `${current.reason}, ${input.reason}`;
      const updated = await this.#db.query<BakeJobRow>(
        `UPDATE bake_jobs SET reason = $2, paths = $3, updated_at = $4
         WHERE id = $1 RETURNING ${BAKE_JOB_COLUMNS}`,
        [current.id, reason, toJsonParam(merged), now],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw new Error("Bake job update returned no row");
      return mapBakeJob(updatedRow);
    }
    const inserted = await this.#db.query<BakeJobRow>(
      `INSERT INTO bake_jobs
        (id, site_id, reason, paths, status, attempts, max_attempts,
         next_attempt_at, lease_until, last_error, created_at, updated_at, finished_at)
       VALUES ($1, $2, $3, $4, 'queued', 0, $5, $6, NULL, NULL, $6, $6, NULL)
       RETURNING ${BAKE_JOB_COLUMNS}`,
      [
        newEntityId(),
        input.siteId,
        input.reason,
        toJsonParam(paths),
        input.maxAttempts ?? 3,
        now,
      ],
    );
    const insertedRow = inserted.rows[0];
    if (!insertedRow) throw new Error("Bake job insert returned no row");
    return mapBakeJob(insertedRow);
  }

  // Claim the oldest due job whose site has no live running job (the
  // concurrency key). The conditional update makes the claim atomic: a second
  // worker that races gets no row.
  async claimBakeJob(input: ClaimBakeJobInput): Promise<BakeJob | null> {
    const running = await this.#db.query<{ site_id: string }>(
      `SELECT DISTINCT site_id FROM bake_jobs
       WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until > $1`,
      [input.now],
    );
    const busy = new Set(running.rows.map((row) => row.site_id));
    const due = await this.#db.query<BakeJobRow>(
      `SELECT ${BAKE_JOB_COLUMNS} FROM bake_jobs
       WHERE status = 'queued' AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC, created_at ASC, id ASC LIMIT 50`,
      [input.now],
    );
    const candidate = due.rows.map(mapBakeJob).find((job) => !busy.has(job.siteId));
    if (candidate === undefined) return null;
    const leaseUntil = new Date(Date.parse(input.now) + input.leaseMs).toISOString();
    const claimed = await this.#db.query<BakeJobRow>(
      `UPDATE bake_jobs SET status = 'running', attempts = attempts + 1,
         lease_until = $2, updated_at = $1
       WHERE id = $3 AND status = 'queued'
       RETURNING ${BAKE_JOB_COLUMNS}`,
      [input.now, leaseUntil, candidate.id],
    );
    const row = claimed.rows[0];
    return row === undefined ? null : mapBakeJob(row);
  }

  async completeBakeJob(id: string, now = new Date().toISOString()): Promise<BakeJob> {
    const result = await this.#db.query<BakeJobRow>(
      `UPDATE bake_jobs SET status = 'done', lease_until = NULL,
         last_error = NULL, finished_at = $2, updated_at = $2
       WHERE id = $1 RETURNING ${BAKE_JOB_COLUMNS}`,
      [id, now],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Bake job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapBakeJob(row);
  }

  // A failed attempt: back to the queue with the next attempt time, or the
  // final state when the attempts are used up.
  async failBakeJob(input: FailBakeJobInput): Promise<BakeJob> {
    const now = input.now ?? new Date().toISOString();
    const current = await this.#db.query<BakeJobRow>(
      `SELECT ${BAKE_JOB_COLUMNS} FROM bake_jobs WHERE id = $1`,
      [input.id],
    );
    const row = current.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Bake job "${input.id}" does not exist`, {
        field: "jobId",
      });
    }
    const job = mapBakeJob(row);
    const exhausted = job.attempts >= job.maxAttempts;
    const nextAttemptAt = exhausted
      ? job.nextAttemptAt
      : new Date(Date.parse(now) + Math.max(0, input.backoffMs)).toISOString();
    const updated = await this.#db.query<BakeJobRow>(
      `UPDATE bake_jobs SET status = $2, lease_until = NULL, last_error = $3,
         next_attempt_at = $4, finished_at = $5, updated_at = $6
       WHERE id = $1 RETURNING ${BAKE_JOB_COLUMNS}`,
      [
        input.id,
        exhausted ? "failed" : "queued",
        input.error,
        nextAttemptAt,
        exhausted ? now : null,
        now,
      ],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw new Error("Bake job update returned no row");
    return mapBakeJob(updatedRow);
  }

  // Crash recovery: a running job whose lease expired goes back to the queue.
  async expireBakeLeases(now: string): Promise<number> {
    const result = await this.#db.query<{ id: string }>(
      `UPDATE bake_jobs SET status = 'queued', lease_until = NULL, updated_at = $1
       WHERE status = 'running' AND (lease_until IS NULL OR lease_until <= $1)
       RETURNING id`,
      [now],
    );
    return result.rows.length;
  }

  async getBakeJob(id: string): Promise<BakeJob> {
    const result = await this.#db.query<BakeJobRow>(
      `SELECT ${BAKE_JOB_COLUMNS} FROM bake_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Bake job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapBakeJob(row);
  }

  async listBakeJobs(siteId: string, limit = 20): Promise<BakeJob[]> {
    const result = await this.#db.query<BakeJobRow>(
      `SELECT ${BAKE_JOB_COLUMNS} FROM bake_jobs
       WHERE site_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map(mapBakeJob);
  }
}
