import {
  MOTION_PROFILES,
  type Author,
  type MotionProfile,
  type NodeTree,
} from "@senify/section-sdk";
import type { FormSnapshot } from "@senify/renderer";
import type { Theme } from "@senify/tokens";
import type { StyleRule } from "@senify/widget-engine";
import type { Breakpoints } from "@senify/widget-engine/breakpoints";
import type { PatchOp } from "./mutations/contract.ts";
import type { ImportReport } from "./imports-contract.ts";

// The profile union lives in the section SDK (ticket 21/19): the editor needs
// the same table, and the engine must not be the only source. Re-exported here
// so the existing engine imports stay valid.
export type SiteProfile = MotionProfile;

export const SITE_PROFILES: readonly SiteProfile[] = MOTION_PROFILES;

export type Site = {
  id: string;
  name: string;
  slug: string;
  profile: SiteProfile;
  themeId: string | null;
  // Design-DNA per project (E26, R9): the never-rules are hard for agents in
  // the write path, a warning for humans. Derived from the assigned references
  // or set by hand; absent when no references are assigned and nothing was set.
  designContract?: DesignContract;
  // The public origin visitors open the site under (https, no path). Feeds
  // canonical/og:url/sitemap/robots and the form origin check; absent means the
  // `<slug>.senify.xyz` placeholder.
  baseUrl?: string;
  // The site's own breakpoint pair (ADR-0020): below `tablet` the tablet layout
  // applies, below `mobile` the mobile one. Absent means the platform default
  // (1024 / 640). Read by the bake, the preview and the editor frames alike.
  breakpoints?: Breakpoints;
  createdAt: string;
  updatedAt: string;
};

// The enforceable part of the DNA: constants describe intent (brief material),
// never rules map to measurable patterns and block agent writes.
export type DesignContract = {
  constants: string[];
  never: string[];
  vocabulary: string[];
  source: "references" | "manual";
  updatedAt: string;
};

export type DesignContractViolation = {
  nodeId: string;
  rule: string;
  code: string;
  message: string;
  suggestion: string;
};

export type PageMeta = {
  title?: string;
  description?: string;
  ogImage?: string;
};

// A page marked as a template: `layout` wraps other pages, `collection` is the
// entry template for the detail routes of its collections (artifacts/23 §1).
export type PageTemplate =
  | { kind: "layout"; label: string }
  | { kind: "collection"; collectionIds: string[]; priority: number };

export const PAGE_TEMPLATE_KINDS = ["layout", "collection"] as const;
export type PageTemplateKind = (typeof PAGE_TEMPLATE_KINDS)[number];

