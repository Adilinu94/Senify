import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Registry } from "@senify/section-sdk";
import { ensureSchema, type Db } from "./db.ts";
import { createRequestHandler } from "./http.ts";
import { PageLocks } from "./locks.ts";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  createUploadSigner,
} from "./media.ts";
import {
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  type RateLimitConfig,
} from "./rate-limit.ts";
import { Store } from "./store.ts";

export { bakePages, buildBakeInput, type BakeBuild, type BakeOutcome } from "./bake.ts";
export {
  hardGuardrailsForTree,
  MAX_PARALLAX_PER_PAGE,
  MAX_PINS_PER_PAGE,
  PARALLAX_PRESETS,
  PIN_PRESETS,
} from "./guardrails.ts";
export { runChecks, type CheckStage } from "./checks.ts";
export { imageDimensions } from "./media.ts";
export { VARIANT_WIDTHS } from "./variants.ts";
export {
  approveReview,
  createPreview,
  discardReview,
  expirePreviews,
  publishRelease,
  requestChanges,
  resolvePreviewFile,
  restoreRevisionAsDraft,
  structureDiff,
  submitReview,
  type CheckSummary,
  type LifecycleContext,
  type SubmitResult,
} from "./lifecycle.ts";
export {
  CreatePreviewBodySchema,
  PublishReleaseBodySchema,
  RestoreRevisionBodySchema,
  ReviewActionBodySchema,
  SubmitReviewBodySchema,
  type CreatePreviewBody,
  type PublishReleaseBody,
  type RestoreRevisionBody,
  type ReviewActionBody,
  type SubmitReviewBody,
} from "./lifecycle-contract.ts";

export { ensureSchema, SCHEMA_STATEMENTS, type Db, type DbClient, type DbResult, type Row } from "./db.ts";
export { createPgDb, type PgDb } from "./pg-db.ts";
export {
  createCollection,
  createCollectionFromFields,
  createEntry,
  listEntries,
  publishEntry,
  purgeEntry,
  rebakeCount,
  resolveEntryPath,
  restoreEntryFromTrash,
  restoreEntryVersionAsDraft,
  searchEntries,
  tickScheduledEntries,
  trashEntry,
  triggerRebake,
  unpublishEntry,
  updateCollection,
  updateEntry,
  type EntryResolution,
  type RebakeTrigger,
  type TickResult,
} from "./content.ts";
export {
  CreateCollectionBodySchema,
  CreateEntryBodySchema,
  EntryActionBodySchema,
  EntryTickBodySchema,
  ENTRY_LIST_SORTS,
  FIELD_DEF_SCHEMAS,
  FromFieldsBodySchema,
  PublishEntryBodySchema,
  SearchEntriesBodySchema,
  UpdateCollectionBodySchema,
  UpdateEntryBodySchema,
  entryConflictError,
  parseEntryListFilters,
  type CreateCollectionBody,
  type CreateEntryBody,
  type EntryActionBody,
  type EntryListFilters,
  type EntryListSort,
  type EntryTickBody,
  type FromFieldsBody,
  type PublishEntryBody,
  type SearchEntriesBody,
  type UpdateCollectionBody,
  type UpdateEntryBody,
} from "./content-contract.ts";
export { createId, newEntityId, newNodeId } from "./ids.ts";
export { PageLocks } from "./locks.ts";
export {
  CreateTokenBodySchema,
  generateToken,
  hashToken,
  McpAuditBodySchema,
  parseBearer,
  parseExpires,
  redactArgs,
  SCOPES,
  type CreateTokenBody,
  type McpAuditBody,
} from "./auth.ts";
export {
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  RateLimitError,
  type RateLimitConfig,
} from "./rate-limit.ts";
export {
  DuplicateSiteBodySchema,
  RenameSiteBodySchema,
  SiteEventBodySchema,
  type DuplicateSiteBody,
  type RenameSiteBody,
  type SiteEventBody,
} from "./site-contract.ts";
export { assertPagePathFormat, draftConflictError, PAGE_PATH_PATTERN } from "./paths.ts";
export { Store, slugify, type CreatePageInput, type CreateSiteInput, type NewAuditEntry } from "./store.ts";
export {
  ENTRY_STATUSES,
  ENTRY_VERSION_RETENTION,
  FIELD_TYPES,
  MEDIA_KINDS,
  PAGE_TEMPLATE_KINDS,
  REVIEW_STATUSES,
  SUPPORTS_FLAGS,
  type ApiToken,
  type AssetUsage,
  type AuditEntry,
  type CellValue,
  type CheckIssue,
  type CheckReport,
  type Collection,
  type Entry,
  type EntryRedirect,
  type EntrySearchHit,
  type EntryStatus,
  type EntryVersion,
  type FieldDef,
  type FieldOption,
  type FieldType,
  type GuardrailViolation,
  type McpAuditEntry,
  type MediaKind,
  type MediaRef,
  type Page,
  type PageMeta,
  type PageRevision,
  type PageSummary,
  type PageTemplate,
  type PageTemplateKind,
  type Preview,
  type PreviewStatus,
  type Release,
  type ReleasePageRevision,
  type RepeaterCell,
  type ReviewComment,
  type ReviewItem,
  type ReviewStatus,
  type RevisionSummary,
  type Site,
  type SiteProfile,
  type SiteTheme,
  type StructureChange,
  type SupportsFlag,
  type TokenRecord,
  type TokenScope,
  SITE_PROFILES,
} from "./types.ts";
export {
  MUTATION_OPS,
  parseApplyMutationsBody,
  parseBody,
  validateShape,
  type ApplyMutationsBody,
  type AuthorInput,
  type Mutation,
  type MutationOp,
  type NodeSpec,
  type OverrideBreakpoint,
  type ParentRef,
  type PatchOp,
  type UpdateThemeBody,
} from "./mutations/contract.ts";
export {
  applyMutations,
  applyUndoBatch,
  type ApplyMutationsOptions,
  type ApplyMutationsOutcome,
  type MutationResult,
  type MutationWarning,
  type UndoBatchInput,
} from "./mutations/apply.ts";
export { applyPatchOp, applyTreePatches } from "./mutations/patches.ts";
export { validateTreeIntegrity, type TreeIntegrityIssue } from "./mutations/integrity.ts";
export {
  buildThemeReport,
  type ThemeReport,
  type ThemeReportBrokenRef,
  type ThemeReportContrast,
  type ThemeReportLiteral,
} from "./theme-report.ts";
export { goldenTreeToMutations, type GoldenPlacement } from "./golden.ts";
export {
  PutPageTemplateBodySchema,
  type PutPageTemplateBody,
} from "./templates-contract.ts";
export {
  composePageTree,
  entryPathFor,
  findEntryTemplate,
  findFirstOutlet,
  findLayout,
  putPageTemplate,
  reindexNodeParents,
  spliceOutlet,
  type ComposeInput,
} from "./templates.ts";
export {
  findListNodes,
  prefetchLists,
  toBindingEntry,
  type ListFilterOp,
  type ListPrefetchResult,
} from "./lists.ts";

