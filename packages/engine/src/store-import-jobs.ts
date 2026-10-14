// Import-job queue of the Store (ADR 0019, plan S3.2): jobs of a site import, their retry state, request payload and the report of a finished run. `Store` delegates here; `commitFramerImportPlan` is a cross-domain transaction and stays on the Store.
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import { IMPORT_JOB_COLUMNS, type ImportJobRow, mapImportJob } from "./store-job-mappers.ts";
import { toJson, toJsonParam } from "./store-row-utils.ts";
import type { ImportJob, ImportJobSource, ImportJobStatus } from "./types.ts";

export type CreateImportJobInput = {
  siteId: string;
  source: ImportJobSource;
  pagePath: string;
  dryRun: boolean;
  maxAttempts: number;
  // The import request body, kept for a retry after a crash.
  payload?: Record<string, unknown> | null;
};

export type UpdateImportJobInput = {
  id: string;
  status: ImportJobStatus;
  stage: string;
  progress: number;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  finishedAt: string | null;
};

export class ImportJobsRepository {
  readonly #db: Db;
  readonly #getSite: (siteId: string) => Promise<unknown>;

  constructor(db: Db, getSite: (siteId: string) => Promise<unknown>) {
    this.#db = db;
    this.#getSite = getSite;
  }

  async createImportJob(input: CreateImportJobInput): Promise<ImportJob> {
    await this.#getSite(input.siteId);
    const now = new Date().toISOString();
    const result = await this.#db.query<ImportJobRow>(
      `INSERT INTO import_jobs
        (id, site_id, source_kind, source_url, page_path, dry_run, status, stage,
         progress, attempts, max_attempts, next_attempt_at, last_error,
         created_at, updated_at, finished_at, payload, result)
       VALUES ($1, $2, $3, $4, $5, $6, 'queued', 'queued', 0, 0, $7, $8, NULL, $8, $8, NULL, $9, NULL)
       RETURNING ${IMPORT_JOB_COLUMNS}`,
      [
        newEntityId(),
        input.siteId,
        input.source.kind,
        input.source.url,
        input.pagePath,
        input.dryRun,
        input.maxAttempts,
        now,
        input.payload === undefined || input.payload === null
          ? null
          : toJsonParam(input.payload),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Import job insert returned no row");
    return mapImportJob(row);
  }

  async getImportJob(id: string): Promise<ImportJob> {
    const result = await this.#db.query<ImportJobRow>(
      `SELECT ${IMPORT_JOB_COLUMNS} FROM import_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Import job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImportJob(row);
  }

  getImportJobPayload(id: string): Promise<Record<string, unknown> | null> {
    return this.getImportJobPayloadAsync(id);
  }

  private async getImportJobPayloadAsync(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.#db.query<{ payload: unknown }>(
      `SELECT payload FROM import_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row || row.payload === null || row.payload === undefined) return null;
    return toJson<Record<string, unknown>>(row.payload);
  }

  // Due jobs: queued and past their next attempt time (the claim pattern of
  // `listDueReferenceJobs`, plan S3.2).
  async listDueImportJobs(now: string, limit = 20): Promise<ImportJob[]> {
    const result = await this.#db.query<ImportJobRow>(
      `SELECT ${IMPORT_JOB_COLUMNS} FROM import_jobs
       WHERE status = 'queued' AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC, created_at ASC, id ASC LIMIT $2`,
      [now, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map(mapImportJob);
  }

  async listImportJobsForSite(siteId: string, limit = 50): Promise<ImportJob[]> {
    await this.#getSite(siteId);
    const result = await this.#db.query<ImportJobRow>(
      `SELECT ${IMPORT_JOB_COLUMNS} FROM import_jobs
       WHERE site_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map(mapImportJob);
  }

  async updateImportJob(input: UpdateImportJobInput): Promise<ImportJob> {
    const result = await this.#db.query<ImportJobRow>(
      `UPDATE import_jobs SET
         status = $2, stage = $3, progress = $4, attempts = $5,
         next_attempt_at = $6, last_error = $7, finished_at = $8, updated_at = $9
       WHERE id = $1 RETURNING ${IMPORT_JOB_COLUMNS}`,
      [
        input.id,
        input.status,
        input.stage,
        input.progress,
        input.attempts,
        input.nextAttemptAt,
        input.lastError,
        input.finishedAt,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Import job "${input.id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapImportJob(row);
  }

  // The report of a finished run (poll answer, plan S3.3).
  async getImportJobResult(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.#db.query<{ result: unknown }>(
      `SELECT result FROM import_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row || row.result === null || row.result === undefined) return null;
    return toJson<Record<string, unknown>>(row.result);
  }

  async setImportJobResult(id: string, result: Record<string, unknown>): Promise<void> {
    await this.#db.query(
      `UPDATE import_jobs SET result = $2, updated_at = $3 WHERE id = $1`,
      [id, toJsonParam(result), new Date().toISOString()],
    );
  }
}
