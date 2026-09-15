import type { Author, NodeTree } from "@senify/section-sdk";
import type { Theme } from "@senify/tokens";
import type { PatchOp } from "./mutations/contract.ts";

export type SiteProfile = "clean" | "standard" | "showcase";

export const SITE_PROFILES: readonly SiteProfile[] = [
  "clean",
  "standard",
  "showcase",
];

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

export type Page = {
  id: string;
  siteId: string;
  path: string;
  title: string;
  meta: PageMeta;
  draft: NodeTree;
  draftVersion: number;
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

export type ApiToken = {
  id: string;
  name: string;
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
  releaseId: string | null;
  createdAt: string;
  resolvedAt: string | null;
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
