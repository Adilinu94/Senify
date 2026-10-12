// Image generation queue of the Store (ADR 0019, S2): per-site lease claim, provider handle for crash resume, final states and provider cooldowns. `Store` delegates here.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import { IMAGE_JOB_COLUMNS, type ImageJobRow, mapImageJob } from "./store-job-mappers.ts";
import { toJsonParam } from "./store-row-utils.ts";
import type {
  ImageJob,
  ImageJobAttempt,
  ImageJobRequest,
  ImageJobStatus,
  ProviderCooldown,
} from "./types.ts";

export type EnqueueImageJobInput = {
  siteId: string;
  request: ImageJobRequest;
  maxAttempts?: number;
  now?: string;
};

export type ClaimImageJobInput = { now: string; leaseMs: number };

export type SetImageJobProviderInput = {
  id: string;
  providerUsed: string;
  providerJobId?: string | null;
  now?: string;
};

export type ImageJobResult = { assetId: string; providerUsed: string; error: ImageJobAttempt[] };

export type FailImageJobInput = {
  id: string;
  error: ImageJobAttempt[];
  now?: string;
};

export type ListImageJobsOptions = { status?: ImageJobStatus; limit?: number };

export type SetProviderCooldownInput = {
  provider: string;
  until: string;
  reason: string;
  now?: string;
};

export class ImageJobsRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async enqueueImageJob(input: EnqueueImageJobInput): Promise<ImageJob> {
    const now = input.now ?? new Date().toISOString();
    const inserted = await this.#db.query<ImageJobRow>(
      `INSERT INTO image_jobs
        (id, site_id, status, request, provider_used, attempts, max_attempts,
         lease_until, provider_job_id, asset_id, error, created_at, started_at,
         finished_at, updated_at)
       VALUES ($1, $2, 'queued', $3, NULL, 0, $4, NULL, NULL, NULL, $5, $6, NULL, NULL, $6)
       RETURNING ${IMAGE_JOB_COLUMNS}`,
      [
        newEntityId(),
        input.siteId,
        toJsonParam(input.request),
        input.maxAttempts ?? 3,
        toJsonParam([]),
        now,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("Image job insert returned no row");
    return mapImageJob(row);
  }

