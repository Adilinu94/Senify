// Row types and mappers for the background jobs: import, bake and image jobs (P3-2, moved out of store.ts).
import {
  type BakeJob,
  type BakeJobStatus,
  IMAGE_JOB_STATUSES,
  type ImageJob,
  type ImageJobAttempt,
  type ImageJobRequest,
  type ImageJobStatus,
  type ImportJob,
  type ImportJobSource,
  type ImportJobStatus,
  type ImportReceipt,
} from "./types.ts";
import { toFiniteNumber, toIso, toJson } from "./store-row-utils.ts";

export const BAKE_JOB_COLUMNS =
  "id, site_id, reason, paths, status, attempts, max_attempts, next_attempt_at, lease_until, last_error, created_at, updated_at, finished_at";

export const IMPORT_JOB_COLUMNS =
  "id, site_id, source_kind, source_url, page_path, dry_run, status, stage, progress, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at, finished_at";

export type ImportReceiptRow = {
  id: string;
  site_id: string;
  job_id: string;
  content_key: string;
  request_fingerprint: string;
  page_id: string;
  draft_version: unknown;
  result: unknown;
  created_at: unknown;
};

export function mapImportReceipt(row: ImportReceiptRow): ImportReceipt {
  return {
    id: row.id,
    siteId: row.site_id,
    jobId: row.job_id,
    contentKey: row.content_key,
    requestFingerprint: row.request_fingerprint,
    pageId: row.page_id,
    draftVersion: toFiniteNumber(row.draft_version, "draft_version"),
    result: toJson<Record<string, unknown>>(row.result),
    createdAt: toIso(row.created_at),
  };
}

export type ImportJobRow = {
  id: string;
  site_id: string;
  source_kind: string;
  source_url: unknown;
  page_path: string;
  dry_run: unknown;
  status: string;
  stage: string;
  progress: unknown;
  attempts: unknown;
  max_attempts: unknown;
  next_attempt_at: unknown;
  last_error: unknown;
  created_at: unknown;
  updated_at: unknown;
  finished_at: unknown;
};

export function mapImportJob(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    siteId: row.site_id,
    sourceKind: row.source_kind as ImportJobSource["kind"],
    sourceUrl: row.source_url === null || row.source_url === undefined ? null : String(row.source_url),
    pagePath: row.page_path,
    dryRun: row.dry_run === true,
    status: row.status as ImportJobStatus,
    stage: row.stage,
    progress: toFiniteNumber(row.progress, "progress"),
    attempts: toFiniteNumber(row.attempts, "attempts"),
    maxAttempts: toFiniteNumber(row.max_attempts, "max_attempts"),
    nextAttemptAt: toIso(row.next_attempt_at),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    finishedAt:
      row.finished_at === null || row.finished_at === undefined ? null : toIso(row.finished_at),
  };
}

export type BakeJobRow = {
  id: string;
  site_id: string;
  reason: string;
  paths: unknown;
  status: string;
  attempts: unknown;
  max_attempts: unknown;
  next_attempt_at: unknown;
  lease_until: unknown;
  last_error: unknown;
  created_at: unknown;
  updated_at: unknown;
  finished_at: unknown;
};

export function mapBakeJob(row: BakeJobRow): BakeJob {
  const paths = toJson<string[]>(row.paths);
  return {
    id: row.id,
    siteId: row.site_id,
    reason: row.reason,
    paths: Array.isArray(paths) ? paths : [],
    status: row.status as BakeJobStatus,
    attempts: toFiniteNumber(row.attempts, "attempts"),
    maxAttempts: toFiniteNumber(row.max_attempts, "max_attempts"),
    nextAttemptAt: toIso(row.next_attempt_at),
    leaseUntil:
      row.lease_until === null || row.lease_until === undefined ? null : toIso(row.lease_until),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    finishedAt:
      row.finished_at === null || row.finished_at === undefined ? null : toIso(row.finished_at),
  };
}

// ------------------------------------------------------ image jobs (S2)

export const IMAGE_JOB_COLUMNS =
  "id, site_id, status, request, provider_used, attempts, max_attempts, lease_until, provider_job_id, asset_id, error, created_at, started_at, finished_at, updated_at";

export type ImageJobRow = {
  id: string;
  site_id: string;
  status: string;
  request: unknown;
  provider_used: unknown;
  attempts: unknown;
  max_attempts: unknown;
  lease_until: unknown;
  provider_job_id: unknown;
  asset_id: unknown;
  error: unknown;
  created_at: unknown;
  started_at: unknown;
  finished_at: unknown;
  updated_at: unknown;
};

function timestampOrNull(value: unknown): string | null {
  return typeof value === "string" ? new Date(value).toISOString() : null;
}

export function mapImageJob(row: ImageJobRow): ImageJob {
  const status = IMAGE_JOB_STATUSES.includes(row.status as ImageJobStatus)
    ? (row.status as ImageJobStatus)
    : "failed";
  const attempts = toJson<ImageJobAttempt[]>(row.error);
  return {
    id: row.id,
    siteId: row.site_id,
    status,
    request: toJson<ImageJobRequest>(row.request),
    providerUsed: typeof row.provider_used === "string" ? row.provider_used : null,
    attempts: toFiniteNumber(row.attempts, "attempts"),
    maxAttempts: toFiniteNumber(row.max_attempts, "max_attempts"),
    leaseUntil: timestampOrNull(row.lease_until),
    providerJobId:
      typeof row.provider_job_id === "string" ? row.provider_job_id : null,
    assetId: typeof row.asset_id === "string" ? row.asset_id : null,
    error: Array.isArray(attempts) ? attempts : [],
    createdAt: new Date(String(row.created_at)).toISOString(),
    startedAt: timestampOrNull(row.started_at),
    finishedAt: timestampOrNull(row.finished_at),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
