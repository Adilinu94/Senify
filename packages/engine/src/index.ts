import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Registry } from "@senify/section-sdk";
import { ensureSchema, type Db } from "./db.ts";
import { createFormSigner } from "./forms.ts";
import { createRequestHandler } from "./http.ts";
import type { MailSender } from "./mailer.ts";
import { PageLocks } from "./locks.ts";
import { MaintenanceGate } from "./maintenance.ts";
import type { ReviewVisualDriver } from "./review-visuals.ts";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  createUploadSigner,
} from "./media.ts";
import { referenceDepsFromEnv, type ReferenceDeps } from "./references-lifecycle.ts";
import {
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  type RateLimitConfig,
} from "./rate-limit.ts";
import { Store } from "./store.ts";

export { bakePages, buildBakeInput, renderEntryPreview, type BakeBuild, type BakeOutcome } from "./bake.ts";
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
export { MaintenanceError, MaintenanceGate } from "./maintenance.ts";
export {
  bakedRouteFile,
  createReviewVisualDriver,
  persistReviewVisuals,
  reviewVisualFileNames,
  type ReviewVisualBreakpoint,
  type ReviewVisualCapture,
  type ReviewVisualDriver,
  type ReviewVisualPage,
  type ReviewVisualRequest,
} from "./review-visuals.ts";
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
  NEWSLETTER_TOKEN_KINDS,
  NOTIFICATION_STATUSES,
  PAGE_TEMPLATE_KINDS,
  REFERENCE_COLLECTION_KINDS,
  REFERENCE_LIST_SORTS,
  REFERENCE_ORIGINS,
  REFERENCE_STATUSES,
  REVIEW_STATUSES,
  SUPPORTS_FLAGS,
  type ReferenceBrief,
  type ReferenceBriefView,
  type ReferenceCollection,
  type ReferenceCollectionExample,
  type ReferenceCollectionKind,
  type ReferenceCollectionListView,
  type ReferenceDna,
  type ReferenceListView,
  type ReferenceListSort,
  type ReferenceOrigin,
  type ReferencePreferences,
  type ReferenceSettings,
  type ReferenceStyleCatalogInfo,
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
  type FormSnapshotRecord,
  type GuardrailViolation,
  type McpAuditEntry,
  type MediaKind,
  type MediaRef,
  type NewsletterToken,
  type NewsletterTokenKind,
  type NotificationMessage,
  type NotificationStatus,
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
  type SubmissionRow,
  type SupportsFlag,
  type TokenRecord,
  type TokenScope,
  SITE_PROFILES,
  SMTP_TLS_MODES,
  type EngineSettings,
  type SmtpSettings,
  type SmtpSettingsRecord,
  type SmtpTlsMode,
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
export {
  rebakePathsForCollection,
  rebakePathsForEntry,
  rebakePathsForPage,
} from "./rebake.ts";
export {
  backoffMs,
  buildSubmissionsCsv,
  checkForms,
  collectionFieldsForForm,
  confirmNewsletter,
  createCollectionFromForm,
  createFormSigner,
  DEFAULT_CONFIRM_TTL_HOURS,
  devTransport,
  fieldTypeFor,
  FORM_AUTO_KEYS,
  FORM_AUTHOR,
  FormRejection,
  listSiteForms,
  listSubmissions,
  MAX_NOTIFICATION_ATTEMPTS,
  MIN_FILL_MS,
  planCollectionFromForm,
  stampFormsForBuild,
  submitForm,
  tickNotifications,
  unsubscribeNewsletter,
  type FormRejectionReason,
  type FormSigner,
  type FormSubmitInput,
  type FormSubmitResult,
  type FormTokenPayload,
  type NewsletterTransition,
  type NotificationTickResult,
  type NotificationTransport,
  type OutboundMessage,
  type SiteFormSummary,
  type SubmissionColumn,
  type SubmissionView,
} from "./forms.ts";
export {
  FormCollectionCreateBodySchema,
  FormCollectionPlanBodySchema,
  FormTickBodySchema,
  type FormCollectionCreateBody,
  type FormCollectionPlanBody,
  type FormTickBody,
} from "./forms-contract.ts";
export {
  capEvidenceLevel,
  evidenceClaim,
  evidenceRank,
  isEvidenceLevel,
  markConflicts,
  mergeEvidence,
  tokenClaim,
  weakestEvidenceLevel,
} from "./references-evidence.ts";
export {
  detectGpu,
  extractReference,
  motionToRecipes,
  type CaptureInput,
  type MarkupSignals,
  type ReferenceExtraction,
} from "./references-extract.ts";
export {
  buildStyleBrief,
  clampAnalyzerOutput,
  classifyFamilies,
  createLlmReferenceAnalyzer,
  heuristicAnalyzer,
  parseAnalyzerJson,
  REFERENCE_FAMILIES,
  referenceAdherenceIssues,
  rulesForFamilies,
  type AnalyzerOutput,
  type ReferenceAnalyzer,
  type ReferenceLlmConfig,
} from "./references-analyze.ts";
export { buildReferenceProfile, normalizeVocabulary } from "./references.ts";
export {
  deriveThemeDraft,
  materializeThemeDraft,
  verifyThemeRoundTrip,
  type ReferenceAssignmentInput,
  type ReferenceThemeDraft,
  type ThemeDraftVerification,
} from "./references-theme.ts";
export {
  analyzeReference,
  applyReference,
  createPlaywrightCaptureDriver,
  deleteReference,
  editReferenceProfile,
  persistReferenceSnapshots,
  REFERENCE_BREAKPOINTS,
  ReferenceCaptureError,
  referenceAdherenceForSite,
  referenceBackoffMs,
  referenceDepsFromEnv,
  referenceThemeDraft,
  removeReferenceAssignment,
  runDueReferenceJobs,
  runReferenceJob,
  verifyReferenceApply,
  type CaptureResult,
  type CapturedScreenshot,
  type ReferenceCaptureDriver,
  type ReferenceCaptureFailure,
  type ReferenceContext,
  type ReferenceDeps,
  type ReferenceTickResult,
} from "./references-lifecycle.ts";
export {
  buildCollectionBrief,
  buildImagePrompt,
  buildPreferenceBlock,
  buildReferenceBrief,
  preferenceStatus,
  referenceBriefSection,
  referenceScreenshotPath,
} from "./references-brief.ts";
export {
  createManualReference,
  decodeReferenceImage,
  referenceStyleCatalogInfo,
  seedReferenceStyles,
  type DecodedReferenceImage,
  type ReferenceStyleSeedResult,
} from "./references-library.ts";
export {
  REFERENCE_STYLE_CATALOG,
  type ReferenceStyleFamily,
} from "./references-styles.ts";
export {
  BACKUP_VERSION,
  backupStatus,
  createBackup,
  listBackups,
  resolveBackupDir,
  restoreBackup,
  type BackupManifest,
  type BackupRun,
  type BackupStatus,
  type BackupSummary,
  type RestoreResult,
} from "./backup.ts";
export {
  sendTestMail,
  SmtpError,
  smtpMailSender,
  type MailMessage,
  type MailSender,
  type SmtpConfig,
  type SmtpFailureReason,
  type TestMailFailureReason,
  type TestMailResult,
} from "./mailer.ts";
export {
  ReferenceDnaBodySchema,
  ReferencePreferencesBodySchema,
  TestMailBodySchema,
  UpdateSettingsBodySchema,
  type ReferenceDnaBody,
  type ReferencePreferencesBody,
  type TestMailBody,
  type UpdateSettingsBody,
} from "./settings-contract.ts";
export {
  CreateReferenceCollectionBodySchema,
  MANUAL_REFERENCE_BODY_LIMIT_BYTES,
  MANUAL_REFERENCE_MAX_BYTES,
  ManualReferenceBodySchema,
  parseReferenceListFilters,
  ReferenceBriefBodySchema,
  referenceFooterText,
  UpdateReferenceBodySchema,
  UpdateReferenceCollectionBodySchema,
  type CreateReferenceCollectionBody,
  type ManualReferenceBody,
  type ReferenceBriefBody,
  type ReferenceListFilters,
  type UpdateReferenceBody,
  type UpdateReferenceCollectionBody,
} from "./references-contract.ts";