export type EngineOptions = {
  db: Db;
  registry: Registry;
  rateLimits?: RateLimitConfig;
  // Previews, release builds and asset files live here (default: SENIFY_DATA_DIR or ~/.senify).
  dataDir?: string;
  // Upload cap in bytes; upload URLs are signed against it (default 25 MB).
  maxUploadBytes?: number;
};

export type EngineServer = {
  origin: string;
  port: number;
  close(): Promise<void>;
};

export type Engine = {
  registry: Registry;
  store: Store;
  locks: PageLocks;
  dataDir: string;
  listen(options?: { port?: number; host?: string }): Promise<EngineServer>;
};

export function defaultDataDir(): string {
  return process.env.SENIFY_DATA_DIR ?? join(homedir(), ".senify");
}

export async function createEngine(options: EngineOptions): Promise<Engine> {
  await ensureSchema(options.db);
  const store = new Store(options.db);
  const locks = new PageLocks();
  const dataDir = options.dataDir ?? defaultDataDir();
  const handler = createRequestHandler({
    store,
    registry: options.registry,
    locks,
    rateLimiter: new RateLimiter(options.rateLimits ?? DEFAULT_RATE_LIMITS),
    dataDir,
    maxUploadBytes: options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES,
    // Per-process secret: pending upload URLs survive only this engine run,
    // which matches their short TTL.
    uploadSigner: createUploadSigner(randomBytes(32).toString("base64url")),
  });
  return {
    registry: options.registry,
    store,
    locks,
    dataDir,
    async listen(listenOptions?: { port?: number; host?: string }): Promise<EngineServer> {
      const server = createServer(handler);
      const host = listenOptions?.host ?? "127.0.0.1";
      const port = listenOptions?.port ?? 0;
      await new Promise<void>((resolve, reject) => {
        const onError = (error: unknown): void => reject(error);
        server.once("error", onError);
        server.listen(port, host, () => {
          server.removeListener("error", onError);
          resolve();
        });
      });
      const address = server.address();
      const actualPort =
        typeof address === "object" && address !== null ? address.port : port;
      const originHost = host === "0.0.0.0" ? "127.0.0.1" : host;
      return {
        origin: `http://${originHost}:${actualPort}`,
        port: actualPort,
        close: () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error);
              else resolve();
            });
          }),
      };
    },
  };
}
