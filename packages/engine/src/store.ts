import { randomBytes } from "node:crypto";
import { SenifyError } from "@senify/core";
import {
  PAGE_ROOT_TYPE,
  type Author,
  type NodeTree,
} from "@senify/section-sdk";
import type { FormSnapshot } from "@senify/renderer";
import {
  defaultTheme,
  emitCss,
  mergeThemePatch,
  resolveTheme,
  ThemeSchema,
  validateTheme,
  type Theme,
} from "@senify/tokens";
import type { Db, Row } from "./db.ts";
import { tableNames } from "./db.ts";
import { generateToken } from "./auth.ts";
import { entryConflictError } from "./content-contract.ts";
import { newEntityId, newNodeId } from "./ids.ts";
import { validateShape } from "./mutations/contract.ts";
import { assertPagePathFormat, draftConflictError } from "./paths.ts";
import type { GeneratedVariant } from "./variants.ts";
import {
  ASSET_KINDS,
  ASSET_VARIANT_FORMATS,
  ENTRY_STATUSES,
  FIELD_TYPES,
  REVIEW_STATUSES,
  SITE_PROFILES,
  SMTP_TLS_MODES,
  SUPPORTS_FLAGS,
  type ApiToken,
  type Asset,
  type AssetFolder,
  type AssetHistoryEntry,
  type AssetKind,
  type AssetStatus,
  type AssetUpdate,
  type AssetUsage,
  type AssetVariant,
  type AssetVariantFormat,
  type AuditEntry,
  type CellValue,
  type Collection,
  type EngineSettings,
  type Entry,
  type EntryRedirect,
  type EntryStatus,
  type EntryVersion,
  type FieldDef,
  type FormSnapshotRecord,
  type McpAuditEntry,
  type NewsletterToken,
  type NewsletterTokenKind,
  type NotificationMessage,
  type NotificationStatus,
  type Page,
  type PageMeta,
  type PageRevision,
  type PageSummary,
  type PageTemplate,
  type Preview,
  type PreviewStatus,
  type Reference,
  type ReferenceAssignment,
  type ReferenceEvidence,
  type ReferenceJob,
  type ReferenceJobStatus,
  type ReferenceMethod,
  type ReferenceProfile,
  type ReferenceProfileRevision,
  type ReferenceProvenance,
  type ReferenceScale,
  type ReferenceSnapshot,
  type ReferenceStatus,
  type ReferenceSummary,
  type Release,
  type ReleasePageRevision,
  type ReviewComment,
  type ReviewItem,
  type ReviewStatus,
  type RevisionSummary,
  type Site,
  type SiteTheme,
  type SmtpSettingsRecord,
  type SmtpTlsMode,
  type StructureChange,
  type SupportsFlag,
  type TokenRecord,
  type TokenScope,
} from "./types.ts";

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "page";
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "23505") return true;
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  return /(duplicate|unique|already exists)/i.test(message);
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toFiniteNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Stored value for "${field}" is not a number: ${String(value)}`);
  }
  return parsed;
}

function toJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function toJsonParam(value: unknown): string {
  return JSON.stringify(value);
}

type SiteRow = {
  id: string;
  name: string;
  slug: string;
  profile: string;
  theme_id: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type PageRow = {
  id: string;
  site_id: string;
  path: string;
  title: string;
  meta: unknown;
  draft: unknown;
  draft_version: unknown;
  created_at: unknown;
  updated_at: unknown;
  template_kind?: unknown;
  collection_ids?: unknown;
  priority?: unknown;
  layout_id?: unknown;
};

type PageSummaryRow = Omit<PageRow, "draft">;

// The template columns come from the additive page_templates table via LEFT
// JOIN; a page without a row is a normal page.
const PAGE_COLUMNS =
  "p.id, p.site_id, p.path, p.title, p.meta, p.draft, p.draft_version, p.created_at, p.updated_at, pt.kind AS template_kind, pt.collection_ids, pt.priority, pt.layout_id";
const PAGE_SUMMARY_COLUMNS =
  "p.id, p.site_id, p.path, p.title, p.meta, p.draft_version, p.created_at, p.updated_at, pt.kind AS template_kind, pt.collection_ids, pt.priority, pt.layout_id";

type AuditRow = {
  id: string;
  site_id: string;
  page_id: unknown;
  batch_id: string;
  op_index: unknown;
  mutation: string;
  params: unknown;
  author: unknown;
  undo_patch: unknown;
  draft_version_after: unknown;
  created_at: unknown;
};

type ThemeRow = {
  id: string;
  site_id: string;
  name: string;
  definition: unknown;
  version: unknown;
  created_at: unknown;
  updated_at: unknown;
};

function mapThemeRow(row: ThemeRow): SiteTheme {
  const theme = toJson<Theme>(row.definition);
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    version: toFiniteNumber(row.version, "version"),
    theme,
    css: emitCss(resolveTheme(theme)),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapSite(row: SiteRow): Site {
  const profile = row.profile;
  if (profile !== "clean" && profile !== "standard" && profile !== "showcase") {
    throw new Error(`Stored site profile is invalid: ${String(profile)}`);
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    profile,
    themeId: typeof row.theme_id === "string" ? row.theme_id : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function assertDraftShape(draft: unknown): asserts draft is NodeTree {
  if (
    !draft ||
    typeof draft !== "object" ||
    typeof (draft as { rootNodeId?: unknown }).rootNodeId !== "string" ||
    typeof (draft as { nodes?: unknown }).nodes !== "object" ||
    (draft as { nodes?: unknown }).nodes === null
  ) {
    throw new Error("Stored page draft has an invalid shape");
  }
}

function mapPageTemplate(row: {
  title?: string;
  template_kind?: unknown;
  collection_ids?: unknown;
  priority?: unknown;
}): PageTemplate | null {
  if (row.template_kind === "layout") {
    return { kind: "layout", label: row.title ?? "" };
  }
  if (row.template_kind === "collection") {
    return {
      kind: "collection",
      collectionIds: toJson<string[]>(row.collection_ids),
      priority: toFiniteNumber(row.priority ?? 0, "priority"),
    };
  }
  return null;
}

function mapPage(row: PageRow): Page {
  const draft = toJson<unknown>(row.draft);
  assertDraftShape(draft);
  return {
    id: row.id,
    siteId: row.site_id,
    path: row.path,
    title: row.title,
    meta: toJson<PageMeta>(row.meta),
    draft,
    draftVersion: toFiniteNumber(row.draft_version, "draft_version"),
    template: mapPageTemplate(row),
    layoutId: typeof row.layout_id === "string" ? row.layout_id : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toSummary(row: PageSummaryRow): PageSummary {
  return {
    id: row.id,
    siteId: row.site_id,
    path: row.path,
    title: row.title,
    meta: toJson<PageMeta>(row.meta),
    draftVersion: toFiniteNumber(row.draft_version, "draft_version"),
    template: mapPageTemplate(row),
    layoutId: typeof row.layout_id === "string" ? row.layout_id : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapAudit(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    siteId: row.site_id,
    pageId: typeof row.page_id === "string" ? row.page_id : null,
    batchId: row.batch_id,
    opIndex: toFiniteNumber(row.op_index, "op_index"),
    mutation: row.mutation,
    params: toJson<Record<string, unknown>>(row.params),
    author: toJson<Author>(row.author),
    undoPatch: toJson<AuditEntry["undoPatch"]>(row.undo_patch),
    draftVersionAfter: toFiniteNumber(row.draft_version_after, "draft_version_after"),
    createdAt: toIso(row.created_at),
  };
}

type TokenRow = {
  id: string;
  name: string;
  scopes: unknown;
  token_prefix: string;
  created_at: unknown;
  expires_at: unknown;
  last_used_at: unknown;
  revoked_at: unknown;
};

type TokenRecordRow = TokenRow & { token_hash: string };

type McpAuditRow = {
  id: string;
  token_id: unknown;
  client: string;
  tool: string;
  args: unknown;
  result: string;
  entity: unknown;
  duration_ms: unknown;
  created_at: unknown;
};

type RevisionRow = {
  id: string;
  page_id: string;
  site_id: string;
  tree: unknown;
  title: string;
  path: string;
  author: unknown;
  note: unknown;
  created_at: unknown;
};

type ReleaseRow = {
  id: string;
  site_id: string;
  page_revisions: unknown;
  theme_snapshot: unknown;
  build_ref: unknown;
  author: unknown;
  note: unknown;
  basis_release_id: unknown;
  created_at: unknown;
};

type PreviewRow = {
  id: string;
  site_id: string;
  build_ref: string;
  token: string;
  status: string;
  created_by: unknown;
  created_at: unknown;
  expires_at: unknown;
};

type ReviewRow = {
  id: string;
  site_id: string;
  preview_id: unknown;
  base_state: unknown;
  pages: unknown;
  author: unknown;
  status: string;
  structure_diff: unknown;
  guardrails: unknown;
  thread: unknown;
  release_id: unknown;
  created_at: unknown;
  resolved_at: unknown;
};

const REVIEW_STATUS_VALUES: readonly ReviewStatus[] = REVIEW_STATUSES;

function mapRevision(row: RevisionRow): PageRevision {
  const tree = toJson<unknown>(row.tree);
  assertDraftShape(tree);
  return {
    id: row.id,
    pageId: row.page_id,
    siteId: row.site_id,
    title: row.title,
    path: row.path,
    tree,
    author: toJson<Author>(row.author),
    note: typeof row.note === "string" ? row.note : null,
    createdAt: toIso(row.created_at),
  };
}

function toRevisionSummary(revision: PageRevision): RevisionSummary {
  const { tree, ...rest } = revision;
  return { ...rest, nodeCount: Object.keys(tree.nodes).length };
}

function mapRelease(row: ReleaseRow): Release {
  return {
    id: row.id,
    siteId: row.site_id,
    pageRevisions: toJson<ReleasePageRevision[]>(row.page_revisions),
    themeSnapshot: toJson<unknown>(row.theme_snapshot),
    buildRef: typeof row.build_ref === "string" ? row.build_ref : null,
    author: toJson<Author>(row.author),
    note: typeof row.note === "string" ? row.note : null,
    basisReleaseId:
      typeof row.basis_release_id === "string" ? row.basis_release_id : null,
    createdAt: toIso(row.created_at),
  };
}

function mapPreview(row: PreviewRow): Preview {
  const status: PreviewStatus =
    row.status === "failed"
      ? "failed"
      : row.status === "expired"
        ? "expired"
        : "ready";
  return {
    id: row.id,
    siteId: row.site_id,
    buildRef: row.build_ref,
    token: row.token,
    status,
    createdBy: toJson<Author>(row.created_by),
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
  };
}

function mapReviewItem(row: ReviewRow): ReviewItem {
  const status = row.status as ReviewStatus;
  if (!REVIEW_STATUS_VALUES.includes(status)) {
    throw new Error(`Stored review status is invalid: ${row.status}`);
  }
  return {
    id: row.id,
    siteId: row.site_id,
    previewId: typeof row.preview_id === "string" ? row.preview_id : null,
    baseState: toJson<ReviewItem["baseState"]>(row.base_state),
    pages: toJson<string[]>(row.pages),
    author: toJson<Author>(row.author),
    status,
    structureDiff: toJson<StructureChange[]>(row.structure_diff),
    guardrails: toJson<ReviewItem["guardrails"]>(row.guardrails),
    thread: toJson<ReviewComment[]>(row.thread),
    releaseId: typeof row.release_id === "string" ? row.release_id : null,
    createdAt: toIso(row.created_at),
    resolvedAt:
      row.resolved_at === null || row.resolved_at === undefined
        ? null
        : toIso(row.resolved_at),
  };
}

function toNullableIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toIso(value);
}

function mapToken(row: TokenRow): ApiToken {
  const scopes = toJson<unknown>(row.scopes);
  if (
    !Array.isArray(scopes) ||
    scopes.some(
      (scope) => scope !== "read" && scope !== "write" && scope !== "publish",
    )
  ) {
    throw new Error(`Stored token scopes are invalid: ${String(row.scopes)}`);
  }
  return {
    id: row.id,
    name: row.name,
    scopes: scopes as TokenScope[],
    prefix: row.token_prefix,
    createdAt: toIso(row.created_at),
    expiresAt: toNullableIso(row.expires_at),
    lastUsedAt: toNullableIso(row.last_used_at),
    revokedAt: toNullableIso(row.revoked_at),
  };
}

function mapMcpAudit(row: McpAuditRow): McpAuditEntry {
  return {
    id: row.id,
    tokenId: typeof row.token_id === "string" ? row.token_id : null,
    client: row.client,
    tool: row.tool,
    args: toJson<Record<string, unknown>>(row.args),
    result: row.result === "error" ? "error" : "ok",
    entity: typeof row.entity === "string" ? row.entity : null,
    durationMs: toFiniteNumber(row.duration_ms, "duration_ms"),
    createdAt: toIso(row.created_at),
  };
}

type AssetRow = {
  id: string;
  site_id: string;
  filename: string;
  mime: string;
  kind: string;
  byte_size: unknown;
  width: unknown;
  height: unknown;
  hash: string;
  alt_text: unknown;
  decorative: unknown;
  folder_id: unknown;
  tags: unknown;
  storage_ref: string;
  status: string;
  replaced_at: unknown;
  trashed_at: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type AssetFolderRow = {
  id: string;
  site_id: string;
  name: string;
  parent_id: unknown;
  created_at: unknown;
};

type AssetHistoryRow = {
  id: string;
  asset_id: string;
  storage_ref: string;
  mime: string;
  byte_size: unknown;
  created_at: unknown;
};

type AssetVariantRow = {
  id: string;
  asset_id: string;
  width: unknown;
  format: string;
  storage_ref: string;
  byte_size: unknown;
  created_at: unknown;
};

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toFiniteNumber(value, "value");
}

function toNullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapAsset(row: AssetRow): Asset {
  const kind = row.kind;
  if (!ASSET_KINDS.includes(kind as AssetKind)) {
    throw new Error(`Stored asset kind is invalid: ${String(kind)}`);
  }
  const status: AssetStatus = row.status === "trashed" ? "trashed" : "ready";
  return {
    id: row.id,
    siteId: row.site_id,
    filename: row.filename,
    mime: row.mime,
    kind: kind as AssetKind,
    byteSize: toFiniteNumber(row.byte_size, "byte_size"),
    width: toNullableNumber(row.width),
    height: toNullableNumber(row.height),
    hash: row.hash,
    altText: toNullableText(row.alt_text),
    decorative: row.decorative === true || row.decorative === "true",
    folderId: toNullableText(row.folder_id),
    tags: toJson<string[]>(row.tags),
    storageRef: row.storage_ref,
    status,
    // Derivatives come from separate tables; single-row mappers leave them
    // empty and callers attach the loaded rows.
    variants: [],
    blurhash: null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    replacedAt: toNullableIso(row.replaced_at),
    trashedAt: toNullableIso(row.trashed_at),
  };
}

function mapAssetFolder(row: AssetFolderRow): AssetFolder {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    parentId: toNullableText(row.parent_id),
    createdAt: toIso(row.created_at),
  };
}

function mapAssetHistory(row: AssetHistoryRow): AssetHistoryEntry {
  return {
    id: row.id,
    assetId: row.asset_id,
    storageRef: row.storage_ref,
    mime: row.mime,
    byteSize: toFiniteNumber(row.byte_size, "byte_size"),
    createdAt: toIso(row.created_at),
  };
}

function mapAssetVariant(row: AssetVariantRow): AssetVariant {
  const format = row.format;
  if (!ASSET_VARIANT_FORMATS.includes(format as AssetVariantFormat)) {
    throw new Error(`Stored asset variant format is invalid: ${String(format)}`);
  }
  return {
    id: row.id,
    assetId: row.asset_id,
    width: toFiniteNumber(row.width, "width"),
    format: format as AssetVariantFormat,
    storageRef: row.storage_ref,
    byteSize: toFiniteNumber(row.byte_size, "byte_size"),
    createdAt: toIso(row.created_at),
  };
}

const ASSET_COLUMNS =
  "id, site_id, filename, mime, kind, byte_size, width, height, hash, alt_text, decorative, folder_id, tags, storage_ref, status, replaced_at, trashed_at, created_at, updated_at";

type CollectionRow = {
  id: string;
  site_id: string;
  name: string;
  slug: string;
  fields: unknown;
  title_field: string;
  date_field: unknown;
  url_pattern: unknown;
  supports: unknown;
  list_columns: unknown;
  description: unknown;
  deprecated_at: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type EntryRow = {
  id: string;
  site_id: string;
  collection_id: string;
  slug: string;
  status: string;
  cells: unknown;
  active_version_id: unknown;
  version: unknown;
  author: unknown;
  published_at: unknown;
  scheduled_at: unknown;
  deleted_at: unknown;
  created_at: unknown;
  updated_at: unknown;
};

type EntryVersionRow = {
  id: string;
  entry_id: string;
  site_id: string;
  version_number: unknown;
  cells: unknown;
  slug: string;
  status: string;
  author: unknown;
  created_at: unknown;
};

type EntryRedirectRow = {
  id: string;
  site_id: string;
  collection_id: string;
  from_path: string;
  to_path: string;
  created_at: unknown;
};

const COLLECTION_COLUMNS =
  "id, site_id, name, slug, fields, title_field, date_field, url_pattern, supports, list_columns, description, deprecated_at, created_at, updated_at";
const ENTRY_COLUMNS =
  "id, site_id, collection_id, slug, status, cells, active_version_id, version, author, published_at, scheduled_at, deleted_at, created_at, updated_at";

function assertEntryStatus(value: string): EntryStatus {
  if (!(ENTRY_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Stored entry status is invalid: ${value}`);
  }
  return value as EntryStatus;
}

