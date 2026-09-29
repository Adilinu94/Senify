import {
  ASSET_KINDS,
  ASSET_VARIANT_FORMATS,
  ENTRY_STATUSES,
  FIELD_TYPES,
  SUPPORTS_FLAGS,
  type Asset,
  type AssetFolder,
  type AssetHistoryEntry,
  type AssetKind,
  type AssetStatus,
  type AssetVariant,
  type AssetVariantFormat,
  type CellValue,
  type CodePayload,
  type CodePayloadLicense,
  type CodePayloadProvenance,
  type Collection,
  type Entry,
  type EntryRedirect,
  type EntryStatus,
  type EntryVersion,
  type FieldDef,
  type SupportsFlag,
} from "./types.ts";
import type { Author } from "@senify/section-sdk";
import { toFiniteNumber, toIso, toJson, toNullableIso } from "./store-row-utils.ts";
export type AssetRow = {
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

export type AssetFolderRow = {
  id: string;
  site_id: string;
  name: string;
  parent_id: unknown;
  created_at: unknown;
};

export type AssetHistoryRow = {
  id: string;
  asset_id: string;
  storage_ref: string;
  mime: string;
  byte_size: unknown;
  created_at: unknown;
};

export type AssetVariantRow = {
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

export function mapAsset(row: AssetRow): Asset {
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

export function mapAssetFolder(row: AssetFolderRow): AssetFolder {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    parentId: toNullableText(row.parent_id),
    createdAt: toIso(row.created_at),
  };
}

export function mapAssetHistory(row: AssetHistoryRow): AssetHistoryEntry {
  return {
    id: row.id,
    assetId: row.asset_id,
    storageRef: row.storage_ref,
    mime: row.mime,
    byteSize: toFiniteNumber(row.byte_size, "byte_size"),
    createdAt: toIso(row.created_at),
  };
}

export function mapAssetVariant(row: AssetVariantRow): AssetVariant {
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

export const ASSET_COLUMNS =
  "id, site_id, filename, mime, kind, byte_size, width, height, hash, alt_text, decorative, folder_id, tags, storage_ref, status, replaced_at, trashed_at, created_at, updated_at";

export type CodePayloadRow = {
  id: string;
  site_id: string;
  name: string;
  kind: string;
  bytes: unknown;
  integrity: string;
  version: unknown;
  provenance: unknown;
  license: unknown;
  created_at: unknown;
  updated_at: unknown;
};

// Metadata only: the bundle is code and is read explicitly through
// `getCodePayloadBundle`, so a list never drags every payload into memory.
export const CODE_PAYLOAD_COLUMNS =
  "id, site_id, name, kind, bytes, integrity, version, provenance, license, created_at, updated_at";

export function mapCodePayload(row: CodePayloadRow): CodePayload {
  const kind = row.kind;
  if (kind !== "module" && kind !== "webgl-scene") {
    throw new Error(`Stored payload kind is invalid: ${String(kind)}`);
  }
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    kind,
    bytes: toFiniteNumber(row.bytes, "bytes"),
    integrity: row.integrity,
    version: toFiniteNumber(row.version, "version"),
    provenance: toJson<CodePayloadProvenance>(row.provenance),
    license: toJson<CodePayloadLicense>(row.license),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export type CollectionRow = {
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

export type EntryRow = {
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

export type EntryVersionRow = {
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

export type EntryRedirectRow = {
  id: string;
  site_id: string;
  collection_id: string;
  from_path: string;
  to_path: string;
  created_at: unknown;
};

export const COLLECTION_COLUMNS =
  "id, site_id, name, slug, fields, title_field, date_field, url_pattern, supports, list_columns, description, deprecated_at, created_at, updated_at";
export const ENTRY_COLUMNS =
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

export function mapCollection(row: CollectionRow): Collection {
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

export function mapEntry(row: EntryRow): Entry {
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

export function mapEntryVersion(row: EntryVersionRow): EntryVersion {
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

export function mapEntryRedirect(row: EntryRedirectRow): EntryRedirect {
  return {
    id: row.id,
    siteId: row.site_id,
    collectionId: row.collection_id,
    fromPath: row.from_path,
    toPath: row.to_path,
    createdAt: toIso(row.created_at),
  };
}