  // Claim the oldest due job whose site has no live running job (the
  // concurrency key: one generation per site at a time). The conditional
  // update makes the claim atomic.
  async claimImageJob(input: ClaimImageJobInput): Promise<ImageJob | null> {
    const running = await this.#db.query<{ site_id: string }>(
      `SELECT DISTINCT site_id FROM image_jobs
       WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until > $1`,
      [input.now],
    );
    const busy = new Set(running.rows.map((row) => row.site_id));
    const due = await this.#db.query<ImageJobRow>(
      `SELECT ${IMAGE_JOB_COLUMNS} FROM image_jobs
       WHERE status = 'queued'
       ORDER BY created_at ASC, id ASC LIMIT 50`,
    );
    const candidate = due.rows.map(mapImageJob).find((job) => !busy.has(job.siteId));
    if (candidate === undefined) return null;
    const leaseUntil = new Date(Date.parse(input.now) + input.leaseMs).toISOString();
    const claimed = await this.#db.query<ImageJobRow>(
      `UPDATE image_jobs SET status = 'running', attempts = attempts + 1,
         lease_until = $2, started_at = COALESCE(started_at, $1), updated_at = $1
       WHERE id = $3 AND status = 'queued'
       RETURNING ${IMAGE_JOB_COLUMNS}`,
      [input.now, leaseUntil, candidate.id],
    );
    const row = claimed.rows[0];
    return row === undefined ? null : mapImageJob(row);
  }

  // Records which provider is currently running (and its own job handle), so a
  // crash can resume instead of submitting a second run.
  async setImageJobProvider(input: SetImageJobProviderInput): Promise<ImageJob> {
    const now = input.now ?? new Date().toISOString();
    const updated = await this.#db.query<ImageJobRow>(
      `UPDATE image_jobs SET provider_used = $2, provider_job_id = $3, updated_at = $4
       WHERE id = $1 RETURNING ${IMAGE_JOB_COLUMNS}`,
      [input.id, input.providerUsed, input.providerJobId ?? null, now],
    );
    const row = updated.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Image job "${input.id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImageJob(row);
  }

  async completeImageJob(
    id: string,
    result: ImageJobResult,
    now = new Date().toISOString(),
  ): Promise<ImageJob> {
    const updated = await this.#db.query<ImageJobRow>(
      `UPDATE image_jobs SET status = 'succeeded', asset_id = $2, provider_used = $3,
         error = $5, lease_until = NULL, provider_job_id = NULL,
         finished_at = $4, updated_at = $4
       WHERE id = $1 RETURNING ${IMAGE_JOB_COLUMNS}`,
      [id, result.assetId, result.providerUsed, now, toJsonParam(result.error)],
    );
    const row = updated.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Image job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImageJob(row);
  }

  // The final state: the error column carries the whole provider history.
  async failImageJob(input: FailImageJobInput): Promise<ImageJob> {
    const now = input.now ?? new Date().toISOString();
    const updated = await this.#db.query<ImageJobRow>(
      `UPDATE image_jobs SET status = 'failed', error = $2, lease_until = NULL,
         provider_job_id = NULL, finished_at = $3, updated_at = $3
       WHERE id = $1 RETURNING ${IMAGE_JOB_COLUMNS}`,
      [input.id, toJsonParam(input.error), now],
    );
    const row = updated.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Image job "${input.id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImageJob(row);
  }

  // Cancel only a queued job; a running job needs the provider's interrupt
  // (later slice) and answers with a conflict.
  async cancelImageJob(id: string, now = new Date().toISOString()): Promise<ImageJob> {
    const updated = await this.#db.query<ImageJobRow>(
      `UPDATE image_jobs SET status = 'canceled', finished_at = $2, updated_at = $2
       WHERE id = $1 AND status = 'queued' RETURNING ${IMAGE_JOB_COLUMNS}`,
      [id, now],
    );
    const row = updated.rows[0];
    if (row) return mapImageJob(row);
    const current = await this.getImageJob(id);
    throw new SenifyError(
      "conflict",
      `Image job "${id}" cannot be canceled (status: ${current.status})`,
      {
        field: "jobId",
        suggestion: "Only a queued job can be canceled.",
      },
    );
  }

  // Crash recovery: a running job whose lease expired goes back to the queue;
  // a job that used up its attempts fails instead of looping forever.
  async expireImageLeases(now: string): Promise<number> {
    const requeued = await this.#db.query<{ id: string }>(
      `UPDATE image_jobs SET status = 'queued', lease_until = NULL, updated_at = $1
       WHERE status = 'running' AND (lease_until IS NULL OR lease_until <= $1)
         AND attempts < max_attempts
       RETURNING id`,
      [now],
    );
    const failed = await this.#db.query<{ id: string }>(
      `UPDATE image_jobs SET status = 'failed', lease_until = NULL,
         provider_job_id = NULL, finished_at = $1, updated_at = $1
       WHERE status = 'running' AND (lease_until IS NULL OR lease_until <= $1)
         AND attempts >= max_attempts
       RETURNING id`,
      [now],
    );
    return requeued.rows.length + failed.rows.length;
  }

  async getImageJob(id: string): Promise<ImageJob> {
    const result = await this.#db.query<ImageJobRow>(
      `SELECT ${IMAGE_JOB_COLUMNS} FROM image_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Image job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImageJob(row);
  }

  async listImageJobs(siteId: string, options: ListImageJobsOptions = {}): Promise<ImageJob[]> {
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const result = options.status === undefined
      ? await this.#db.query<ImageJobRow>(
          `SELECT ${IMAGE_JOB_COLUMNS} FROM image_jobs
           WHERE site_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
          [siteId, limit],
        )
      : await this.#db.query<ImageJobRow>(
          `SELECT ${IMAGE_JOB_COLUMNS} FROM image_jobs
           WHERE site_id = $1 AND status = $2 ORDER BY created_at DESC, id DESC LIMIT $3`,
          [siteId, options.status, limit],
        );
    return result.rows.map(mapImageJob);
  }

  // Active provider cooldowns at `now`; the worker skips those providers.
  async listProviderCooldowns(now: string): Promise<ProviderCooldown[]> {
    const result = await this.#db.query<{
      provider: string;
      until: string;
      reason: string;
    }>(
      `SELECT provider, until, reason FROM image_provider_cooldowns
       WHERE until > $1 ORDER BY provider ASC`,
      [now],
    );
    return result.rows.map((row) => ({
      provider: row.provider,
      until: new Date(row.until).toISOString(),
      reason: row.reason,
    }));
  }

  async setProviderCooldown(input: SetProviderCooldownInput): Promise<void> {
    const now = input.now ?? new Date().toISOString();
    await this.#db.query(
      `INSERT INTO image_provider_cooldowns (provider, until, reason, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider) DO UPDATE SET until = $2, reason = $3, updated_at = $4`,
      [input.provider, input.until, input.reason, now],
    );
  }
}
