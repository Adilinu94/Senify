import {
  MOTION_PROFILES,
  type Author,
  type MotionProfile,
  type NodeTree,
} from "@senify/section-sdk";
import type { FormSnapshot } from "@senify/renderer";
import type { Theme } from "@senify/tokens";
import type { PatchOp } from "./mutations/contract.ts";

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
  createdAt: string;
  updatedAt: string;
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

export type Release = {
  id: string;
  siteId: string;
  pageRevisions: ReleasePageRevision[];
  themeSnapshot: unknown;
  buildRef: string | null;
  author: Author;
  note: string | null;
  basisReleaseId: string | null;
  createdAt: string;
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
  // "motion" is the recorded scroll pass of a live capture (.webm).
  kind: "fullpage" | "section" | "motion";
  storageRef: string;
  hash: string;
  // Length of a motion recording in milliseconds.
  durationMs?: number;
  // Relative URL of the stored file, present only when the capture wrote bytes.
  previewPath?: string;
};

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