function toFieldDefs(value: unknown): FieldDef[] {
  const fields = toJson<unknown>(value);
  if (!Array.isArray(fields)) {
    throw new Error("Stored collection fields are not an array");
  }
  return fields.map((entry) => {
    const field = entry as FieldDef;
    if (
      !field ||
      typeof field !== "object" ||
      typeof field.id !== "string" ||
      typeof field.type !== "string" ||
      !(FIELD_TYPES as readonly string[]).includes(field.type)
    ) {
      throw new Error("Stored collection field is invalid");
    }
    return field;
  });
}

function toSupports(value: unknown): SupportsFlag[] {
  const supports = toJson<unknown>(value);
  if (
    !Array.isArray(supports) ||
    supports.some(
      (flag) => !(SUPPORTS_FLAGS as readonly string[]).includes(String(flag)),
    )
  ) {
    throw new Error(`Stored collection supports are invalid: ${String(value)}`);
  }
  return supports as SupportsFlag[];
}

function mapCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    slug: row.slug,
    fields: toFieldDefs(row.fields),
    titleField: row.title_field,
    dateField: toNullableText(row.date_field),
    urlPattern: toNullableText(row.url_pattern),
    supports: toSupports(row.supports),
    listColumns: toJson<string[]>(row.list_columns),
    description: toNullableText(row.description),
    deprecatedAt: toNullableIso(row.deprecated_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    siteId: row.site_id,
    collectionId: row.collection_id,
    slug: row.slug,
    status: assertEntryStatus(row.status),
    cells: toJson<Record<string, CellValue>>(row.cells),
    activeVersionId: toNullableText(row.active_version_id),
    version: toFiniteNumber(row.version, "version"),
    author: toJson<Author>(row.author),
    publishedAt: toNullableIso(row.published_at),
    scheduledAt: toNullableIso(row.scheduled_at),
    deletedAt: toNullableIso(row.deleted_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapEntryVersion(row: EntryVersionRow): EntryVersion {
  return {
    id: row.id,
    entryId: row.entry_id,
    siteId: row.site_id,
    versionNumber: toFiniteNumber(row.version_number, "version_number"),
    cells: toJson<Record<string, CellValue>>(row.cells),
    slug: row.slug,
    status: assertEntryStatus(row.status),
    publishedBy: toJson<Author>(row.author),
    createdAt: toIso(row.created_at),
  };
}

function mapEntryRedirect(row: EntryRedirectRow): EntryRedirect {
  return {
    id: row.id,
    siteId: row.site_id,
    collectionId: row.collection_id,
    fromPath: row.from_path,
    toPath: row.to_path,
    createdAt: toIso(row.created_at),
  };
}

export type CreateSiteInput = {
  name: string;
  slug?: string;
  profile?: Site["profile"];
};

export type CreatePageInput = {
  title?: string;
  path?: string;
};

export type NewAuditEntry = {
  siteId: string;
  pageId: string | null;
  batchId: string;
  opIndex: number;
  mutation: string;
  params: Record<string, unknown>;
  author: Author;
  undoPatch: AuditEntry["undoPatch"];
  draftVersionAfter: number;
};

export type SmtpSettingsPatch = {
  host?: string;
  port?: number;
  tls?: SmtpTlsMode;
  user?: string;
  from?: string;
  passwordEncrypted?: string | null;
};

export type EngineSettingsPatch = {
  defaultProfile?: Site["profile"];
  defaultLayout?: string;
  autostart?: boolean;
  backupDir?: string | null;
};

export class Store {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async createSite(input: CreateSiteInput): Promise<Site> {
    const name = input.name?.trim();
    if (!name) {
      throw new SenifyError("validation", "Site name is required", {
        field: "name",
        suggestion: "Provide a non-empty site name.",
      });
    }
    const profile: Site["profile"] =
      input.profile ?? (await this.getEngineSettings()).defaultProfile;
    if (!SITE_PROFILES.includes(profile)) {
      throw new SenifyError(
        "validation",
        `Unknown site profile "${profile}"`,
        {
          field: "profile",
          suggestion: `Choose one of: ${SITE_PROFILES.join(", ")}.`,
        },
      );
    }
    const now = new Date().toISOString();
    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      const site = await this.#insertSite(newEntityId(), name, slug, profile, now);
      await this.ensureSiteTheme(site.id);
      return this.getSite(site.id);
    }
    const base = slugify(name);
    let site: Site | undefined;
    let lastConflict: SenifyError | undefined;
    for (let attempt = 0; attempt < 50 && !site; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      try {
        site = await this.#insertSite(newEntityId(), name, slug, profile, now);
      } catch (error) {
        if (error instanceof SenifyError && error.category === "conflict") {
          lastConflict = error;
          continue;
        }
        throw error;
      }
    }
    if (!site) {
      throw (
        lastConflict ??
        new SenifyError("conflict", `Site slug "${base}" is already in use`, {
          field: "slug",
          suggestion: "Choose a different site slug.",
        })
      );
    }
    await this.ensureSiteTheme(site.id);
    return this.getSite(site.id);
  }

  async #insertSite(
    id: string,
    name: string,
    slug: string,
    profile: Site["profile"],
    now: string,
  ): Promise<Site> {
    try {
      const result = await this.#db.query<SiteRow>(
        `INSERT INTO sites (id, name, slug, profile, theme_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $5)
         RETURNING id, name, slug, profile, theme_id, created_at, updated_at`,
        [id, name, slug, profile, now],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Site insert returned no row");
      return mapSite(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SenifyError(
          "conflict",
          `Site slug "${slug}" is already in use`,
          {
            field: "slug",
            suggestion: "Choose a different site slug.",
          },
        );
      }
      throw error;
    }
  }

  async listSites(): Promise<Site[]> {
    const result = await this.#db.query<SiteRow>(
      `SELECT s.id, s.name, s.slug, s.profile, s.theme_id, s.created_at, s.updated_at
       FROM sites s
       LEFT JOIN site_trash t ON t.site_id = s.id
       WHERE t.site_id IS NULL
       ORDER BY s.created_at ASC, s.id ASC`,
    );
    return result.rows.map(mapSite);
  }

  async getSite(id: string): Promise<Site> {
    const result = await this.#db.query<SiteRow>(
      `SELECT id, name, slug, profile, theme_id, created_at, updated_at
       FROM sites WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Site "${id}" does not exist`, {
        field: "siteId",
        suggestion: "Create the site first or check the id.",
      });
    }
    return mapSite(row);
  }

  async deleteSite(id: string): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM sites WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Site "${id}" does not exist`, {
        field: "siteId",
      });
    }
  }

  async renameSite(id: string, name: string): Promise<Site> {
    const trimmed = name.trim();
    if (trimmed === "") {
      throw new SenifyError("validation", "Site name is required", {
        field: "name",
        suggestion: "Provide a non-empty site name.",
      });
    }
    const now = new Date().toISOString();
    const result = await this.#db.query<SiteRow>(
      `UPDATE sites SET name = $2, updated_at = $3 WHERE id = $1
       RETURNING id, name, slug, profile, theme_id, created_at, updated_at`,
      [id, trimmed, now],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Site "${id}" does not exist`, {
        field: "siteId",
      });
    }
    return mapSite(row);
  }

  // The trash lives in its own table: the schema stays additive (no ALTERs)
  // and listSites simply excludes trashed sites.
  async trashSite(id: string): Promise<Site> {
    const site = await this.getSite(id);
    const existing = await this.#db.query<{ site_id: string }>(
      `SELECT site_id FROM site_trash WHERE site_id = $1`,
      [id],
    );
    if (existing.rows.length > 0) {
      throw new SenifyError("conflict", `Site "${id}" is already in the trash`, {
        field: "siteId",
        suggestion: "Restore the site first.",
      });
    }
    await this.#db.query(
      `INSERT INTO site_trash (site_id, trashed_at) VALUES ($1, $2)`,
      [id, new Date().toISOString()],
    );
    return site;
  }

  async restoreSite(id: string): Promise<Site> {
    const result = await this.#db.query<{ site_id: string }>(
      `DELETE FROM site_trash WHERE site_id = $1 RETURNING site_id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Site "${id}" is not in the trash`, {
        field: "siteId",
      });
    }
    return this.getSite(id);
  }

  async listTrashedSites(): Promise<(Site & { trashedAt: string })[]> {
    const result = await this.#db.query<SiteRow & { trashed_at: unknown }>(
      `SELECT s.id, s.name, s.slug, s.profile, s.theme_id, s.created_at, s.updated_at, t.trashed_at
       FROM site_trash t JOIN sites s ON s.id = t.site_id
       ORDER BY t.trashed_at DESC, s.id ASC`,
    );
    return result.rows.map((row) => ({
      ...mapSite(row),
      trashedAt: toIso(row.trashed_at),
    }));
  }

  // A copy is a fresh project: pages, theme and collection schemas come
  // along; entries are copied as drafts (no publish state carries over) and
  // assets are only referenced, never duplicated.
  async duplicateSite(
    sourceId: string,
    options: { withContent: boolean; author: Author },
  ): Promise<Site> {
    const source = await this.getSite(sourceId);
    const now = new Date().toISOString();
    const name = `${source.name} (Kopie)`;
    const taken = new Set(
      (
        await this.#db.query<{ slug: string }>(`SELECT slug FROM sites`)
      ).rows.map((row) => row.slug),
    );
    const base = slugify(name);
    let slug = base;
    for (let attempt = 2; taken.has(slug) && attempt < 100; attempt += 1) {
      slug = `${base}-${attempt}`;
    }
    if (taken.has(slug)) {
      throw new SenifyError("conflict", `Site slug "${base}" is already in use`, {
        field: "slug",
        suggestion: "Rename the source site or free the slug.",
      });
    }

    const themeRow = (
      await this.#db.query<{
        name: string;
        definition: unknown;
        version: unknown;
      }>(`SELECT name, definition, version FROM themes WHERE site_id = $1`, [
        sourceId,
      ])
    ).rows[0];
    const pageRows = (
      await this.#db.query<{
        path: string;
        title: string;
        meta: unknown;
        draft: unknown;
        draft_version: unknown;
      }>(
        `SELECT path, title, meta, draft, draft_version FROM pages WHERE site_id = $1 ORDER BY created_at ASC, id ASC`,
        [sourceId],
      )
    ).rows;
    const collectionRows = (
      await this.#db.query<{
        id: string;
        name: string;
        slug: string;
        fields: unknown;
        title_field: string;
        date_field: string | null;
        url_pattern: string | null;
        supports: unknown;
        list_columns: unknown;
        description: string | null;
        deprecated_at: unknown;
      }>(
        `SELECT id, name, slug, fields, title_field, date_field, url_pattern, supports, list_columns, description, deprecated_at
         FROM collections WHERE site_id = $1 ORDER BY created_at ASC, id ASC`,
        [sourceId],
      )
    ).rows;
    const entryRows = options.withContent
      ? (
          await this.#db.query<{
            collection_id: string;
            slug: string;
            cells: unknown;
            search_text: string;
          }>(
            `SELECT collection_id, slug, cells, search_text FROM entries
             WHERE site_id = $1 AND deleted_at IS NULL
             ORDER BY created_at ASC, id ASC`,
            [sourceId],
          )
        ).rows
      : [];

    const siteId = newEntityId();
    await this.#db.withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO sites (id, name, slug, profile, theme_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $5)`,
        [siteId, name, slug, source.profile, now],
      );
      if (themeRow) {
        const themeId = newEntityId();
        await tx.query(
          `INSERT INTO themes (id, site_id, name, definition, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [
            themeId,
            siteId,
            themeRow.name,
            toJsonParam(themeRow.definition),
            themeRow.version,
            now,
          ],
        );
        await tx.query(`UPDATE sites SET theme_id = $2 WHERE id = $1`, [
          siteId,
          themeId,
        ]);
      }
      for (const page of pageRows) {
        await tx.query(
          `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          [
            newEntityId(),
            siteId,
            page.path,
            page.title,
            toJsonParam(page.meta),
            toJsonParam(page.draft),
            page.draft_version,
            now,
          ],
        );
      }
      const collectionIds = new Map<string, string>();
      for (const collection of collectionRows) {
        const newId = newEntityId();
        collectionIds.set(collection.id, newId);
        await tx.query(
          `INSERT INTO collections (id, site_id, name, slug, fields, title_field, date_field, url_pattern, supports, list_columns, description, deprecated_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
          [
            newId,
            siteId,
            collection.name,
            collection.slug,
            toJsonParam(collection.fields),
            collection.title_field,
            collection.date_field,
            collection.url_pattern,
            toJsonParam(collection.supports),
            toJsonParam(collection.list_columns),
            collection.description,
            collection.deprecated_at,
            now,
          ],
        );
      }
      for (const entry of entryRows) {
        const collectionId = collectionIds.get(entry.collection_id);
        if (!collectionId) continue;
        await tx.query(
          `INSERT INTO entries (id, site_id, collection_id, slug, status, cells, active_version_id, version, author, search_text, published_at, scheduled_at, deleted_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'draft', $5, NULL, 1, $6, $7, NULL, NULL, NULL, $8, $8)`,
          [
            newEntityId(),
            siteId,
            collectionId,
            entry.slug,
            toJsonParam(entry.cells),
            toJsonParam(options.author),
            entry.search_text,
            now,
          ],
        );
      }
    });
    await this.recordSiteEvent({
      siteId,
      mutation: "duplicate_site",
      params: {
        sourceSiteId: sourceId,
        withContent: options.withContent,
        pages: pageRows.length,
        entries: entryRows.length,
      },
      author: options.author,
    });
    return this.getSite(siteId);
  }

  // Site-level activity (rename, trash, duplicate, theme) lands in the same
  // append-only audit log the page mutations use.
  async recordSiteEvent(input: {
    siteId: string;
    mutation: string;
    params: Record<string, unknown>;
    author: Author;
  }): Promise<void> {
    const { text, params } = buildAuditInsert([
      {
        siteId: input.siteId,
        pageId: null,
        batchId: newEntityId(),
        opIndex: 0,
        mutation: input.mutation,
        params: input.params,
        author: input.author,
        undoPatch: [],
        draftVersionAfter: 0,
      },
    ]);
    await this.#db.query(text, params);
  }

  async ensureSiteTheme(siteId: string): Promise<ThemeRow> {
    const existing = await this.#db.query<ThemeRow>(
      `SELECT id, site_id, name, definition, version, created_at, updated_at
       FROM themes WHERE site_id = $1`,
      [siteId],
    );
    const found = existing.rows[0];
    if (found) return found;
    const id = newEntityId();
    const definition: Theme = { ...defaultTheme(), id };
    const issues = validateTheme(definition);
    if (issues.length > 0) {
      throw new Error(
        `Default theme is invalid: ${issues[0]?.message ?? "unknown error"}`,
      );
    }
    const now = new Date().toISOString();
    try {
      const inserted = await this.#db.query<ThemeRow>(
        `INSERT INTO themes (id, site_id, name, definition, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, $5, $5)
         RETURNING id, site_id, name, definition, version, created_at, updated_at`,
        [id, siteId, definition.name, toJsonParam(definition), now],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Theme insert returned no row");
      await this.#db.query(
        `UPDATE sites SET theme_id = $2, updated_at = $3 WHERE id = $1`,
        [siteId, id, now],
      );
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Lost the race: another writer created the theme first.
        const retry = await this.#db.query<ThemeRow>(
          `SELECT id, site_id, name, definition, version, created_at, updated_at
           FROM themes WHERE site_id = $1`,
          [siteId],
        );
        const row = retry.rows[0];
        if (!row) throw error;
        return row;
      }
      throw error;
    }
  }

  async getTheme(siteId: string): Promise<SiteTheme> {
    await this.getSite(siteId);
    // Lazy ensure is intentional: themes created before T04 (none in
    // practice — greenfield) or restored backups still resolve.
    return mapThemeRow(await this.ensureSiteTheme(siteId));
  }

  async updateTheme(
    siteId: string,
    patch: Record<string, unknown>,
    author: Author,
  ): Promise<SiteTheme> {
    if (Object.keys(patch).length === 0) {
      throw new SenifyError("validation", "Theme patch is empty", {
        field: "theme",
        suggestion: "Provide at least one change.",
      });
    }
    await this.getSite(siteId);
    const current = await this.ensureSiteTheme(siteId);
    const currentDefinition = toJson<Theme>(current.definition);
    const merged = mergeThemePatch(currentDefinition, patch);
    merged.id = current.id;
    validateShape(ThemeSchema, merged, "theme");
    const issues = validateTheme(merged);
    if (issues.length > 0) {
      const first = issues[0];
      const extra =
        issues.length > 1 ? ` Plus ${issues.length - 1} more theme problems.` : "";
      throw new SenifyError(
        "validation",
        `Invalid theme: ${first?.message ?? "value does not resolve"}`,
        {
          field: first?.path ?? "theme",
          suggestion: `${first?.suggestion ?? "Fix the flagged value."}${extra}`,
        },
      );
    }
    const now = new Date().toISOString();
    await this.#db.withTransaction(async (tx) => {
      const updated = await tx.query<{ version: unknown }>(
        `UPDATE themes SET definition = $2, name = $3, version = version + 1, updated_at = $4
         WHERE id = $1 RETURNING version`,
        [current.id, toJsonParam(merged), merged.name, now],
      );
      const versionRow = updated.rows[0];
      if (!versionRow) {
        throw new SenifyError("not_found", `Theme for site "${siteId}" does not exist`, {
          field: "siteId",
        });
      }
      const newVersion = toFiniteNumber(versionRow.version, "version");
      const { text, params } = buildAuditInsert([
        {
          siteId,
          pageId: null,
          batchId: newEntityId(),
          opIndex: 0,
          mutation: "update_theme",
          params: { patch, previous: currentDefinition },
          author,
          undoPatch: [],
          draftVersionAfter: newVersion,
        },
      ]);
      await tx.query(text, params);
      return newVersion;
    });
    return this.getTheme(siteId);
  }

  async listPageDrafts(siteId: string): Promise<Page[]> {
    await this.getSite(siteId);
    const result = await this.#db.query<PageRow>(
      `SELECT ${PAGE_COLUMNS}
       FROM pages p LEFT JOIN page_templates pt ON pt.page_id = p.id
       WHERE p.site_id = $1 ORDER BY p.created_at ASC, p.id ASC`,
      [siteId],
    );
    return result.rows.map((row) => mapPage(row));
  }

  async createPage(siteId: string, input: CreatePageInput): Promise<Page> {
    await this.getSite(siteId);
    const title = input.title?.trim() ? input.title.trim() : "Neue Seite";
    const now = new Date().toISOString();
    const id = newEntityId();
    const rootId = newNodeId();
    const draft: NodeTree = {
      rootNodeId: rootId,
      nodes: { [rootId]: { id: rootId, type: PAGE_ROOT_TYPE, props: {} } },
    };

    if (input.path !== undefined) {
      const path = input.path.trim();
      assertPagePathFormat(path);
      try {
        return await this.#insertPage(id, siteId, path, title, draft, now);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new SenifyError(
            "conflict",
            `Page path "${path}" is already in use on this site`,
            {
              field: "path",
              suggestion: "Choose a different page path.",
            },
          );
        }
        throw error;
      }
    }
    const existing = await this.#pageCount(siteId);
    // TOCTOU note: two concurrent first-page creates can both read 0 and
    // race for "/". The UNIQUE(site_id, path) constraint decides; the loser
    // retries through the suffix loop below instead of failing.
    if (existing === 0) {
      try {
        return await this.#insertPage(id, siteId, "/", title, draft, now);
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Lost the race for "/" — fall through to suffix generation below.
        } else {
          throw error;
        }
      }
    }
    const base = slugify(title);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const path = attempt === 0 ? `/${base}` : `/${base}-${attempt + 1}`;
      try {
        return await this.#insertPage(id, siteId, path, title, draft, now);
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw new SenifyError("conflict", `Page path "/${base}" is already in use`, {
      field: "path",
      suggestion: "Choose a different page path.",
    });
  }

  async #pageCount(siteId: string): Promise<number> {
    const result = await this.#db.query<{ count: unknown }>(
      `SELECT COUNT(*) AS count FROM pages WHERE site_id = $1`,
      [siteId],
    );
    return toFiniteNumber(result.rows[0]?.count ?? 0, "count");
  }

  async #insertPage(
    id: string,
    siteId: string,
    path: string,
    title: string,
    draft: NodeTree,
    now: string,
  ): Promise<Page> {
    const result = await this.#db.query<PageRow>(
      `INSERT INTO pages (id, site_id, path, title, meta, draft, draft_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $7)
       RETURNING id, site_id, path, title, meta, draft, draft_version, created_at, updated_at`,
      [id, siteId, path, title, toJsonParam({}), toJsonParam(draft), now],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Page insert returned no row");
    return mapPage(row);
  }

  async listPages(siteId: string): Promise<PageSummary[]> {
    await this.getSite(siteId);
    const result = await this.#db.query<PageSummaryRow>(
      `SELECT ${PAGE_SUMMARY_COLUMNS}
       FROM pages p LEFT JOIN page_templates pt ON pt.page_id = p.id
       WHERE p.site_id = $1 ORDER BY p.created_at ASC, p.id ASC`,
      [siteId],
    );
    return result.rows.map((row) => toSummary(row));
  }

  async getPage(id: string): Promise<Page> {
    const result = await this.#db.query<PageRow>(
      `SELECT ${PAGE_COLUMNS}
       FROM pages p LEFT JOIN page_templates pt ON pt.page_id = p.id
       WHERE p.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Page "${id}" does not exist`, {
        field: "pageId",
        suggestion: "Create the page first or check the id.",
      });
    }
    return mapPage(row);
  }

  // Upsert of the template/layout row (the page itself is never touched).
  async setPageTemplate(input: {
    pageId: string;
    template: PageTemplate | null;
    layoutId: string | null;
  }): Promise<Page> {
    const now = new Date().toISOString();
    const kind = input.template?.kind ?? null;
    const collectionIds =
      input.template?.kind === "collection" ? input.template.collectionIds : [];
    const priority = input.template?.kind === "collection" ? input.template.priority : 0;
    await this.#db.query(
      `INSERT INTO page_templates
        (page_id, kind, collection_ids, priority, layout_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (page_id) DO UPDATE SET
         kind = EXCLUDED.kind,
         collection_ids = EXCLUDED.collection_ids,
         priority = EXCLUDED.priority,
         layout_id = EXCLUDED.layout_id,
         updated_at = EXCLUDED.updated_at`,
      [
        input.pageId,
        kind,
        toJsonParam(collectionIds),
        priority,
        input.layoutId,
        now,
      ],
    );
    return this.getPage(input.pageId);
  }

  async deletePage(id: string): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM pages WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Page "${id}" does not exist`, {
        field: "pageId",
      });
    }
  }

  async updatePage(
    id: string,
    expectedVersion: number,
    changes: { draft: NodeTree; title: string; path: string },
  ): Promise<number> {
    assertPagePathFormat(changes.path);
    try {
      const result = await this.#db.query<{ draft_version: unknown }>(
        `UPDATE pages
         SET draft = $2, title = $3, path = $4, draft_version = draft_version + 1, updated_at = $5
         WHERE id = $1 AND draft_version = $6
         RETURNING draft_version`,
        [id, toJsonParam(changes.draft), changes.title, changes.path, new Date().toISOString(), expectedVersion],
      );
      const row = result.rows[0];
      if (!row) {
        const current = await this.#db.query<{ draft_version: unknown }>(
          `SELECT draft_version FROM pages WHERE id = $1`,
          [id],
        );
        const currentRow = current.rows[0];
        if (!currentRow) {
          throw new SenifyError("not_found", `Page "${id}" does not exist`, {
            field: "pageId",
          });
        }
        throw draftConflictError(
          expectedVersion,
          toFiniteNumber(currentRow.draft_version, "draft_version"),
        );
      }
      return Number(row.draft_version);
    } catch (error) {
      if (error instanceof SenifyError) throw error;
      if (isUniqueViolation(error)) {
        throw new SenifyError(
          "conflict",
          `Page path "${changes.path}" is already in use on this site`,
          {
            field: "path",
            suggestion: "Choose a different page path.",
          },
        );
      }
      throw error;
    }
  }

  async appendAudit(entries: NewAuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const { text, params } = buildAuditInsert(entries);
    await this.#db.query(text, params);
  }

  async assertPathFree(
    siteId: string,
    pageId: string,
    path: string,
  ): Promise<void> {
    assertPagePathFormat(path);
    const result = await this.#db.query<{ id: string }>(
      `SELECT id FROM pages WHERE site_id = $1 AND path = $2 AND id <> $3`,
      [siteId, path, pageId],
    );
    if (result.rows.length > 0) {
      throw new SenifyError(
        "conflict",
        `Page path "${path}" is already in use on this site`,
        {
          field: "path",
          suggestion: "Choose a different page path.",
        },
      );
    }
  }

  async persistBatch(input: {
    pageId: string;
    expectedVersion: number;
    draft: NodeTree;
    title: string;
    path: string;
    entries: NewAuditEntry[];
  }): Promise<number> {
    assertPagePathFormat(input.path);
    try {
      return await this.#db.withTransaction(async (tx) => {
        const updated = await tx.query<{ draft_version: unknown }>(
          `UPDATE pages
           SET draft = $2, title = $3, path = $4, draft_version = draft_version + 1, updated_at = $5
           WHERE id = $1 AND draft_version = $6
           RETURNING draft_version`,
          [
            input.pageId,
            toJsonParam(input.draft),
            input.title,
            input.path,
            new Date().toISOString(),
            input.expectedVersion,
          ],
        );
        const row = updated.rows[0];
        if (!row) {
          const current = await tx.query<{ draft_version: unknown }>(
            `SELECT draft_version FROM pages WHERE id = $1`,
            [input.pageId],
          );
          const currentRow = current.rows[0];
          if (!currentRow) {
            throw new SenifyError("not_found", `Page "${input.pageId}" does not exist`, {
              field: "pageId",
            });
          }
          throw draftConflictError(
            input.expectedVersion,
            toFiniteNumber(currentRow.draft_version, "draft_version"),
          );
        }
        if (input.entries.length > 0) {
          const stamped = input.entries.map((entry) => ({
            ...entry,
            draftVersionAfter: toFiniteNumber(row.draft_version, "draft_version"),
          }));
          const { text, params } = buildAuditInsert(stamped);
          await tx.query(text, params);
        }
        return toFiniteNumber(row.draft_version, "draft_version");
      });
    } catch (error) {
      if (error instanceof SenifyError) throw error;
      if (isUniqueViolation(error)) {
        throw new SenifyError(
          "conflict",
          `Page path "${input.path}" is already in use on this site`,
          {
            field: "path",
            suggestion: "Choose a different page path.",
          },
        );
      }
      throw error;
    }
  }

  async listAudit(pageId: string, limit = 50): Promise<AuditEntry[]> {
    const result = await this.#db.query<AuditRow>(
      `SELECT id, site_id, page_id, batch_id, op_index, mutation, params, author, undo_patch, draft_version_after, created_at
       FROM audit_entries WHERE page_id = $1
       ORDER BY created_at DESC, op_index DESC, id DESC LIMIT $2`,
      [pageId, Math.max(1, Math.min(500, limit))],
    );
    return result.rows.map(mapAudit);
  }

  async listSiteAudit(siteId: string, limit = 50): Promise<AuditEntry[]> {
    const result = await this.#db.query<AuditRow>(
      `SELECT id, site_id, page_id, batch_id, op_index, mutation, params, author, undo_patch, draft_version_after, created_at
       FROM audit_entries WHERE site_id = $1
       ORDER BY created_at DESC, op_index DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(500, limit))],
    );
    return result.rows.map(mapAudit);
  }

  async createToken(input: {
    name: string;
    scopes: TokenScope[];
    expiresAt: string | null;
  }): Promise<{ token: ApiToken; secret: string }> {
    const name = input.name.trim();
    if (!name) {
      throw new SenifyError("validation", "Token name is required", {
        field: "name",
        suggestion: "Give the client a name, e.g. \"Claude Code\".",
      });
    }
    const scopes = [...new Set(input.scopes)];
    if (scopes.length === 0) {
      throw new SenifyError("validation", "A token needs at least one scope", {
        field: "scopes",
        suggestion: 'Use one or more of "read", "write", "publish".',
      });
    }
    const generated = generateToken();
    const id = newEntityId();
    await this.#db.query(
      `INSERT INTO api_tokens
        (id, name, scopes, token_hash, token_prefix, created_at, expires_at, last_used_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL)`,
      [
        id,
        name,
        toJsonParam(scopes),
        generated.hash,
        generated.prefix,
        new Date().toISOString(),
        input.expiresAt,
      ],
    );
    return { token: await this.getToken(id), secret: generated.secret };
  }

  async getToken(id: string): Promise<ApiToken> {
    const result = await this.#db.query<TokenRow>(
      `SELECT id, name, scopes, token_prefix, created_at, expires_at, last_used_at, revoked_at
       FROM api_tokens WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Token "${id}" does not exist`, {
        field: "tokenId",
        suggestion: "List tokens with `senify tokens list`.",
      });
    }
    return mapToken(row);
  }

  async listTokens(): Promise<ApiToken[]> {
    const result = await this.#db.query<TokenRow>(
      `SELECT id, name, scopes, token_prefix, created_at, expires_at, last_used_at, revoked_at
       FROM api_tokens ORDER BY created_at DESC, id DESC`,
    );
    return result.rows.map(mapToken);
  }

  async findTokenByHash(tokenHash: string): Promise<TokenRecord | undefined> {
    const result = await this.#db.query<TokenRecordRow>(
      `SELECT id, name, scopes, token_hash, token_prefix, created_at, expires_at, last_used_at, revoked_at
       FROM api_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return { ...mapToken(row), tokenHash: row.token_hash };
  }

  async revokeToken(id: string): Promise<void> {
    const revoked = await this.#db.query<{ id: string }>(
      `UPDATE api_tokens SET revoked_at = $2
       WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
      [id, new Date().toISOString()],
    );
    if (revoked.rows.length > 0) return;
    // Unknown ids surface as not_found; revoking twice stays idempotent.
    await this.getToken(id);
  }

  async touchToken(id: string): Promise<void> {
    await this.#db.query(
      `UPDATE api_tokens SET last_used_at = $2 WHERE id = $1`,
      [id, new Date().toISOString()],
    );
  }

  async appendMcpAudit(input: {
    tokenId: string | null;
    client: string;
    tool: string;
    args: Record<string, unknown>;
    result: "ok" | "error";
    entity: string | null;
    durationMs: number;
  }): Promise<McpAuditEntry> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO mcp_audit_entries
        (id, token_id, client, tool, args, result, entity, duration_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.tokenId,
        input.client,
        input.tool,
        toJsonParam(input.args),
        input.result,
        input.entity,
        input.durationMs,
        createdAt,
      ],
    );
    return { id, ...input, createdAt };
  }

  async listMcpAudit(limit = 50): Promise<McpAuditEntry[]> {
    const result = await this.#db.query<McpAuditRow>(
      `SELECT id, token_id, client, tool, args, result, entity, duration_ms, created_at
       FROM mcp_audit_entries
       ORDER BY created_at DESC, id DESC LIMIT $1`,
      [Math.max(1, Math.min(500, limit))],
    );
    return result.rows.map(mapMcpAudit);
  }

  async createRevision(input: {
    pageId: string;
    siteId: string;
    title: string;
    path: string;
    tree: NodeTree;
    author: Author;
    note: string | null;
  }): Promise<PageRevision> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO page_revisions
        (id, page_id, site_id, tree, title, path, author, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.pageId,
        input.siteId,
        toJsonParam(input.tree),
        input.title,
        input.path,
        toJsonParam(input.author),
        input.note,
        createdAt,
      ],
    );
    return {
      id,
      pageId: input.pageId,
      siteId: input.siteId,
      title: input.title,
      path: input.path,
      tree: input.tree,
      author: input.author,
      note: input.note,
      createdAt,
    };
  }

  async getRevision(id: string): Promise<PageRevision> {
    const result = await this.#db.query<RevisionRow>(
      `SELECT id, page_id, site_id, tree, title, path, author, note, created_at
       FROM page_revisions WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Revision "${id}" does not exist`, {
        field: "revisionId",
      });
    }
    return mapRevision(row);
  }

  async listRevisions(pageId: string, limit = 50): Promise<RevisionSummary[]> {
    const result = await this.#db.query<RevisionRow>(
      `SELECT id, page_id, site_id, tree, title, path, author, note, created_at
       FROM page_revisions WHERE page_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [pageId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapRevision).map(toRevisionSummary);
  }

  async createRelease(input: {
    siteId: string;
    pageRevisions: ReleasePageRevision[];
    themeSnapshot: unknown;
    buildRef: string | null;
    author: Author;
    note: string | null;
    basisReleaseId: string | null;
  }): Promise<Release> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO releases
        (id, site_id, page_revisions, theme_snapshot, build_ref, author, note, basis_release_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.siteId,
        toJsonParam(input.pageRevisions),
        toJsonParam(input.themeSnapshot),
        input.buildRef,
        toJsonParam(input.author),
        input.note,
        input.basisReleaseId,
        createdAt,
      ],
    );
    return {
      id,
      siteId: input.siteId,
      pageRevisions: input.pageRevisions,
      themeSnapshot: input.themeSnapshot,
      buildRef: input.buildRef,
      author: input.author,
      note: input.note,
      basisReleaseId: input.basisReleaseId,
      createdAt,
    };
  }

  async getRelease(id: string): Promise<Release> {
    const result = await this.#db.query<ReleaseRow>(
      `SELECT id, site_id, page_revisions, theme_snapshot, build_ref, author, note, basis_release_id, created_at
       FROM releases WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Release "${id}" does not exist`, {
        field: "releaseId",
      });
    }
    return mapRelease(row);
  }

  async listReleases(siteId: string, limit = 50): Promise<Release[]> {
    const result = await this.#db.query<ReleaseRow>(
      `SELECT id, site_id, page_revisions, theme_snapshot, build_ref, author, note, basis_release_id, created_at
       FROM releases WHERE site_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapRelease);
  }

  async getActiveReleaseId(siteId: string): Promise<string | null> {
    const result = await this.#db.query<{ release_id: string }>(
      `SELECT release_id FROM active_releases WHERE site_id = $1`,
      [siteId],
    );
    return result.rows[0]?.release_id ?? null;
  }

  async attachReleaseBuild(id: string, buildRef: string): Promise<void> {
    await this.#db.query(`UPDATE releases SET build_ref = $2 WHERE id = $1`, [
      id,
      buildRef,
    ]);
  }

  async setActiveRelease(siteId: string, releaseId: string): Promise<void> {
    const now = new Date().toISOString();
    const updated = await this.#db.query<{ site_id: string }>(
      `UPDATE active_releases SET release_id = $2, updated_at = $3
       WHERE site_id = $1 RETURNING site_id`,
      [siteId, releaseId, now],
    );
    if (updated.rows.length > 0) return;
    await this.#db.query(
      `INSERT INTO active_releases (site_id, release_id, updated_at)
       VALUES ($1, $2, $3)`,
      [siteId, releaseId, now],
    );
  }

  async createPreview(input: {
    siteId: string;
    buildRef: string;
    token: string;
    createdBy: Author;
    expiresAt: string;
  }): Promise<Preview> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    await this.#db.query(
      `INSERT INTO previews
        (id, site_id, build_ref, token, status, created_by, created_at, expires_at)
       VALUES ($1, $2, $3, $4, 'ready', $5, $6, $7)`,
      [
        id,
        input.siteId,
        input.buildRef,
        input.token,
        toJsonParam(input.createdBy),
        createdAt,
        input.expiresAt,
      ],
    );
    return {
      id,
      siteId: input.siteId,
      buildRef: input.buildRef,
      token: input.token,
      status: "ready",
      createdBy: input.createdBy,
      createdAt,
      expiresAt: input.expiresAt,
    };
  }

  async getPreview(id: string): Promise<Preview> {
    const result = await this.#db.query<PreviewRow>(
      `SELECT id, site_id, build_ref, token, status, created_by, created_at, expires_at
       FROM previews WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Preview "${id}" does not exist`, {
        field: "previewId",
      });
    }
    return mapPreview(row);
  }

  async listPreviews(siteId: string, limit = 50): Promise<Preview[]> {
    const result = await this.#db.query<PreviewRow>(
      `SELECT id, site_id, build_ref, token, status, created_by, created_at, expires_at
       FROM previews WHERE site_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapPreview);
  }

  async markPreviewExpired(id: string): Promise<void> {
    await this.#db.query(
      `UPDATE previews SET status = 'expired' WHERE id = $1 AND status <> 'expired'`,
      [id],
    );
  }

  async createReviewItem(input: {
    siteId: string;
    previewId: string | null;
    baseState: ReviewItem["baseState"];
    pages: string[];
    author: Author;
    structureDiff: StructureChange[];
    guardrails: ReviewItem["guardrails"];
    note: string | null;
  }): Promise<ReviewItem> {
    const id = newEntityId();
    const createdAt = new Date().toISOString();
    const thread: ReviewComment[] = input.note
      ? [{ at: createdAt, author: input.author, note: input.note }]
      : [];
    const status: ReviewStatus = "submitted";
    await this.#db.query(
      `INSERT INTO review_items
        (id, site_id, preview_id, base_state, pages, author, status, structure_diff, guardrails, thread, release_id, created_at, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, NULL)`,
      [
        id,
        input.siteId,
        input.previewId,
        toJsonParam(input.baseState),
        toJsonParam(input.pages),
        toJsonParam(input.author),
        status,
        toJsonParam(input.structureDiff),
        toJsonParam(input.guardrails),
        toJsonParam(thread),
        createdAt,
      ],
    );
    return {
      id,
      siteId: input.siteId,
      previewId: input.previewId,
      baseState: input.baseState,
      pages: input.pages,
      author: input.author,
      status,
      structureDiff: input.structureDiff,
      guardrails: input.guardrails,
      thread,
      releaseId: null,
      createdAt,
      resolvedAt: null,
    };
  }

  async getReviewItem(id: string): Promise<ReviewItem> {
    const result = await this.#db.query<ReviewRow>(
      `SELECT id, site_id, preview_id, base_state, pages, author, status, structure_diff, guardrails, thread, release_id, created_at, resolved_at
       FROM review_items WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Review item "${id}" does not exist`, {
        field: "reviewId",
      });
    }
    return mapReviewItem(row);
  }

  async listReviewItems(
    siteId: string,
    options: { status?: ReviewStatus; limit?: number } = {},
  ): Promise<ReviewItem[]> {
    const limit = Math.max(1, Math.min(200, options.limit ?? 50));
    const result = options.status
      ? await this.#db.query<ReviewRow>(
          `SELECT id, site_id, preview_id, base_state, pages, author, status, structure_diff, guardrails, thread, release_id, created_at, resolved_at
           FROM review_items WHERE site_id = $1 AND status = $2
           ORDER BY created_at DESC, id DESC LIMIT $3`,
          [siteId, options.status, limit],
        )
      : await this.#db.query<ReviewRow>(
          `SELECT id, site_id, preview_id, base_state, pages, author, status, structure_diff, guardrails, thread, release_id, created_at, resolved_at
           FROM review_items WHERE site_id = $1
           ORDER BY created_at DESC, id DESC LIMIT $2`,
          [siteId, limit],
        );
    return result.rows.map(mapReviewItem);
  }

  async updateReviewItem(
    id: string,
    patch: {
      status?: ReviewStatus;
      comment?: ReviewComment;
      releaseId?: string | null;
      resolvedAt?: string | null;
    },
  ): Promise<ReviewItem> {
    const current = await this.getReviewItem(id);
    const thread = patch.comment
      ? [...current.thread, patch.comment]
      : current.thread;
    const status = patch.status ?? current.status;
    const releaseId =
      patch.releaseId === undefined ? current.releaseId : patch.releaseId;
    const resolvedAt =
      patch.resolvedAt === undefined ? current.resolvedAt : patch.resolvedAt;
    await this.#db.query(
      `UPDATE review_items
       SET status = $2, thread = $3, release_id = $4, resolved_at = $5
       WHERE id = $1`,
      [id, status, toJsonParam(thread), releaseId, resolvedAt],
    );
    return {
      ...current,
      status,
      thread,
      releaseId,
      resolvedAt,
    };
  }

  // Loads encoded variants and blur hashes for a set of assets in two queries
  // and merges them onto the mapped rows (single fetch per read path).
  async #attachDerivatives(assets: Asset[]): Promise<Asset[]> {
    if (assets.length === 0) return assets;
    const ids = assets.map((asset) => asset.id);
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    const [variantRows, blurhashRows] = await Promise.all([
      this.#db.query<AssetVariantRow>(
        `SELECT id, asset_id, width, format, storage_ref, byte_size, created_at
         FROM asset_variants WHERE asset_id IN (${placeholders})
         ORDER BY asset_id ASC, width ASC, format ASC, id ASC`,
        ids,
      ),
      this.#db.query<{ asset_id: string; value: string }>(
        `SELECT asset_id, value FROM asset_blurhash
         WHERE asset_id IN (${placeholders})`,
        ids,
      ),
    ]);
    const variants = new Map<string, AssetVariant[]>();
    for (const row of variantRows.rows) {
      const list = variants.get(row.asset_id) ?? [];
      list.push(mapAssetVariant(row));
      variants.set(row.asset_id, list);
    }
    const blurhashes = new Map(
      blurhashRows.rows.map((row) => [row.asset_id, row.value]),
    );
    return assets.map((asset) => ({
      ...asset,
      variants: variants.get(asset.id) ?? [],
      blurhash: blurhashes.get(asset.id) ?? null,
    }));
  }

  async createAsset(input: {
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
  }): Promise<Asset> {
    const now = new Date().toISOString();
    const result = await this.#db.query<AssetRow>(
      `INSERT INTO assets
        (id, site_id, filename, mime, kind, byte_size, width, height, hash, alt_text, decorative, folder_id, tags, storage_ref, status, replaced_at, trashed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'ready', NULL, NULL, $15, $15)
       RETURNING ${ASSET_COLUMNS}`,
      [
        input.id,
        input.siteId,
        input.filename,
        input.mime,
        input.kind,
        input.byteSize,
        input.width,
        input.height,
        input.hash,
        input.altText,
        input.decorative,
        input.folderId,
        toJsonParam(input.tags),
        input.storageRef,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Asset insert returned no row");
    return mapAsset(row);
  }

  async getAsset(id: string): Promise<Asset> {
    const result = await this.#db.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Asset "${id}" does not exist`, {
        field: "assetId",
        suggestion: "List the library with `list_assets` or check the id.",
      });
    }
    const asset = mapAsset(row);
    const [withDerivatives = asset] = await this.#attachDerivatives([asset]);
    return withDerivatives;
  }

  // Dedupe only looks at live assets: re-uploading the same bytes after a trash
  // must create a fresh, usable record.
  async findAssetByHash(siteId: string, hash: string): Promise<Asset | undefined> {
    const result = await this.#db.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM assets
       WHERE site_id = $1 AND hash = $2 AND status = 'ready'
       ORDER BY created_at ASC, id ASC LIMIT 1`,
      [siteId, hash],
    );
    const row = result.rows[0];
    return row ? (await this.#attachDerivatives([mapAsset(row)]))[0] : undefined;
  }

  async listAssets(
    siteId: string,
    options: { status?: AssetStatus | "all" } = {},
  ): Promise<Asset[]> {
    const status = options.status ?? "ready";
    await this.getSite(siteId);
    const result =
      status === "all"
        ? await this.#db.query<AssetRow>(
            `SELECT ${ASSET_COLUMNS} FROM assets WHERE site_id = $1
             ORDER BY created_at DESC, id DESC`,
            [siteId],
          )
        : await this.#db.query<AssetRow>(
            `SELECT ${ASSET_COLUMNS} FROM assets WHERE site_id = $1 AND status = $2
             ORDER BY created_at DESC, id DESC`,
            [siteId, status],
          );
    return this.#attachDerivatives(result.rows.map(mapAsset));
  }

  async updateAsset(id: string, patch: AssetUpdate): Promise<Asset> {
    const current = await this.getAsset(id);
    const next = {
      filename: patch.filename ?? current.filename,
      mime: patch.mime ?? current.mime,
      kind: patch.kind ?? current.kind,
      byteSize: patch.byteSize ?? current.byteSize,
      width: patch.width === undefined ? current.width : patch.width,
      height: patch.height === undefined ? current.height : patch.height,
      hash: patch.hash ?? current.hash,
      altText: patch.altText === undefined ? current.altText : patch.altText,
      decorative:
        patch.decorative === undefined ? current.decorative : patch.decorative,
      folderId: patch.folderId === undefined ? current.folderId : patch.folderId,
      tags: patch.tags ?? current.tags,
      storageRef: patch.storageRef ?? current.storageRef,
      status: patch.status ?? current.status,
      replacedAt:
        patch.replacedAt === undefined ? current.replacedAt : patch.replacedAt,
      trashedAt:
        patch.trashedAt === undefined ? current.trashedAt : patch.trashedAt,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    await this.#db.query(
      `UPDATE assets SET
         filename = $2, mime = $3, kind = $4, byte_size = $5, width = $6, height = $7,
         hash = $8, alt_text = $9, decorative = $10, folder_id = $11, tags = $12,
         storage_ref = $13, status = $14, replaced_at = $15, trashed_at = $16, updated_at = $17
       WHERE id = $1`,
      [
        id,
        next.filename,
        next.mime,
        next.kind,
        next.byteSize,
        next.width,
        next.height,
        next.hash,
        next.altText,
        next.decorative,
        next.folderId,
        toJsonParam(next.tags),
        next.storageRef,
        next.status,
        next.replacedAt,
        next.trashedAt,
        next.updatedAt,
      ],
    );
    return { ...current, ...next };
  }

  async deleteAssetRecord(id: string): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM assets WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Asset "${id}" does not exist`, {
        field: "assetId",
      });
    }
  }

  // Replaces ladder and blur hash atomically: callers regenerate both after an
  // upload or replace, so stale rows never survive a dimension change.
  async replaceAssetDerivatives(
    assetId: string,
    variants: readonly GeneratedVariant[],
    blurhash: string | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.#db.withTransaction(async (tx) => {
      await tx.query(`DELETE FROM asset_variants WHERE asset_id = $1`, [assetId]);
      await tx.query(`DELETE FROM asset_blurhash WHERE asset_id = $1`, [assetId]);
      for (const variant of variants) {
        await tx.query(
          `INSERT INTO asset_variants
            (id, asset_id, width, format, storage_ref, byte_size, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            newEntityId(),
            assetId,
            variant.width,
            variant.format,
            variant.storageRef,
            variant.byteSize,
            now,
          ],
        );
      }
      if (blurhash !== null) {
        await tx.query(
          `INSERT INTO asset_blurhash (asset_id, value, created_at) VALUES ($1, $2, $3)`,
          [assetId, blurhash, now],
        );
      }
    });
  }

  async deleteAssetDerivatives(assetId: string): Promise<void> {
    await this.#db.withTransaction(async (tx) => {
      await tx.query(`DELETE FROM asset_variants WHERE asset_id = $1`, [assetId]);
      await tx.query(`DELETE FROM asset_blurhash WHERE asset_id = $1`, [assetId]);
    });
  }

  // The check pipeline needs status + decorative for every asset of a site;
  // ids that are absent are "missing" for the caller.
  async assetUsageMap(siteId: string): Promise<Map<string, AssetUsage>> {
    const result = await this.#db.query<{
      id: string;
      status: string;
      decorative: unknown;
    }>(`SELECT id, status, decorative FROM assets WHERE site_id = $1`, [siteId]);
    const map = new Map<string, AssetUsage>();
    for (const row of result.rows) {
      map.set(row.id, {
        status: row.status === "trashed" ? "trashed" : "ready",
        decorative: row.decorative === true || row.decorative === "true",
      });
    }
    return map;
  }

  async createAssetFolder(input: {
    id: string;
    siteId: string;
    name: string;
    parentId: string | null;
  }): Promise<AssetFolder> {
    const createdAt = new Date().toISOString();
    const result = await this.#db.query<AssetFolderRow>(
      `INSERT INTO asset_folders (id, site_id, name, parent_id, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, site_id, name, parent_id, created_at`,
      [input.id, input.siteId, input.name, input.parentId, createdAt],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Asset folder insert returned no row");
    return mapAssetFolder(row);
  }

  async getAssetFolder(id: string): Promise<AssetFolder> {
    const result = await this.#db.query<AssetFolderRow>(
      `SELECT id, site_id, name, parent_id, created_at
       FROM asset_folders WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Asset folder "${id}" does not exist`, {
        field: "folderId",
      });
    }
    return mapAssetFolder(row);
  }

  async listAssetFolders(siteId: string): Promise<AssetFolder[]> {
    await this.getSite(siteId);
    const result = await this.#db.query<AssetFolderRow>(
      `SELECT id, site_id, name, parent_id, created_at
       FROM asset_folders WHERE site_id = $1 ORDER BY created_at ASC, id ASC`,
      [siteId],
    );
    return result.rows.map(mapAssetFolder);
  }

  // Deleting a folder never deletes content: assets and subfolders fall back
  // to "Ohne Ordner" (root), matching the library contract.
  async deleteAssetFolder(id: string): Promise<void> {
    await this.getAssetFolder(id);
    await this.#db.withTransaction(async (tx) => {
      await tx.query(`UPDATE assets SET folder_id = NULL WHERE folder_id = $1`, [id]);
      await tx.query(
        `UPDATE asset_folders SET parent_id = NULL WHERE parent_id = $1`,
        [id],
      );
      await tx.query(`DELETE FROM asset_folders WHERE id = $1`, [id]);
    });
  }

  async createAssetHistory(input: {
    id: string;
    assetId: string;
    storageRef: string;
    mime: string;
    byteSize: number;
  }): Promise<AssetHistoryEntry> {
    const createdAt = new Date().toISOString();
    const result = await this.#db.query<AssetHistoryRow>(
      `INSERT INTO asset_history (id, asset_id, storage_ref, mime, byte_size, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, asset_id, storage_ref, mime, byte_size, created_at`,
      [
        input.id,
        input.assetId,
        input.storageRef,
        input.mime,
        input.byteSize,
        createdAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Asset history insert returned no row");
    return mapAssetHistory(row);
  }

  async getAssetHistory(id: string): Promise<AssetHistoryEntry> {
    const result = await this.#db.query<AssetHistoryRow>(
      `SELECT id, asset_id, storage_ref, mime, byte_size, created_at
       FROM asset_history WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError(
        "not_found",
        `History entry "${id}" does not exist`,
        {
          field: "historyId",
          suggestion: "Read the file history with `GET /api/assets/:assetId/history`.",
        },
      );
    }
    return mapAssetHistory(row);
  }

  async listAssetHistory(assetId: string): Promise<AssetHistoryEntry[]> {
    await this.getAsset(assetId);
    const result = await this.#db.query<AssetHistoryRow>(
      `SELECT id, asset_id, storage_ref, mime, byte_size, created_at
       FROM asset_history WHERE asset_id = $1
       ORDER BY created_at DESC, id DESC`,
      [assetId],
    );
    return result.rows.map(mapAssetHistory);
  }

  async deleteAssetHistory(assetId: string): Promise<void> {
    await this.#db.query(`DELETE FROM asset_history WHERE asset_id = $1`, [
      assetId,
    ]);
  }

  // -------------------------------------------------------- collections (T09)

  async listCollections(
    siteId: string,
    options: { includeDeprecated?: boolean } = {},
  ): Promise<Collection[]> {
    await this.getSite(siteId);
    const result =
      options.includeDeprecated === true
        ? await this.#db.query<CollectionRow>(
            `SELECT ${COLLECTION_COLUMNS} FROM collections WHERE site_id = $1
             ORDER BY created_at ASC, id ASC`,
            [siteId],
          )
        : await this.#db.query<CollectionRow>(
            `SELECT ${COLLECTION_COLUMNS} FROM collections
             WHERE site_id = $1 AND deprecated_at IS NULL
             ORDER BY created_at ASC, id ASC`,
            [siteId],
          );
    return result.rows.map(mapCollection);
  }

  async getCollection(id: string): Promise<Collection> {
    const result = await this.#db.query<CollectionRow>(
      `SELECT ${COLLECTION_COLUMNS} FROM collections WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Collection "${id}" does not exist`, {
        field: "collectionId",
        suggestion: "List the collections of the site with list_collections.",
      });
    }
    return mapCollection(row);
  }

  async findCollectionBySlug(
    siteId: string,
    slug: string,
  ): Promise<Collection | undefined> {
    const result = await this.#db.query<CollectionRow>(
      `SELECT ${COLLECTION_COLUMNS} FROM collections
       WHERE site_id = $1 AND slug = $2`,
      [siteId, slug],
    );
    const row = result.rows[0];
    return row ? mapCollection(row) : undefined;
  }

  async createCollection(input: {
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
  }): Promise<Collection> {
    const now = new Date().toISOString();
    try {
      const result = await this.#db.query<CollectionRow>(
        `INSERT INTO collections
          (id, site_id, name, slug, fields, title_field, date_field, url_pattern,
           supports, list_columns, description, deprecated_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
         RETURNING ${COLLECTION_COLUMNS}`,
        [
          input.id,
          input.siteId,
          input.name,
          input.slug,
          toJsonParam(input.fields),
          input.titleField,
          input.dateField,
          input.urlPattern,
          toJsonParam(input.supports),
          toJsonParam(input.listColumns),
          input.description,
          input.deprecatedAt,
          now,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Collection insert returned no row");
      return mapCollection(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SenifyError(
          "conflict",
          `Collection slug "${input.slug}" is already in use on this site`,
          {
            field: "slug",
            suggestion: "Choose a different collection slug.",
          },
        );
      }
      throw error;
    }
  }

  async updateCollection(
    id: string,
    next: {
      name: string;
      fields: FieldDef[];
      titleField: string;
      dateField: string | null;
      urlPattern: string | null;
      supports: SupportsFlag[];
      listColumns: string[];
      description: string | null;
      deprecatedAt: string | null;
    },
  ): Promise<Collection> {
    const updatedAt = new Date().toISOString();
    const result = await this.#db.query<CollectionRow>(
      `UPDATE collections SET
         name = $2, fields = $3, title_field = $4, date_field = $5,
         url_pattern = $6, supports = $7, list_columns = $8, description = $9,
         deprecated_at = $10, updated_at = $11
       WHERE id = $1
       RETURNING ${COLLECTION_COLUMNS}`,
      [
        id,
        next.name,
        toJsonParam(next.fields),
        next.titleField,
        next.dateField,
        next.urlPattern,
        toJsonParam(next.supports),
        toJsonParam(next.listColumns),
        next.description,
        next.deprecatedAt,
        updatedAt,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Collection "${id}" does not exist`, {
        field: "collectionId",
      });
    }
    return mapCollection(row);
  }

  // ------------------------------------------------------------ entries (T09)

  async listEntries(filter: {
    siteId: string;
    collectionId?: string;
    status?: EntryStatus;
    trashed?: boolean;
    searchTokens?: readonly string[];
    limit?: number;
  }): Promise<Entry[]> {
    const params: unknown[] = [filter.siteId];
    let sql = `SELECT ${ENTRY_COLUMNS} FROM entries
      WHERE site_id = $1 AND deleted_at IS ${filter.trashed === true ? "NOT NULL" : "NULL"}`;
    if (filter.collectionId !== undefined) {
      params.push(filter.collectionId);
      sql += ` AND collection_id = $${params.length}`;
    }
    if (filter.status !== undefined) {
      params.push(filter.status);
      sql += ` AND status = $${params.length}`;
    }
    // Every query token must appear somewhere in the haystack; the ranking
    // (title A / slug B / body C) happens on the loaded rows.
    for (const token of filter.searchTokens ?? []) {
      params.push(`%${token}%`);
      sql += ` AND search_text LIKE $${params.length}`;
    }
    params.push(Math.max(1, Math.min(500, filter.limit ?? 200)));
    sql += ` ORDER BY updated_at DESC, id DESC LIMIT $${params.length}`;
    const result = await this.#db.query<EntryRow>(sql, params);
    return result.rows.map(mapEntry);
  }

  async getEntry(id: string): Promise<Entry> {
    const result = await this.#db.query<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM entries WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Entry "${id}" does not exist`, {
        field: "entryId",
        suggestion: "List the entries of the collection with list_entries.",
      });
    }
    return mapEntry(row);
  }

  // Slug uniqueness is checked in code (a trashed entry frees its slug again);
  // the unique index would forbid that.
  async findLiveEntryBySlug(
    collectionId: string,
    slug: string,
    exceptId?: string,
  ): Promise<Entry | undefined> {
    const params: unknown[] = [collectionId, slug];
    let sql = `SELECT ${ENTRY_COLUMNS} FROM entries
       WHERE collection_id = $1 AND slug = $2 AND deleted_at IS NULL`;
    if (exceptId !== undefined) {
      params.push(exceptId);
      sql += ` AND id <> $${params.length}`;
    }
    sql += ` LIMIT 1`;
    const result = await this.#db.query<EntryRow>(sql, params);
    const row = result.rows[0];
    return row ? mapEntry(row) : undefined;
  }

  // The live route follows the active version: a draft rename only breaks the
  // published URL once the rename itself is published.
  async findPublishedEntryBySlug(
    collectionId: string,
    slug: string,
  ): Promise<Entry | undefined> {
    const result = await this.#db.query<EntryRow>(
      `SELECT e.id, e.site_id, e.collection_id, e.slug, e.status, e.cells,
              e.active_version_id, e.version, e.author, e.published_at,
              e.scheduled_at, e.deleted_at, e.created_at, e.updated_at
       FROM entries e
       LEFT JOIN entry_versions v ON v.id = e.active_version_id
       WHERE e.collection_id = $1
         AND e.deleted_at IS NULL
         AND e.status = 'published'
         AND (e.slug = $2 OR v.slug = $2)
       ORDER BY e.updated_at DESC, e.id DESC LIMIT 1`,
      [collectionId, slug],
    );
    const row = result.rows[0];
    return row ? mapEntry(row) : undefined;
  }

  async createEntry(input: {
    id: string;
    siteId: string;
    collectionId: string;
    slug: string;
    status: EntryStatus;
    cells: Record<string, CellValue>;
    author: Author;
    searchText: string;
    publishedAt: string | null;
    scheduledAt: string | null;
  }): Promise<Entry> {
    const now = new Date().toISOString();
    const result = await this.#db.query<EntryRow>(
      `INSERT INTO entries
        (id, site_id, collection_id, slug, status, cells, active_version_id,
         version, author, search_text, published_at, scheduled_at, deleted_at,
         created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, 1, $7, $8, $9, $10, NULL, $11, $11)
       RETURNING ${ENTRY_COLUMNS}`,
      [
        input.id,
        input.siteId,
        input.collectionId,
        input.slug,
        input.status,
        toJsonParam(input.cells),
        toJsonParam(input.author),
        input.searchText,
        input.publishedAt,
        input.scheduledAt,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Entry insert returned no row");
    return mapEntry(row);
  }

  async updateEntryRow(input: {
    entryId: string;
    expectedVersion: number;
    changes: {
      slug: string;
      status: EntryStatus;
      cells: Record<string, CellValue>;
      activeVersionId: string | null;
      author: Author;
      searchText: string;
      publishedAt: string | null;
      scheduledAt: string | null;
      updatedAt: string;
    };
  }): Promise<number> {
    const { changes } = input;
    const result = await this.#db.query<{ version: unknown }>(
      `UPDATE entries SET
         slug = $3, status = $4, cells = $5, active_version_id = $6, author = $7,
         search_text = $8, published_at = $9, scheduled_at = $10,
         version = version + 1, updated_at = $11
       WHERE id = $1 AND version = $2
       RETURNING version`,
      [
        input.entryId,
        input.expectedVersion,
        changes.slug,
        changes.status,
        toJsonParam(changes.cells),
        changes.activeVersionId,
        toJsonParam(changes.author),
        changes.searchText,
        changes.publishedAt,
        changes.scheduledAt,
        changes.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      const current = await this.#db.query<{ version: unknown }>(
        `SELECT version FROM entries WHERE id = $1`,
        [input.entryId],
      );
      const currentRow = current.rows[0];
      if (!currentRow) {
        throw new SenifyError("not_found", `Entry "${input.entryId}" does not exist`, {
          field: "entryId",
        });
      }
      throw entryConflictError(
        input.expectedVersion,
        toFiniteNumber(currentRow.version, "version"),
      );
    }
    return toFiniteNumber(row.version, "version");
  }

  // Trash and restore are state flips, not content writes: no version bump.
  async setEntryDeleted(id: string, deletedAt: string | null): Promise<Entry> {
    const result = await this.#db.query<EntryRow>(
      `UPDATE entries SET deleted_at = $2, updated_at = $3
       WHERE id = $1 RETURNING ${ENTRY_COLUMNS}`,
      [id, deletedAt, new Date().toISOString()],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Entry "${id}" does not exist`, {
        field: "entryId",
      });
    }
    return mapEntry(row);
  }

  async createEntryVersion(input: {
    id: string;
    entryId: string;
    siteId: string;
    versionNumber: number;
    cells: Record<string, CellValue>;
    slug: string;
    status: EntryStatus;
    author: Author;
  }): Promise<EntryVersion> {
    const createdAt = new Date().toISOString();
    const result = await this.#db.query<EntryVersionRow>(
      `INSERT INTO entry_versions
        (id, entry_id, site_id, version_number, cells, slug, status, author, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, entry_id, site_id, version_number, cells, slug, status, author, created_at`,
      [
        input.id,
        input.entryId,
        input.siteId,
        input.versionNumber,
        toJsonParam(input.cells),
        input.slug,
        input.status,
        toJsonParam(input.author),
        createdAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Entry version insert returned no row");
    return mapEntryVersion(row);
  }

  async getEntryVersion(id: string): Promise<EntryVersion> {
    const result = await this.#db.query<EntryVersionRow>(
      `SELECT id, entry_id, site_id, version_number, cells, slug, status, author, created_at
       FROM entry_versions WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Entry version "${id}" does not exist`, {
        field: "versionId",
        suggestion: "Read the timeline with GET /api/entries/:id/versions.",
      });
    }
    return mapEntryVersion(row);
  }

  async listEntryVersions(entryId: string, limit = 50): Promise<EntryVersion[]> {
    const result = await this.#db.query<EntryVersionRow>(
      `SELECT id, entry_id, site_id, version_number, cells, slug, status, author, created_at
       FROM entry_versions WHERE entry_id = $1
       ORDER BY version_number DESC, id DESC LIMIT $2`,
      [entryId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapEntryVersion);
  }

  async maxEntryVersionNumber(entryId: string): Promise<number> {
    const result = await this.#db.query<{ max_version: unknown }>(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM entry_versions WHERE entry_id = $1`,
      [entryId],
    );
    return toFiniteNumber(result.rows[0]?.max_version ?? 0, "max_version");
  }

  async deleteEntryVersions(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    await this.#db.query(
      `DELETE FROM entry_versions WHERE id IN (${placeholders})`,
      [...ids],
    );
  }

  async deleteEntryRecord(id: string): Promise<void> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM entries WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new SenifyError("not_found", `Entry "${id}" does not exist`, {
        field: "entryId",
      });
    }
  }

  async createEntryRedirect(input: {
    id: string;
    siteId: string;
    collectionId: string;
    fromPath: string;
    toPath: string;
  }): Promise<EntryRedirect> {
    const createdAt = new Date().toISOString();
    const result = await this.#db.query<EntryRedirectRow>(
      `INSERT INTO entry_redirects
        (id, site_id, collection_id, from_path, to_path, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, site_id, collection_id, from_path, to_path, created_at`,
      [
        input.id,
        input.siteId,
        input.collectionId,
        input.fromPath,
        input.toPath,
        createdAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Entry redirect insert returned no row");
    return mapEntryRedirect(row);
  }

  async findEntryRedirect(
    siteId: string,
    fromPath: string,
  ): Promise<EntryRedirect | undefined> {
    const result = await this.#db.query<EntryRedirectRow>(
      `SELECT id, site_id, collection_id, from_path, to_path, created_at
       FROM entry_redirects WHERE site_id = $1 AND from_path = $2
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [siteId, fromPath],
    );
    const row = result.rows[0];
    return row ? mapEntryRedirect(row) : undefined;
  }

  async deleteEntryRedirect(siteId: string, fromPath: string): Promise<void> {
    await this.#db.query(
      `DELETE FROM entry_redirects WHERE site_id = $1 AND from_path = $2`,
      [siteId, fromPath],
    );
  }

  // Every slug history row of a site: the bake turns them into static redirect
  // files so an old detail path keeps pointing at the new one.
  async listEntryRedirects(siteId: string): Promise<EntryRedirect[]> {
    const result = await this.#db.query<EntryRedirectRow>(
      `SELECT id, site_id, collection_id, from_path, to_path, created_at
       FROM entry_redirects WHERE site_id = $1
       ORDER BY created_at ASC, id ASC`,
      [siteId],
    );
    return result.rows.map(mapEntryRedirect);
  }

  // ------------------------------------------------------------ forms (T11)

  // The HMAC secret is generated once and lives in its own table so tokens
  // baked into static HTML keep verifying across engine restarts.
  async getOrCreateFormSecret(): Promise<string> {
    const existing = await this.#db.query<{ secret: string }>(
      `SELECT secret FROM form_settings ORDER BY created_at ASC LIMIT 1`,
    );
    const row = existing.rows[0];
    if (row) return row.secret;
    const secret = randomBytes(32).toString("base64url");
    await this.#db.query(
      `INSERT INTO form_settings (id, secret, created_at) VALUES ($1, $2, $3)`,
      [newEntityId(), secret, new Date().toISOString()],
    );
    return secret;
  }

  // A form id is stable per site + page + node; a re-bake keeps it and only
  // writes a new snapshot.
  async resolveFormId(input: {
    siteId: string;
    pageId: string;
    nodeId: string;
  }): Promise<string> {
    const existing = await this.#db.query<{ form_id: string }>(
      `SELECT form_id FROM form_snapshots
       WHERE site_id = $1 AND page_id = $2 AND node_id = $3
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [input.siteId, input.pageId, input.nodeId],
    );
    return existing.rows[0]?.form_id ?? newEntityId();
  }

  async saveFormSnapshot(input: {
    id: string;
    formId: string;
    siteId: string;
    pageId: string;
    nodeId: string;
    pagePath: string;
    sectionType: string;
    snapshot: FormSnapshot;
  }): Promise<FormSnapshotRecord> {
    const result = await this.#db.query<FormSnapshotRow>(
      `INSERT INTO form_snapshots
        (id, form_id, site_id, page_id, node_id, page_path, section_type, snapshot, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, form_id, site_id, page_id, node_id, page_path, section_type, snapshot, created_at`,
      [
        input.id,
        input.formId,
        input.siteId,
        input.pageId,
        input.nodeId,
        input.pagePath,
        input.sectionType,
        toJsonParam(input.snapshot),
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Form snapshot insert returned no row");
    return mapFormSnapshot(row);
  }

  async getFormSnapshot(id: string): Promise<FormSnapshotRecord> {
    const result = await this.#db.query<FormSnapshotRow>(
      `SELECT id, form_id, site_id, page_id, node_id, page_path, section_type, snapshot, created_at
       FROM form_snapshots WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Form snapshot "${id}" does not exist`, {
        field: "formId",
        suggestion: "Re-bake the site so a fresh token is stamped into the page.",
      });
    }
    return mapFormSnapshot(row);
  }

  async getFormSnapshotForForm(
    formId: string,
  ): Promise<FormSnapshotRecord | undefined> {
    const result = await this.#db.query<FormSnapshotRow>(
      `SELECT id, form_id, site_id, page_id, node_id, page_path, section_type, snapshot, created_at
       FROM form_snapshots WHERE form_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [formId],
    );
    const row = result.rows[0];
    return row ? mapFormSnapshot(row) : undefined;
  }

  async enqueueNotification(input: {
    siteId: string;
    formId: string | null;
    entryId: string | null;
    kind: string;
    recipient: string;
    subject: string;
    body: string;
    nextAttemptAt?: string;
  }): Promise<NotificationMessage> {
    const now = new Date().toISOString();
    const result = await this.#db.query<NotificationRow>(
      `INSERT INTO notification_outbox
        (id, site_id, form_id, entry_id, kind, recipient, subject, body, status,
         attempts, next_attempt_at, last_error, created_at, updated_at, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', 0, $9, NULL, $10, $10, NULL)
       RETURNING ${NOTIFICATION_COLUMNS}`,
      [
        newEntityId(),
        input.siteId,
        input.formId,
        input.entryId,
        input.kind,
        input.recipient,
        input.subject,
        input.body,
        input.nextAttemptAt ?? now,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Notification insert returned no row");
    return mapNotification(row);
  }

  async getNotification(id: string): Promise<NotificationMessage> {
    const result = await this.#db.query<NotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notification_outbox WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Notification "${id}" does not exist`, {
        field: "notificationId",
      });
    }
    return mapNotification(row);
  }

  async listNotifications(
    siteId: string,
    limit = 50,
  ): Promise<NotificationMessage[]> {
    const result = await this.#db.query<NotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notification_outbox
       WHERE site_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapNotification);
  }

  // Jobs that are due: queued and past their next attempt time.
  async listDueNotifications(
    now: string,
    limit = 50,
  ): Promise<NotificationMessage[]> {
    const result = await this.#db.query<NotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notification_outbox
       WHERE status = 'queued' AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC, created_at ASC, id ASC LIMIT $2`,
      [now, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapNotification);
  }

  async markNotificationResult(input: {
    id: string;
    status: NotificationStatus;
    attempts: number;
    nextAttemptAt: string;
    lastError: string | null;
    sentAt: string | null;
  }): Promise<NotificationMessage> {
    const result = await this.#db.query<NotificationRow>(
      `UPDATE notification_outbox SET
         status = $2, attempts = $3, next_attempt_at = $4, last_error = $5,
         sent_at = $6, updated_at = $7
       WHERE id = $1 RETURNING ${NOTIFICATION_COLUMNS}`,
      [
        input.id,
        input.status,
        input.attempts,
        input.nextAttemptAt,
        input.lastError,
        input.sentAt,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Notification "${input.id}" does not exist`, {
        field: "notificationId",
      });
    }
    return mapNotification(row);
  }

  async createNewsletterToken(input: {
    siteId: string;
    formId: string;
    entryId: string;
    email: string;
    kind: NewsletterTokenKind;
    expiresAt: string | null;
  }): Promise<NewsletterToken> {
    const token = randomBytes(24).toString("base64url");
    const result = await this.#db.query<NewsletterTokenRow>(
      `INSERT INTO newsletter_tokens
        (token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, NULL)
       RETURNING token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at`,
      [
        token,
        input.siteId,
        input.formId,
        input.entryId,
        input.email,
        input.kind,
        input.expiresAt,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Newsletter token insert returned no row");
    return mapNewsletterToken(row);
  }

  async getNewsletterToken(token: string): Promise<NewsletterToken | undefined> {
    const result = await this.#db.query<NewsletterTokenRow>(
      `SELECT token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at
       FROM newsletter_tokens WHERE token = $1`,
      [token],
    );
    const row = result.rows[0];
    return row ? mapNewsletterToken(row) : undefined;
  }

  // Single use: the flip to used is idempotent (already-used tokens stay used).
  async markNewsletterTokenUsed(
    token: string,
    status: string,
  ): Promise<NewsletterToken> {
    const result = await this.#db.query<NewsletterTokenRow>(
      `UPDATE newsletter_tokens SET status = $2, used_at = COALESCE(used_at, $3)
       WHERE token = $1
       RETURNING token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at`,
      [token, status, new Date().toISOString()],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Newsletter token is unknown`, {
        field: "token",
      });
    }
    return mapNewsletterToken(row);
  }

  // ------------------------------------------------------- references (T14)

  async createReference(input: {
    name: string;
    sourceUrl: string;
    method: ReferenceMethod;
    provenance: ReferenceProvenance;
  }): Promise<Reference> {
    const now = new Date().toISOString();
    const id = newEntityId();
    await this.#db.query(
      `INSERT INTO design_references
        (id, name, source_url, method, status, stage, progress, failure_reason,
         families, vocabulary, style_brief, snapshots, provenance, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'analyzing', 'governance', 0, NULL,
         '[]', '[]', '', '[]', $5, $6, $6)`,
      [id, input.name, input.sourceUrl, input.method, toJsonParam(input.provenance), now],
    );
    return this.getReference(id);
  }

  async getReference(id: string): Promise<Reference> {
    const result = await this.#db.query<ReferenceRow>(
      `SELECT ${REFERENCE_COLUMNS} FROM design_references WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Reference "${id}" does not exist`, {
        field: "referenceId",
        suggestion: "Use list_references to find an existing reference id.",
      });
    }
    const usage = await this.#referenceUsage();
    return mapReference(row, await this.getLatestReferenceProfile(id), usage.get(id) ?? []);
  }

  async listReferences(): Promise<ReferenceSummary[]> {
    const result = await this.#db.query<ReferenceRow>(
      `SELECT ${REFERENCE_COLUMNS} FROM design_references
       ORDER BY created_at DESC, id DESC`,
    );
    const usage = await this.#referenceUsage();
    const revisions = await this.#db.query<{ reference_id: string; revision: unknown }>(
      `SELECT reference_id, MAX(revision) AS revision FROM reference_profiles
       GROUP BY reference_id`,
    );
    const revisionByReference = new Map(
      revisions.rows.map((row) => [row.reference_id, toFiniteNumber(row.revision, "revision")]),
    );
    return result.rows.map((row) => {
      const revision = revisionByReference.get(row.id) ?? 0;
      return mapReferenceSummary(row, revision, usage.get(row.id) ?? []);
    });
  }

  async updateReference(
    id: string,
    patch: {
      status?: ReferenceStatus;
      stage?: string;
      progress?: number;
      failureReason?: string | null;
      families?: string[];
      vocabulary?: string[];
      styleBrief?: string;
      snapshots?: ReferenceSnapshot[];
      provenance?: ReferenceProvenance;
    },
  ): Promise<Reference> {
    const current = await this.getReference(id);
    await this.#db.query(
      `UPDATE design_references SET
         status = $2, stage = $3, progress = $4, failure_reason = $5,
         families = $6, vocabulary = $7, style_brief = $8, snapshots = $9, updated_at = $10,
         provenance = $11
       WHERE id = $1`,
      [
        id,
        patch.status ?? current.status,
        patch.stage ?? current.stage,
        patch.progress ?? current.progress,
        patch.failureReason === undefined ? current.failureReason : patch.failureReason,
        toJsonParam(patch.families ?? current.families),
        toJsonParam(patch.vocabulary ?? current.vocabulary),
        patch.styleBrief ?? current.styleBrief,
        toJsonParam(patch.snapshots ?? current.snapshots),
        new Date().toISOString(),
        toJsonParam(patch.provenance ?? current.provenance),
      ],
    );
    return this.getReference(id);
  }

  async deleteReference(id: string): Promise<void> {
    await this.getReference(id);
    await this.#db.withTransaction(async (tx) => {
      await tx.query(`DELETE FROM reference_profiles WHERE reference_id = $1`, [id]);
      await tx.query(`DELETE FROM reference_jobs WHERE reference_id = $1`, [id]);
      await tx.query(`DELETE FROM reference_assignments WHERE reference_id = $1`, [id]);
      await tx.query(`DELETE FROM design_references WHERE id = $1`, [id]);
    });
  }

  async createReferenceProfileRevision(input: {
    referenceId: string;
    profile: ReferenceProfile;
    evidence: ReferenceEvidence[];
    provenance: ReferenceProvenance;
    author: Author;
    note: string | null;
  }): Promise<ReferenceProfileRevision> {
    await this.getReference(input.referenceId);
    const next = await this.#db.query<{ revision: unknown }>(
      `SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM reference_profiles
       WHERE reference_id = $1`,
      [input.referenceId],
    );
    const revision = toFiniteNumber(next.rows[0]?.revision ?? 1, "revision");
    const result = await this.#db.query<ReferenceProfileRow>(
      `INSERT INTO reference_profiles
        (id, reference_id, revision, profile, evidence, provenance, author, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${REFERENCE_PROFILE_COLUMNS}`,
      [
        newEntityId(),
        input.referenceId,
        revision,
        toJsonParam(input.profile),
        toJsonParam(input.evidence),
        toJsonParam(input.provenance),
        toJsonParam(input.author),
        input.note,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Reference profile insert returned no row");
    return mapReferenceProfile(row);
  }

  async getLatestReferenceProfile(
    referenceId: string,
  ): Promise<ReferenceProfileRevision | null> {
    const result = await this.#db.query<ReferenceProfileRow>(
      `SELECT ${REFERENCE_PROFILE_COLUMNS} FROM reference_profiles
       WHERE reference_id = $1 ORDER BY revision DESC, id DESC LIMIT 1`,
      [referenceId],
    );
    const row = result.rows[0];
    return row ? mapReferenceProfile(row) : null;
  }

  async listReferenceProfileRevisions(
    referenceId: string,
  ): Promise<ReferenceProfileRevision[]> {
    const result = await this.#db.query<ReferenceProfileRow>(
      `SELECT ${REFERENCE_PROFILE_COLUMNS} FROM reference_profiles
       WHERE reference_id = $1 ORDER BY revision DESC, id DESC`,
      [referenceId],
    );
    return result.rows.map(mapReferenceProfile);
  }

  async createReferenceJob(input: {
    referenceId: string;
    maxAttempts: number;
    // Analysis input that must survive a retry (e.g. the snapshot fallback).
    payload?: Record<string, unknown> | null;
  }): Promise<ReferenceJob> {
    const now = new Date().toISOString();
    const result = await this.#db.query<ReferenceJobRow>(
      `INSERT INTO reference_jobs
        (id, reference_id, status, stage, progress, attempts, max_attempts,
         next_attempt_at, last_error, created_at, updated_at, finished_at, payload)
       VALUES ($1, $2, 'queued', 'queued', 0, 0, $3, $4, NULL, $4, $4, NULL, $5)
       RETURNING ${REFERENCE_JOB_COLUMNS}`,
      [
        newEntityId(),
        input.referenceId,
        input.maxAttempts,
        now,
        input.payload === undefined || input.payload === null
          ? null
          : toJsonParam(input.payload),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Reference job insert returned no row");
    return mapReferenceJob(row);
  }

  // The stored analysis input (snapshot fallback) for a queued job.
  async getReferenceJobPayload(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.#db.query<{ payload: unknown }>(
      `SELECT payload FROM reference_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row || row.payload === null || row.payload === undefined) return null;
    return toJson<Record<string, unknown>>(row.payload);
  }

  async getReferenceJob(id: string): Promise<ReferenceJob> {
    const result = await this.#db.query<ReferenceJobRow>(
      `SELECT ${REFERENCE_JOB_COLUMNS} FROM reference_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Reference job "${id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapReferenceJob(row);
  }

  // Jobs that are due: queued and past their next attempt time.
  async listDueReferenceJobs(now: string, limit = 20): Promise<ReferenceJob[]> {
    const result = await this.#db.query<ReferenceJobRow>(
      `SELECT ${REFERENCE_JOB_COLUMNS} FROM reference_jobs
       WHERE status = 'queued' AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC, created_at ASC, id ASC LIMIT $2`,
      [now, Math.max(1, Math.min(100, limit))],
    );
    return result.rows.map(mapReferenceJob);
  }

  async updateReferenceJob(input: {
    id: string;
    status: ReferenceJobStatus;
    stage: string;
    progress: number;
    attempts: number;
    nextAttemptAt: string;
    lastError: string | null;
    finishedAt: string | null;
  }): Promise<ReferenceJob> {
    const result = await this.#db.query<ReferenceJobRow>(
      `UPDATE reference_jobs SET
         status = $2, stage = $3, progress = $4, attempts = $5,
         next_attempt_at = $6, last_error = $7, finished_at = $8, updated_at = $9
       WHERE id = $1 RETURNING ${REFERENCE_JOB_COLUMNS}`,
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
      throw new SenifyError("not_found", `Reference job "${input.id}" does not exist`, {
        field: "jobId",
      });
    }
    return mapReferenceJob(row);
  }

  async upsertReferenceAssignment(input: {
    siteId: string;
    referenceId: string;
    scales: ReferenceScale[];
    priority: number;
  }): Promise<ReferenceAssignment> {
    await this.getReference(input.referenceId);
    const now = new Date().toISOString();
    try {
      const result = await this.#db.query<ReferenceAssignmentRow>(
        `INSERT INTO reference_assignments
          (id, site_id, reference_id, scales, priority, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING ${REFERENCE_ASSIGNMENT_COLUMNS}`,
        [
          newEntityId(),
          input.siteId,
          input.referenceId,
          toJsonParam(input.scales),
          input.priority,
          now,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Reference assignment insert returned no row");
      return mapReferenceAssignment(row);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const result = await this.#db.query<ReferenceAssignmentRow>(
        `UPDATE reference_assignments SET scales = $3, priority = $4, updated_at = $5
         WHERE site_id = $1 AND reference_id = $2
         RETURNING ${REFERENCE_ASSIGNMENT_COLUMNS}`,
        [input.siteId, input.referenceId, toJsonParam(input.scales), input.priority, now],
      );
      const row = result.rows[0];
      if (!row) throw error;
      return mapReferenceAssignment(row);
    }
  }

  async listReferenceAssignments(siteId: string): Promise<ReferenceAssignment[]> {
    const result = await this.#db.query<ReferenceAssignmentRow>(
      `SELECT ${REFERENCE_ASSIGNMENT_COLUMNS} FROM reference_assignments
       WHERE site_id = $1 ORDER BY priority ASC, created_at ASC, id ASC`,
      [siteId],
    );
    return result.rows.map(mapReferenceAssignment);
  }

  async deleteReferenceAssignment(input: {
    siteId: string;
    referenceId: string;
  }): Promise<boolean> {
    const result = await this.#db.query<{ id: string }>(
      `DELETE FROM reference_assignments WHERE site_id = $1 AND reference_id = $2 RETURNING id`,
      [input.siteId, input.referenceId],
    );
    return result.rows.length > 0;
  }

  async countReferenceAssignments(referenceId: string): Promise<number> {
    const result = await this.#db.query<{ total: unknown }>(
      `SELECT COUNT(*) AS total FROM reference_assignments WHERE reference_id = $1`,
      [referenceId],
    );
    return toFiniteNumber(result.rows[0]?.total ?? 0, "total");
  }

  async #referenceUsage(): Promise<Map<string, string[]>> {
    const result = await this.#db.query<{ reference_id: string; site_id: string }>(
      `SELECT reference_id, site_id FROM reference_assignments
       ORDER BY site_id ASC`,
    );
    const usage = new Map<string, string[]>();
    for (const row of result.rows) {
      const sites = usage.get(row.reference_id) ?? [];
      sites.push(row.site_id);
      usage.set(row.reference_id, sites);
    }
    return usage;
  }

  // ---------------------------------------------------------- settings (T12)

  async getSmtpSettings(): Promise<SmtpSettingsRecord> {
    const existing = await this.#db.query<SmtpRow>(
      `SELECT ${SMTP_COLUMNS} FROM smtp_settings WHERE id = 'smtp'`,
    );
    const row = existing.rows[0];
    if (row) return mapSmtpSettings(row);
    try {
      await this.#db.query(
        `INSERT INTO smtp_settings (id, host, port, tls, username, password_encrypted, from_address, updated_at)
         VALUES ('smtp', '', 587, 'starttls', '', NULL, '', $1)`,
        [new Date().toISOString()],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.#db.query<SmtpRow>(
      `SELECT ${SMTP_COLUMNS} FROM smtp_settings WHERE id = 'smtp'`,
    );
    const stored = created.rows[0];
    return stored === undefined ? defaultSmtpSettings() : mapSmtpSettings(stored);
  }

  async updateSmtpSettings(patch: SmtpSettingsPatch): Promise<SmtpSettingsRecord> {
    const current = await this.getSmtpSettings();
    const next: SmtpSettingsRecord = {
      host: patch.host === undefined ? current.host : patch.host,
      port: patch.port === undefined ? current.port : patch.port,
      tls: patch.tls === undefined ? current.tls : patch.tls,
      user: patch.user === undefined ? current.user : patch.user,
      from: patch.from === undefined ? current.from : patch.from,
      passwordEncrypted:
        patch.passwordEncrypted === undefined
          ? current.passwordEncrypted
          : patch.passwordEncrypted,
    };
    await this.#db.query(
      `UPDATE smtp_settings SET host = $2, port = $3, tls = $4, username = $5,
         password_encrypted = $6, from_address = $7, updated_at = $8 WHERE id = $1`,
      [
        "smtp",
        next.host,
        next.port,
        next.tls,
        next.user,
        next.passwordEncrypted,
        next.from,
        new Date().toISOString(),
      ],
    );
    return next;
  }

  // Defaults for new projects and the program start (artifacts/27 §5).
  async getEngineSettings(): Promise<EngineSettings> {
    const existing = await this.#db.query<EngineSettingsRow>(
      `SELECT ${ENGINE_SETTINGS_COLUMNS} FROM engine_settings WHERE id = 'engine'`,
    );
    const row = existing.rows[0];
    if (row) return mapEngineSettings(row);
    try {
      await this.#db.query(
        `INSERT INTO engine_settings (id, default_profile, default_layout, autostart, backup_dir, updated_at)
         VALUES ('engine', 'standard', 'Standard', false, NULL, $1)`,
        [new Date().toISOString()],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await this.#db.query<EngineSettingsRow>(
      `SELECT ${ENGINE_SETTINGS_COLUMNS} FROM engine_settings WHERE id = 'engine'`,
    );
    const stored = created.rows[0];
    return stored === undefined ? defaultEngineSettings() : mapEngineSettings(stored);
  }

  async updateEngineSettings(patch: EngineSettingsPatch): Promise<EngineSettings> {
    const current = await this.getEngineSettings();
    const next: EngineSettings = {
      defaultProfile:
        patch.defaultProfile === undefined
          ? current.defaultProfile
          : patch.defaultProfile,
      defaultLayout:
        patch.defaultLayout === undefined
          ? current.defaultLayout
          : patch.defaultLayout,
      autostart:
        patch.autostart === undefined ? current.autostart : patch.autostart,
      backupDir:
        patch.backupDir === undefined ? current.backupDir : patch.backupDir,
    };
    await this.#db.query(
      `UPDATE engine_settings SET default_profile = $2, default_layout = $3,
         autostart = $4, backup_dir = $5, updated_at = $6 WHERE id = $1`,
      [
        "engine",
        next.defaultProfile,
        next.defaultLayout,
        next.autostart,
        next.backupDir,
        new Date().toISOString(),
      ],
    );
    return next;
  }

  // Persisted secret for encryption at rest, mirroring getOrCreateFormSecret.
  async getOrCreateEngineSecret(): Promise<string> {
    const existing = await this.#db.query<{ secret: string }>(
      `SELECT secret FROM engine_secrets WHERE name = 'settings' LIMIT 1`,
    );
    const row = existing.rows[0];
    if (row) return row.secret;
    const secret = randomBytes(32).toString("base64url");
    await this.#db.query(
      `INSERT INTO engine_secrets (id, name, secret, created_at) VALUES ($1, 'settings', $2, $3)`,
      [newEntityId(), secret, new Date().toISOString()],
    );
    return secret;
  }

  // Raw table dump for backups; names come from the schema, never from input.
  async dumpTable(name: string): Promise<Row[]> {
    if (!tableNames().includes(name)) {
      throw new SenifyError("validation", `Unbekannte Tabelle "${name}"`, {
        field: "table",
      });
    }
    const result = await this.#db.query(`SELECT * FROM ${name}`);
    return result.rows;
  }
}

function buildAuditInsert(entries: NewAuditEntry[]): {
  text: string;
  params: unknown[];
} {
  const values: string[] = [];
  const params: unknown[] = [];
  entries.forEach((entry, index) => {
    const base = index * 11;
    const refs = Array.from({ length: 11 }, (_, offset) => `$${base + offset + 1}`);
    values.push(`(${refs.join(", ")})`);
    params.push(
      newEntityId(),
      entry.siteId,
      entry.pageId,
      entry.batchId,
      entry.opIndex,
      entry.mutation,
      toJsonParam(entry.params),
      toJsonParam(entry.author),
      toJsonParam(entry.undoPatch),
      entry.draftVersionAfter,
      new Date().toISOString(),
    );
  });
  return {
    text: `INSERT INTO audit_entries
      (id, site_id, page_id, batch_id, op_index, mutation, params, author, undo_patch, draft_version_after, created_at)
      VALUES ${values.join(", ")}`,
    params,
  };
}

// -------------------------------------------------------------- forms (T11)

const NOTIFICATION_COLUMNS =
  "id, site_id, form_id, entry_id, kind, recipient, subject, body, status, attempts, next_attempt_at, last_error, created_at, updated_at, sent_at";

type FormSnapshotRow = {
  id: string;
  form_id: string;
  site_id: string;
  page_id: string;
  node_id: string;
  page_path: string;
  section_type: string;
  snapshot: unknown;
  created_at: unknown;
};

function mapFormSnapshot(row: FormSnapshotRow): FormSnapshotRecord {
  return {
    id: row.id,
    formId: row.form_id,
    siteId: row.site_id,
    pageId: row.page_id,
    nodeId: row.node_id,
    pagePath: row.page_path,
    sectionType: row.section_type,
    snapshot: toJson<FormSnapshot>(row.snapshot),
    createdAt: toIso(row.created_at),
  };
}

type NotificationRow = {
  id: string;
  site_id: string;
  form_id: unknown;
  entry_id: unknown;
  kind: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  attempts: unknown;
  next_attempt_at: unknown;
  last_error: unknown;
  created_at: unknown;
  updated_at: unknown;
  sent_at: unknown;
};

function mapNotification(row: NotificationRow): NotificationMessage {
  return {
    id: row.id,
    siteId: row.site_id,
    formId: typeof row.form_id === "string" ? row.form_id : null,
    entryId: typeof row.entry_id === "string" ? row.entry_id : null,
    kind: row.kind,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    status: row.status as NotificationStatus,
    attempts: toFiniteNumber(row.attempts, "attempts"),
    nextAttemptAt: toIso(row.next_attempt_at),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    sentAt: row.sent_at === null || row.sent_at === undefined ? null : toIso(row.sent_at),
  };
}

type NewsletterTokenRow = {
  token: string;
  site_id: string;
  form_id: string;
  entry_id: string;
  email: string;
  kind: string;
  status: string;
  expires_at: unknown;
  created_at: unknown;
  used_at: unknown;
};

function mapNewsletterToken(row: NewsletterTokenRow): NewsletterToken {
  return {
    token: row.token,
    siteId: row.site_id,
    formId: row.form_id,
    entryId: row.entry_id,
    email: row.email,
    kind: row.kind as NewsletterTokenKind,
    status: row.status,
    expiresAt: row.expires_at === null || row.expires_at === undefined ? null : toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    usedAt: row.used_at === null || row.used_at === undefined ? null : toIso(row.used_at),
  };
}

// ------------------------------------------------------------ references (T14)

const REFERENCE_COLUMNS =
  "id, name, source_url, method, status, stage, progress, failure_reason, families, vocabulary, style_brief, snapshots, provenance, created_at, updated_at";

const REFERENCE_PROFILE_COLUMNS =
  "id, reference_id, revision, profile, evidence, provenance, author, note, created_at";

const REFERENCE_JOB_COLUMNS =
  "id, reference_id, status, stage, progress, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at, finished_at";

const REFERENCE_ASSIGNMENT_COLUMNS =
  "id, site_id, reference_id, scales, priority, created_at, updated_at";

type ReferenceRow = {
  id: string;
  name: string;
  source_url: string;
  method: string;
  status: string;
  stage: string;
  progress: unknown;
  failure_reason: unknown;
  families: unknown;
  vocabulary: unknown;
  style_brief: string;
  snapshots: unknown;
  provenance: unknown;
  created_at: unknown;
  updated_at: unknown;
};

function mapReference(
  row: ReferenceRow,
  profileRevision: ReferenceProfileRevision | null,
  usedInProjects: string[],
): Reference {
  return {
    ...mapReferenceSummary(row, profileRevision?.revision ?? 0, usedInProjects),
    profile: profileRevision?.profile ?? null,
    evidence: profileRevision?.evidence ?? [],
  };
}

function mapReferenceSummary(
  row: ReferenceRow,
  revision: number,
  usedInProjects: string[],
): ReferenceSummary {
  return {
    id: row.id,
    name: row.name,
    sourceUrl: row.source_url,
    method: row.method as ReferenceMethod,
    status: row.status as ReferenceStatus,
    stage: row.stage,
    progress: toFiniteNumber(row.progress, "progress"),
    failureReason: typeof row.failure_reason === "string" ? row.failure_reason : null,
    families: toJson<string[]>(row.families),
    vocabulary: toJson<string[]>(row.vocabulary),
    styleBrief: row.style_brief,
    snapshots: toJson<ReferenceSnapshot[]>(row.snapshots),
    provenance: toJson<ReferenceProvenance>(row.provenance),
    revision,
    usedInProjects,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

type ReferenceProfileRow = {
  id: string;
  reference_id: string;
  revision: unknown;
  profile: unknown;
  evidence: unknown;
  provenance: unknown;
  author: unknown;
  note: unknown;
  created_at: unknown;
};

function mapReferenceProfile(row: ReferenceProfileRow): ReferenceProfileRevision {
  return {
    id: row.id,
    referenceId: row.reference_id,
    revision: toFiniteNumber(row.revision, "revision"),
    profile: toJson<ReferenceProfile>(row.profile),
    evidence: toJson<ReferenceEvidence[]>(row.evidence),
    provenance: toJson<ReferenceProvenance>(row.provenance),
    author: toJson<ReferenceProfileRevision["author"]>(row.author),
    note: typeof row.note === "string" ? row.note : null,
    createdAt: toIso(row.created_at),
  };
}

type ReferenceJobRow = {
  id: string;
  reference_id: string;
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

function mapReferenceJob(row: ReferenceJobRow): ReferenceJob {
  return {
    id: row.id,
    referenceId: row.reference_id,
    status: row.status as ReferenceJobStatus,
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

type ReferenceAssignmentRow = {
  id: string;
  site_id: string;
  reference_id: string;
  scales: unknown;
  priority: unknown;
  created_at: unknown;
  updated_at: unknown;
};

function mapReferenceAssignment(row: ReferenceAssignmentRow): ReferenceAssignment {
  return {
    id: row.id,
    siteId: row.site_id,
    referenceId: row.reference_id,
    scales: toJson<ReferenceScale[]>(row.scales),
    priority: toFiniteNumber(row.priority, "priority"),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ------------------------------------------------------------ settings (T12)

const SMTP_COLUMNS = "host, port, tls, username, password_encrypted, from_address";

const ENGINE_SETTINGS_COLUMNS =
  "default_profile, default_layout, autostart, backup_dir";

function toBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    return value === "true" || value === "t" || value === "1";
  }
  return false;
}

type SmtpRow = {
  host: string;
  port: unknown;
  tls: string;
  username: string;
  password_encrypted: unknown;
  from_address: string;
};

function defaultSmtpSettings(): SmtpSettingsRecord {
  return {
    host: "",
    port: 587,
    tls: "starttls",
    user: "",
    from: "",
    passwordEncrypted: null,
  };
}

function mapSmtpSettings(row: SmtpRow): SmtpSettingsRecord {
  const tls = SMTP_TLS_MODES.includes(row.tls as SmtpTlsMode)
    ? (row.tls as SmtpTlsMode)
    : "starttls";
  return {
    host: row.host,
    port: toFiniteNumber(row.port, "port"),
    tls,
    user: row.username,
    from: row.from_address,
    passwordEncrypted:
      typeof row.password_encrypted === "string" ? row.password_encrypted : null,
  };
}

type EngineSettingsRow = {
  default_profile: string;
  default_layout: string;
  autostart: unknown;
  backup_dir: unknown;
};

function defaultEngineSettings(): EngineSettings {
  return {
    defaultProfile: "standard",
    defaultLayout: "Standard",
    autostart: false,
    backupDir: null,
  };
}

function mapEngineSettings(row: EngineSettingsRow): EngineSettings {
  const profile = SITE_PROFILES.includes(row.default_profile as Site["profile"])
    ? (row.default_profile as Site["profile"])
    : "standard";
  return {
    defaultProfile: profile,
    defaultLayout: row.default_layout,
    autostart: toBoolean(row.autostart),
    backupDir: typeof row.backup_dir === "string" ? row.backup_dir : null,
  };
}