export type Page = {
  id: string;
  siteId: string;
  path: string;
  title: string;
  meta: PageMeta;
  draft: NodeTree;
  draftVersion: number;
  template: PageTemplate | null;
  layoutId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageSummary = Omit<Page, "draft">;

export type SiteTheme = {
  id: string;
  siteId: string;
  name: string;
  version: number;
  theme: Theme;
  css: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditEntry = {
  id: string;
  siteId: string;
  pageId: string | null;
  batchId: string;
  opIndex: number;
  mutation: string;
  params: Record<string, unknown>;
  author: Author;
  undoPatch: PatchOp[];
  draftVersionAfter: number;
  createdAt: string;
};

export type TokenScope = "read" | "write" | "publish";

// Who a token acts as (ticket 18): the program's own token (dashboard) is a
// human operator, `senify setup` hands the agent its own token. The audit
// author is derived from this field server-side; the body can never fake it.
export type TokenKind = "human" | "agent";

export type ApiToken = {
  id: string;
  name: string;
  kind: TokenKind;
  scopes: TokenScope[];
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type TokenRecord = ApiToken & {
  tokenHash: string;
};

export type McpAuditEntry = {
  id: string;
  tokenId: string | null;
  client: string;
  tool: string;
  args: Record<string, unknown>;
  result: "ok" | "error";
  entity: string | null;
  durationMs: number;
  createdAt: string;
};

export type PageRevision = {
  id: string;
  pageId: string;
  siteId: string;
  title: string;
  path: string;
  tree: NodeTree;
  author: Author;
  note: string | null;
  createdAt: string;
};

export type RevisionSummary = Omit<PageRevision, "tree"> & {
  nodeCount: number;
};

export type ReleasePageRevision = {
  pageId: string;
  path: string;
  revisionId: string;
};

// The release manifest (E2): what a release was baked with, beyond the page
// revisions and the theme snapshot. The style registry is captured so a
// rollback restores it and the output stays reproducible for the same renderer
// version; the build hash proves it.
//
// P3-4 (R7) closes the gap that sentence used to excuse. `assets` and
// `entries` were "deliberately not frozen", so a rollback restored the styling
// of a site whose media library and content had moved on: the pages came back
// pointing at assets that no longer exist, or at different ones. The snapshots
// below are what the release NEEDED, captured at publish time as values, not as
// references - a reference would be re-read on rollback and describe the present
// instead of the past.
export type ReleaseManifest = {
  styleRules: StyleRule[];
  rendererVersion: string;
  buildHash: string;
  capturedAt: string;
  // The date stamped into `sitemap.xml`; a rollback re-uses the restored
  // release's date, so the rebuilt output stays byte-identical.
  siteDate: string;
  // Every asset the release's pages actually reference, frozen: id, file name,
  // mime, size, hash and the storage path. The hash is what a deploy check
  // compares, because a same-named file with different bytes is a changed
  // asset. An asset deleted since the release is still listed - that is the
  // whole point, and the rollback restores it from the snapshot rather than
  // discovering its absence at bake time.
  assets: ReleaseAssetSnapshot[];
  // The library components the release's pages instantiate, frozen. A component
  // that was upgraded or uninstalled afterwards would otherwise change a page
  // that was supposed to stay as published.
  components: ReleaseComponentSnapshot[];
  // The code payloads the release bakes, frozen per payload. The island
  // "promotion" flow in ADR-0010 means a live payload can move between a
  // proposal and a published carrier; the snapshot records which state this
  // release was built from, so a rollback restores the distinction.
  payloads: ReleasePayloadSnapshot[];
  // The CMS entries the release published, frozen with their published
  // revision. "Published" is part of the snapshot on purpose: an entry that was
  // edited but never published belongs to the NEXT release, not to this one.
  entries: ReleaseEntrySnapshot[];
  // The frozen design measurement this release was published against
  // (Fahrplan P2-4, R4). A reference, not a copy: the report itself lives in
  // `design_records` and stays readable after the draft has moved on, so the
  // manifest never has to be rewritten to keep a promise about the past.
  designRecordId: string | null;
  // The score the release was published with, copied in so a reader of the
  // manifest alone can see the number that opened the gate without a second
  // lookup. The record above is the authority; this is the convenience.
  designScore: number | null;
  designVerdict: "green" | "hint" | "gate" | null;
  // A content re-bake creates a new release; the old release stays immutable.
  rebakedFrom?: string;
  // Rollback copies: the release this one was restored from.
  restoredFrom?: string;
};

// What a rollback needs to put a referenced asset back: the row's fields, plus
// the storage path so the file can be found again. Deliberately small - the
// manifest is read on every rollback, and a fat one is a fat backup.
export type ReleaseAssetSnapshot = {
  id: string;
  siteId: string;
  filename: string;
  mime: string;
  kind: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  hash: string;
  altText: string | null;
  decorative: boolean;
  folderId: string | null;
  tags: string[];
  storageRef: string;
};

export type ReleaseComponentSnapshot = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  // The definition as it was when this release shipped. An upgraded component
  // must not silently change a published page.
  definition: unknown;
  fingerprint: string;
  version: number;
};

export type ReleasePayloadSnapshot = {
  id: string;
  name: string;
  kind: string;
  bytes: number;
  // The integrity hash the deploy check compares. A same-named payload with
  // different bytes is a different payload.
  integrity: string;
  version: number;
  // ADR-0010 distinguishes a proposal from a published carrier, and a rollback
  // has to restore which of the two it was.
  provenance: unknown;
  license: unknown;
};

export type ReleaseEntrySnapshot = {
  id: string;
  collection: string;
  path: string;
  slug: string;
  // The revision that was live at publish. Not "the current one" - a rollback
  // that picked up a later draft entry would publish text nobody reviewed.
  revisionId: string;
  title: string;
  publishedAt: string;
};

export type Release = {
  id: string;
  siteId: string;
  pageRevisions: ReleasePageRevision[];
  themeSnapshot: unknown;
  buildRef: string | null;
  manifest: ReleaseManifest | null;
  author: Author;
  note: string | null;
  basisReleaseId: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------- deploy (E14)

// The first deploy adapter copies the active release's build into a static
// target directory. "netlify" ships the same build to a hosted site through
// the Netlify API (file digest + uploads); the token sits encrypted in the
// deploy settings. The provider seam stays open for further hosts.
export const DEPLOY_PROVIDERS = ["static", "netlify", "vercel"] as const;
export type DeployProvider = (typeof DEPLOY_PROVIDERS)[number];

export const DEPLOYMENT_STATUSES = ["running", "succeeded", "failed"] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export type Deployment = {
  id: string;
  siteId: string;
  releaseId: string;
  provider: DeployProvider;
  status: DeploymentStatus;
  target: string;
  fileCount: number;
  byteSize: number;
  error: string | null;
  author: Author;
  createdAt: string;
  finishedAt: string | null;
};

// Deploy settings per site (E14): where a hosted provider delivers. The
// token stays encrypted at rest and never leaves the engine in plaintext
// (only `hasToken` leaves, like the SMTP password and the image API key).
export type DeploySettings = {
  provider: DeployProvider;
  // Netlify: the site id (API id, not the name) of the target site.
  netlifySiteId: string | null;
  hasNetlifyToken: boolean;
  // Vercel: the project name (or id) of the target project.
  vercelProjectId: string | null;
  hasVercelToken: boolean;
  updatedAt: string;
};

export type PreviewStatus = "ready" | "failed" | "expired";

export type Preview = {
  id: string;
  siteId: string;
  buildRef: string;
  token: string;
  status: PreviewStatus;
  createdBy: Author;
  createdAt: string;
  expiresAt: string;
};

export type ReviewStatus =
  | "submitted"
  | "in_review"
  | "approved"
  | "changes_requested"
  | "discarded";

export const REVIEW_STATUSES: readonly ReviewStatus[] = [
  "submitted",
  "in_review",
  "approved",
  "changes_requested",
  "discarded",
];

export type ReviewComment = {
  at: string;
  author: Author;
  note: string;
};

// Redesign proposals (ADR-0012). `applying` is a durable claim: the human
// decision is stored before the first effect, so a crash leaves a visible
// "running or unfinished" state instead of a silently repeated apply.
// `expired` is the fourth end state a proposal can reach on its own: an
// undecided proposal ages out (Fahrplan P2-3, R2). It is never deleted, because
// "the human never chose" is a fact worth keeping, and an apply on an expired
// proposal must fail with a conflict rather than half-write.
export type RedesignProposalStatus =
  | "proposed"
  | "applying"
  | "applied"
  | "failed"
  | "expired";

export const REDESIGN_PROPOSAL_STATUSES: readonly RedesignProposalStatus[] = [
  "proposed",
  "applying",
  "applied",
  "failed",
  "expired",
];

export type GuardrailViolation = {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
  suggestion?: string;
};

export type StructureChange = {
  pageId: string;
  path: string;
  status: "added" | "removed" | "changed" | "unchanged";
  sections: {
    nodeId: string;
    type: string;
    change: "added" | "removed" | "changed";
    fields: string[];
  }[];
};

export type ReviewItem = {
  id: string;
  siteId: string;
  previewId: string | null;
  baseState: { pageId: string; tree: NodeTree; title: string; path: string }[];
  pages: string[];
  author: Author;
  status: ReviewStatus;
  structureDiff: StructureChange[];
  guardrails: { hard: GuardrailViolation[]; soft: GuardrailViolation[] };
  thread: ReviewComment[];
  importReports: ImportReport[];
  // Visual artifacts of the submit (T07): screenshots per breakpoint, pixel
  // diffs against the active release and a motion video when motion changed.
  visuals: ReviewVisuals | null;
  releaseId: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type ReviewVisualAsset = {
  pageId: string;
  path: string;
  role: "before" | "after";
  breakpoint: string;
  width: number;
  height: number;
  bytes: number;
  storageRef: string;
  previewPath: string;
};

export type ReviewVisualDiff = {
  pageId: string;
  breakpoint: string;
  changedPixels: number;
  ratio: number;
  bounds: { left: number; top: number; right: number; bottom: number } | null;
  storageRef: string;
  previewPath: string;
};

export type ReviewVisuals = {
  capturedAt: string;
  assets: ReviewVisualAsset[];
  diffs: ReviewVisualDiff[];
  video?: {
    durationMs: number;
    bytes: number;
    storageRef: string;
    previewPath: string;
  };
  // Why a capture stayed out (browser missing, page unreachable, ...); the
  // review itself is never blocked by visuals.
  note?: string;
};

export type CheckIssue = {
  code: string;
  severity: "hard" | "soft";
  message: string;
  pageId?: string;
  nodeId?: string;
  field?: string;
  suggestion?: string;
};

export type CheckReport = {
  stage: "write" | "submit" | "publish";
  hard: CheckIssue[];
  soft: CheckIssue[];
};

export const ASSET_KINDS: readonly AssetKind[] = ["image", "video", "document"];
export type AssetKind = "image" | "video" | "document";

export const ASSET_VARIANT_FORMATS: readonly AssetVariantFormat[] = [
  "avif",
  "webp",
];
export type AssetVariantFormat = "avif" | "webp";

// One encoded ladder rung of an image asset (AVIF or WebP at a fixed width).
export type AssetVariant = {
  id: string;
  assetId: string;
  width: number;
  format: AssetVariantFormat;
  storageRef: string;
  byteSize: number;
  createdAt: string;
};

export type AssetStatus = "ready" | "trashed";

// "missing" is never stored: it marks an assetId that has no record at all.
export type AssetReferenceStatus = "ready" | "trashed" | "missing";

// Imported foreign code (ADR-0010). The row keeps the bundle; the read type
// deliberately does not (a payload is code, not a prop — the bake asks for it
// explicitly via `getCodePayloadBundle`). `integrity` is the SHA-256 of the
// bundle and part of the emitted file name, so a changed payload is a changed
// URL and therefore a new build.
export type CodePayloadKind = "module" | "webgl-scene";

export type CodePayloadProvenance = {
  kind: "framer-import" | "upload" | "hand";
  sourceUrl: string | null;
  pagePath: string | null;
  irHash: string | null;
  capturedAt: string | null;
};

// ADR-0010 §4: the licence is mandatory and may be `unknown` — but it is then
// visible (import report, release manifest, library) and blocks promotion into
// the global component library.
export type CodePayloadLicense = {
  id: string;
  note: string | null;
  assertedBy: string | null;
};

export type CodePayload = {
  id: string;
  siteId: string;
  name: string;
  kind: CodePayloadKind;
  bytes: number;
  integrity: string;
  version: number;
  provenance: CodePayloadProvenance;
  license: CodePayloadLicense;
  createdAt: string;
  updatedAt: string;
};

export type LibraryLicense = {
  id: string;
  note: string | null;
  status: "verified" | "unknown";
};

export type LibraryProvenance = {
  kind: "framer-import" | "hand";
  sourceUrl: string | null;
  pagePath: string | null;
  irHash: string | null;
};

export type LibraryComponent = {
  id: string;
  name: string;
  slug: string;
  kind: "frame" | "section" | "component";
  definition: NodeTree;
  fingerprint: string;
  tags: string[];
  provenance: LibraryProvenance;
  license: LibraryLicense;
  notes: string;
  version: number;
  deprecatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LibraryInstall = {
  id: string;
  siteId: string;
  componentId: string;
  installedVersion: number;
  mode: "linked" | "copied";
  createdAt: string;
  updatedAt: string;
};

export type LibraryAuditEntry = {
  componentId: string;
  siteId: string | null;
  action: "created" | "updated" | "installed" | "updated-install" | "detached" | "deprecated";
  author: Author;
  createdAt: string;
};

// Framer import (plan S3): a job row is the durable protocol of one import run
// — same shape as `ReferenceJob`, plus the source description and the final
// report (`result`) so clients poll instead of re-running.
export type ImportJobStatus = "queued" | "running" | "succeeded" | "failed";

export type ImportJobSource = {
  kind: "url" | "mirror" | "html";
  // `url`: the page to fetch; `mirror`: a local folder on the operator's
  // machine (the engine is a local program); `html`: the raw SSR markup.
  url: string | null;
  rootDir: string | null;
  html: string | null;
  // The base for relative asset URLs (mirror/html sources without a URL).
  baseUrl: string | null;
};

export type ImportJob = {
  id: string;
  siteId: string;
  sourceKind: ImportJobSource["kind"];
  sourceUrl: string | null;
  pagePath: string;
  dryRun: boolean;
  status: ImportJobStatus;
  stage: string;
  progress: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type ImportReceipt = {
  id: string;
  siteId: string;
  jobId: string;
  contentKey: string;
  requestFingerprint: string;
  pageId: string;
  draftVersion: number;
  result: Record<string, unknown>;
  createdAt: string;
};

export type Asset = {
  id: string;
  siteId: string;
  filename: string;
  mime: string;
  kind: AssetKind;
  byteSize: number;
  width: number | null;
  height: number | null;
  hash: string;
  altText: string | null;
  decorative: boolean;
  folderId: string | null;
  tags: string[];
  storageRef: string;
  status: AssetStatus;
  // Derived image data: the encoded ladder and the placeholder hash. Empty for
  // non-image assets and for images the encoder could not process.
  variants: AssetVariant[];
  blurhash: string | null;
  createdAt: string;
  updatedAt: string;
  replacedAt: string | null;
  trashedAt: string | null;
};

export type AssetFolder = {
  id: string;
  siteId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

export type AssetHistoryEntry = {
  id: string;
  assetId: string;
  storageRef: string;
  mime: string;
  byteSize: number;
  createdAt: string;
};

// Full update shape for the store; every unset branch keeps the stored value.
export type AssetUpdate = {
  filename?: string;
  mime?: string;
  kind?: AssetKind;
  byteSize?: number;
  width?: number | null;
  height?: number | null;
  hash?: string;
  altText?: string | null;
  decorative?: boolean;
  folderId?: string | null;
  tags?: string[];
  storageRef?: string;
  status?: AssetStatus;
  replacedAt?: string | null;
  trashedAt?: string | null;
  updatedAt?: string;
};

// What the check pipeline needs to know about an asset.
export type AssetUsage = {
  status: AssetReferenceStatus;
  decorative: boolean;
};

export type AssetBulkResult = {
  updated: number;
  failed: { id: string; reason: string }[];
};

// ------------------------------------------------------- content (T09)

// The 16 field types of the v1 field system (artifacts/22 §"Feldsystem v1").
export const FIELD_TYPES = [
  "text",
  "longText",
  "richtext",
  "number",
  "boolean",
  "date",
  "dateTime",
  "select",
  "multiSelect",
  "url",
  "email",
  "media",
  "mediaMulti",
  "relation",
  "relationMulti",
  "repeater",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

// Feature flags per collection (default: all five).
export const SUPPORTS_FLAGS = [
  "drafts",
  "versions",
  "scheduling",
  "seo",
  "search",
] as const;
export type SupportsFlag = (typeof SUPPORTS_FLAGS)[number];

export const ENTRY_STATUSES = [
  "draft",
  "published",
  "unpublished",
  "scheduled",
] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const MEDIA_KINDS = ["image", "video", "any"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const ENTRY_VERSION_RETENTION = 50;

export type FieldOption = { value: string; label: string };

export type MediaRef = {
  assetId: string;
  focal?: { x: number; y: number } | null;
};

// Repeater items carry a stable id so add/remove/move never rewrites cells.
export type RepeaterCell = { id: string; cells: Record<string, CellValue> };

export type CellValue =
  | string
  | number
  | boolean
  | MediaRef
  | MediaRef[]
  | string[]
  | RepeaterCell[]
  | null;

export type FieldDef = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  // Agent-readable by contract: the field stays usable without the UI.
  description: string;
  required?: boolean;
  defaultValue?: CellValue;
  unique?: boolean;
  // Deprecation instead of removal: old cells survive, editors hide the field.
  deprecated?: boolean;
  options?: FieldOption[];
  targetCollections?: string[];
  subFields?: FieldDef[];
  mediaKind?: MediaKind;
};

export type Collection = {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  fields: FieldDef[];
  titleField: string;
  dateField: string | null;
  urlPattern: string | null;
  supports: SupportsFlag[];
  listColumns: string[];
  description: string | null;
  deprecatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Entry = {
  id: string;
  siteId: string;
  collectionId: string;
  slug: string;
  status: EntryStatus;
  cells: Record<string, CellValue>;
  activeVersionId: string | null;
  version: number;
  author: Author;
  publishedAt: string | null;
  scheduledAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Immutable snapshot, written on publish only.
export type EntryVersion = {
  id: string;
  entryId: string;
  siteId: string;
  versionNumber: number;
  cells: Record<string, CellValue>;
  slug: string;
  status: EntryStatus;
  publishedBy: Author;
  createdAt: string;
};

// Slug history of a collection: old path → new path (301).
export type EntryRedirect = {
  id: string;
  siteId: string;
  collectionId: string;
  fromPath: string;
  toPath: string;
  createdAt: string;
};

export type EntrySearchHit = { entry: Entry; score: number };

// ------------------------------------------------------------- forms (T11)

export const NOTIFICATION_STATUSES = ["queued", "sent", "failed"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

// One frozen form definition per bake; the signed token points at a snapshot.
export type FormSnapshotRecord = {
  id: string;
  formId: string;
  siteId: string;
  pageId: string;
  nodeId: string;
  pagePath: string;
  sectionType: string;
  snapshot: FormSnapshot;
  createdAt: string;
};

export type NotificationMessage = {
  id: string;
  siteId: string;
  formId: string | null;
  entryId: string | null;
  kind: string;
  recipient: string;
  subject: string;
  body: string;
  status: NotificationStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

export const NEWSLETTER_TOKEN_KINDS = ["confirm", "unsubscribe"] as const;
export type NewsletterTokenKind = (typeof NEWSLETTER_TOKEN_KINDS)[number];

export type NewsletterToken = {
  token: string;
  siteId: string;
  formId: string;
  entryId: string;
  email: string;
  kind: NewsletterTokenKind;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  usedAt: string | null;
};

// A submission row for the view/CSV: the entry plus its mapped human values.
export type SubmissionRow = {
  entryId: string;
  slug: string;
  status: EntryStatus;
  createdAt: string;
  submittedAt: string | null;
  sourcePath: string | null;
  values: { key: string; label: string; value: string }[];
};

// -------------------------------------------------------- references (T14)

export const REFERENCE_STATUSES = ["analyzing", "ready", "failed"] as const;
export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number];

export const REFERENCE_JOB_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
] as const;
export type ReferenceJobStatus = (typeof REFERENCE_JOB_STATUSES)[number];

// Re-bake jobs (E12, slice 1): a durable outbox instead of the trigger stub.
// A job carries the affected paths (the dependency index computes them), is
// claimed with a lease (crash recovery), retried with backoff and keeps its
// error as the end state.
export const BAKE_JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export type BakeJobStatus = (typeof BAKE_JOB_STATUSES)[number];

export type BakeJob = {
  id: string;
  siteId: string;
  reason: string;
  // The routes the change affects (dependency index); the worker records them
  // and, for now, re-bakes the site.
  paths: string[];
  status: BakeJobStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseUntil: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

// Evidence levels of the pipeline (research/29 §3): measured at runtime,
// observed in a sweep, or guessed from markup. Never upgraded.
export const EVIDENCE_LEVELS = ["confirmed", "observed", "inferred"] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

// The scales a reference can be assigned to a project (artifacts/28 §3).
export const REFERENCE_SCALES = ["color", "type", "motion", "rest"] as const;
export type ReferenceScale = (typeof REFERENCE_SCALES)[number];

export type ReferenceEvidence = {
  claim: string;
  level: EvidenceLevel;
  source: string;
  conflictWith?: string;
};

// One frequency-ranked value with its Belegstellen (research/29 §2.3).
export type ReferenceToken = {
  value: string;
  uses: number;
  where: string[];
  role: string | null;
  level: EvidenceLevel;
};

export type ReferenceTypeStep = {
  role: string;
  size: string;
  lineHeight: string | null;
  weight: number | null;
  uses: number;
  where: string[];
  level: EvidenceLevel;
};

// Reveal/effect inventory with the exact runtime params, mapped to the
// preset catalog of artifacts/03 (`preset: null` = not in the v1 catalog).
export type ReferenceMotionRecipe = {
  name: string;
  preset: string | null;
  trigger: string;
  params: Record<string, string>;
  mechanism: string;
  uses: number;
  where: string[];
  level: EvidenceLevel;
};

export type ReferenceSurface = {
  kind: "canvas" | "video" | "svg" | "iframe" | "webgl" | "webgpu" | "css";
  detail: string;
  level: EvidenceLevel;
  note: string | null;
};

export type ReferenceAsset = {
  kind: "image" | "logo" | "font" | "video" | "icon";
  ref: string;
  where: string[];
  identityRisk: boolean;
};

export type ReferenceComponent = {
  name: string;
  variants: string[];
  evidence: EvidenceLevel;
};

export type ReferenceGuardrailFinding = {
  code: string;
  severity: "hard" | "soft";
  message: string;
  suggestion: string;
  field?: string;
};

export type ReferenceCustomProperty = {
  name: string;
  value: string;
  role: string | null;
};

export type ReferenceProfile = {
  tokens: {
    color: ReferenceToken[];
    type: ReferenceTypeStep[];
    families: ReferenceToken[];
    space: ReferenceToken[];
    radius: ReferenceToken[];
    shadow: ReferenceToken[];
  };
  breakpoints: number[];
  customProperties: ReferenceCustomProperty[];
  motion: ReferenceMotionRecipe[];
  surfaces: ReferenceSurface[];
  libraries: string[];
  assets: ReferenceAsset[];
  components: ReferenceComponent[];
  families: string[];
  vocabulary: string[];
  rules: { constants: string[]; never: string[] };
  styleBrief: string;
  guardrails: ReferenceGuardrailFinding[];
  // Reduced profile: the snapshot fallback cannot measure runtime styles.
  reduced: boolean;
};

export type ReferenceSnapshot = {
  breakpoint: string;
  width: number;
  height: number;
  // Screenshot slots (E24 slice 3): hero-desktop/hero-mobile are the card
  // images of the collection format (1920×1080 / 360×800); fullpage is a
  // capture of one breakpoint; section a captured excerpt (legacy capture
  // kind); motion is the recorded scroll pass of a live capture (.webm).
  kind: ReferenceSnapshotKind;
  storageRef: string;
  hash: string;
  // Length of a motion recording in milliseconds.
  durationMs?: number;
  // Relative URL of the stored file, present only when the capture wrote bytes.
  previewPath?: string;
};

// Slot order of the card selection: the hero first, then the capture.
export const REFERENCE_SNAPSHOT_KINDS = [
  "hero-desktop",
  "hero-mobile",
  "fullpage",
  "section",
  "motion",
] as const;
export type ReferenceSnapshotKind =
  (typeof REFERENCE_SNAPSHOT_KINDS)[number];

// The documents of an imported reference (Framer template set): design.md,
// design-guidelines.md and design-components.md, kept verbatim. They are the
// source the detail view renders and the agent reads; the profile derived from
// them carries the numbers.
export type ReferenceDocuments = {
  design: string | null;
  guidelines: string | null;
  components: string | null;
};

export const EMPTY_REFERENCE_DOCUMENTS: ReferenceDocuments = {
  design: null,
  guidelines: null,
  components: null,
};

// "manual" is the uploaded reference (Taste Vault "Add reference"): it never
// runs the analysis pipeline and carries no profile.
export type ReferenceMethod = "playwright" | "snapshot" | "manual";

// How the reference entered the library: through the URL analysis or as a
// manually stored image. The style brief is a catalogue entry, not a reference.
export const REFERENCE_ORIGINS = ["analysis", "manual"] as const;
export type ReferenceOrigin = (typeof REFERENCE_ORIGINS)[number];

export const REFERENCE_COLLECTION_KINDS = ["collection", "style"] as const;
export type ReferenceCollectionKind = (typeof REFERENCE_COLLECTION_KINDS)[number];

// One canonical example site of a style family (styles.json `canonical`).
export type ReferenceCollectionExample = {
  name: string;
  url: string;
};

// A collection of the reference library. The fields mirror the reference
// design library (name, description, deploy for, vocabulary, risk, accent,
// image style); `recognize`, `examples` and `warning` carry the style guide
// extras of the seeded style families.
export type ReferenceCollection = {
  id: string;
  name: string;
  description: string;
  deployFor: string;
  vocabulary: string[];
  risk: string;
  accent: string;
  imageStyle: string;
  recognize: string[];
  examples: ReferenceCollectionExample[];
  warning: string | null;
  kind: ReferenceCollectionKind;
  externalId: string | null;
  position: number;
  // References that point at this collection (the counter of the sidebar).
  referenceCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ReferenceProvenance = {
  url: string;
  capturedAt: string;
  hash: string;
  method: ReferenceMethod;
  note: string | null;
  // Present for manually stored references: who added the image.
  author?: Author;
};

export type ReferenceProfileRevision = {
  id: string;
  referenceId: string;
  revision: number;
  profile: ReferenceProfile;
  evidence: ReferenceEvidence[];
  provenance: ReferenceProvenance;
  author: Author;
  note: string | null;
  createdAt: string;
};

export type Reference = {
  id: string;
  name: string;
  sourceUrl: string;
  status: ReferenceStatus;
  progress: number;
  stage: string;
  method: ReferenceMethod;
  origin: ReferenceOrigin;
  failureReason: string | null;
  families: string[];
  vocabulary: string[];
  styleBrief: string;
  snapshots: ReferenceSnapshot[];
  // Card image of the gallery, derived from the slots (hero-desktop first):
  // the card shows a deliberate hero, never "some" snapshot.
  cardSnapshot: ReferenceSnapshot | null;
  provenance: ReferenceProvenance;
  // Library fields of the card/detail view (Taste Vault entry).
  collectionId: string | null;
  collection: ReferenceCollection | null;
  note: string | null;
  imageRecipe: string | null;
  heroUsage: string | null;
  family: string | null;
  // Verbatim import documents; empty for references without them.
  documents: ReferenceDocuments;
  revision: number;
  profile: ReferenceProfile | null;
  evidence: ReferenceEvidence[];
  usedInProjects: string[];
  createdAt: string;
  updatedAt: string;
};

// Card view of the Referenzen tab: no profile payload and no documents (the
// imported documents are tens of kilobytes each, only the detail view loads
// them).
export type ReferenceSummary = Omit<Reference, "profile" | "evidence" | "documents">;

export const REFERENCE_LIST_SORTS = ["newest", "name"] as const;
export type ReferenceListSort = (typeof REFERENCE_LIST_SORTS)[number];

// The reference library as one response: the filtered cards, the collections of
// the sidebar (with their counters) and the numbers of the footer line.
export type ReferenceListView = {
  references: ReferenceSummary[];
  collections: ReferenceCollection[];
  counts: {
    references: number;
    inView: number;
    collections: number;
    styles: number;
  };
  footer: {
    total: number;
    inView: number;
    query: string | null;
    text: string;
  };
  styleCatalog: ReferenceStyleCatalogInfo;
};

export type ReferenceStyleCatalogInfo = {
  description: string;
  license: string;
  source: string;
  total: number;
};

export type ReferenceCollectionListView = {
  collections: ReferenceCollection[];
  styleCatalog: ReferenceStyleCatalogInfo;
};

// The briefs (`app.js:81-85`) as the engine builds them.
export type ReferenceBrief = {
  kind: "reference" | "collection";
  text: string;
  // Status line of the preferences block ("Reference-led brief · House DNA is
  // off." when the House DNA switch is off).
  status: string;
  referenceIds: string[];
  collectionId: string | null;
};

export type ReferenceBriefView = {
  brief: ReferenceBrief;
  // Single reference only: the artwork prompt of its image recipe.
  imagePrompt: string | null;
  // Collection only: the vocabulary as one line ("Copy vocabulary").
  vocabulary: string | null;
};

// Visual diff of a reference slot against a baked result (E26 slice 2): the
// number (ratio + changed pixels) plus the heatmap file. The result is
// captured at the slot's own width, so widths stay comparable.
export type ReferenceDesignDiff = {
  snapshotKind: ReferenceSnapshotKind;
  breakpoint: "desktop" | "tablet" | "mobile";
  width: number;
  pageId: string;
  pagePath: string;
  changedPixels: number;
  ratio: number;
  bounds: { left: number; top: number; right: number; bottom: number } | null;
  storageRef: string;
  previewPath: string;
};

export type ReferenceJob = {
  id: string;
  referenceId: string;
  status: ReferenceJobStatus;
  stage: string;
  progress: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type ReferenceAssignment = {
  id: string;
  siteId: string;
  referenceId: string;
  scales: ReferenceScale[];
  priority: number;
  createdAt: string;
  updatedAt: string;
};

// ------------------------------------------------------------ settings (T12)

// Transport security of the SMTP connection (artifacts/27 §5).
export const SMTP_TLS_MODES = ["none", "starttls", "tls"] as const;
export type SmtpTlsMode = (typeof SMTP_TLS_MODES)[number];

// SMTP settings as the API exposes them: the password never leaves the engine,
// only its presence is reported.
export type SmtpSettings = {
  host: string;
  port: number;
  tls: SmtpTlsMode;
  user: string;
  from: string;
  hasPassword: boolean;
};

// Stored shape: the password sits here encrypted at rest.
export type SmtpSettingsRecord = Omit<SmtpSettings, "hasPassword"> & {
  passwordEncrypted: string | null;
};

// Defaults applied when a new project/page is created or the program starts.
export type EngineSettings = {
  defaultProfile: SiteProfile;
  defaultLayout: string;
  autostart: boolean;
  backupDir: string | null;
};

// House DNA of the reference library: the principles every collection rests on.
export type ReferenceDna = {
  name: string;
  description: string;
  constants: string[];
  never: string[];
};

// Preferences of the briefs: the House DNA is off by default, project notes
// take priority over the general preferences.
export type ReferencePreferences = {
  includeDna: boolean;
  overrides: string;
};

// Stored shape of the single reference settings row.
export type ReferenceSettings = {
  dna: ReferenceDna;
  preferences: ReferencePreferences;
  updatedAt: string;
};

// ------------------------------------------------------------ images (S1)

// The provider chain of the image generation (ADR-0008): image-use is the
// subscription default, ComfyUI + Qwen-Image-2.1 the local fallback, `custom`
// drives any HTTP endpoint with an API key, `off` disables generation entirely.
export const IMAGE_PROVIDERS = ["image-use", "comfyui", "custom", "off"] as const;
export type ImageProviderName = (typeof IMAGE_PROVIDERS)[number];

export const IMAGE_FALLBACK_PROVIDERS = ["comfyui", "image-use", "custom", "none"] as const;
export type ImageFallbackProvider = (typeof IMAGE_FALLBACK_PROVIDERS)[number];

// Wire format of the custom endpoint (the third path): MiniMax's
// `/image_generation` (aspect_ratio + data.image_urls) or the OpenAI-compatible
// `/images/generations` (size + data[0].b64_json/url).
export const IMAGE_CUSTOM_FORMATS = ["minimax", "openai"] as const;
export type ImageCustomFormat = (typeof IMAGE_CUSTOM_FORMATS)[number];

// Global image settings (one row): provider choice, the ComfyUI connection and
// the model file names. The custom API key stays encrypted here; the settings
// view only exposes `hasCustomApiKey`.
export type ImageSettings = {
  provider: ImageProviderName;
  fallbackProvider: ImageFallbackProvider;
  // Provider pause after a quota/availability failure (S2).
  cooldownMinutes: number;
  // image-use CLI; defaults to the skill installation of the operator.
  cliPath: string;
  baseUrl: string;
  diffusionModel: string;
  textEncoder: string;
  vae: string;
  defaultSteps: number;
  // Upper bound for width * height (the local fallback is slow at large sizes).
  maxPixels: number;
  timeoutMinutes: number;
  // Custom endpoint (the third path): base URL, model, wire format and the
  // encrypted API key. Never leaves the engine in plaintext.
  customBaseUrl: string;
  customModel: string;
  customFormat: ImageCustomFormat;
  customApiKeyEncrypted: string | null;
};

// ------------------------------------------------------------ image jobs (S2)

export const IMAGE_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type ImageJobStatus = (typeof IMAGE_JOB_STATUSES)[number];

// The stored request of a job: everything the worker needs to generate the
// image and commit it through the media pipeline.
export type ImageJobRequest = {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  seed?: number;
  filename: string;
  altText: string | null;
  decorative: boolean;
  folderId: string | null;
  tags: string[];
  // The desired provider (job override or the settings default at enqueue
  // time); the worker walks the chain from here.
  provider: ImageProviderName;
  referenceId?: string;
};

// One provider attempt; the job carries the whole history in `error` (jsonb).
export type ImageJobAttempt = {
  provider: string;
  kind: string;
  message: string;
  at: string;
  suggestion?: string;
};

export type ImageJob = {
  id: string;
  siteId: string;
  status: ImageJobStatus;
  request: ImageJobRequest;
  providerUsed: string | null;
  attempts: number;
  maxAttempts: number;
  leaseUntil: string | null;
  // The provider's own job handle (ComfyUI prompt id): resume instead of a
  // double submit after a crash.
  providerJobId: string | null;
  assetId: string | null;
  error: ImageJobAttempt[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

// Provider pause after a quota/availability failure (S2). The duration comes
// from the settings (`image.cooldownMinutes`), the state lives here.
export type ProviderCooldown = {
  provider: string;
  until: string;
  reason: string;
};