export type EngineOptions = {
  db: Db;
  registry: Registry;
  rateLimits?: RateLimitConfig;
  // Previews, release builds and asset files live here (default: SENIFY_DATA_DIR or ~/.senify).
  dataDir?: string;
  // Upload cap in bytes; upload URLs are signed against it (default: 25 MB).
  maxUploadBytes?: number;
  // Public base URL the stamped form action points at (default: same origin).
  formsBaseUrl?: string;
  // Settings (T12): the mail sender for test mails and the outbox. Tests pass a
  // double; production uses the real SMTP client.
  mailSender?: MailSender;
  // References (T14): capture driver, analyzer and LLM config. Default: live
  // Playwright capture plus the heuristic analyzer (or the LLM when
  // SENIFY_LLM_ENDPOINT/-MODEL are configured).
  referenceDeps?: ReferenceDeps;
  // Review visuals (T07): screenshots, diffs and the motion video of a
  // submit. Off unless a driver is passed (production and visual tests).
  reviewVisuals?: ReviewVisualDriver;
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
  // Maintenance window of the running engine (T12 restore).
  maintenance: MaintenanceGate;
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
  const maintenance = new MaintenanceGate();
  const dataDir = options.dataDir ?? defaultDataDir();
  // The signer secret is persisted, so tokens stamped into static HTML keep
  // verifying after a restart.
  const formSigner = createFormSigner(await store.getOrCreateFormSecret());
  const handler = createRequestHandler({
    store,
    registry: options.registry,
    locks,
    maintenance,
    rateLimiter: new RateLimiter(options.rateLimits ?? DEFAULT_RATE_LIMITS),
    dataDir,
    maxUploadBytes: options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES,
    // Per-process secret: pending upload URLs survive only this engine run,
    // which matches their short TTL.
    uploadSigner: createUploadSigner(randomBytes(32).toString("base64url")),
    formSigner,
    // Forms are public: a separate, tight bucket per IP (and IP+form).
    formRateLimiter: new RateLimiter({
      perMinute: 20,
      burst: 5,
      destructivePerMinute: 5,
    }),
    referenceDeps: options.referenceDeps ?? referenceDepsFromEnv(process.env),
    ...(options.reviewVisuals === undefined
      ? {}
      : { visuals: options.reviewVisuals }),
    ...(options.mailSender === undefined ? {} : { mailSender: options.mailSender }),
    ...(options.formsBaseUrl === undefined
      ? {}
      : { formBaseUrl: options.formsBaseUrl }),
  });
  return {
    registry: options.registry,
    store,
    locks,
    maintenance,
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
