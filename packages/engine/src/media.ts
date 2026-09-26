import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Type, type Static } from "@sinclair/typebox";
import { SenifyError } from "@senify/core";
import type { NodeTree } from "@senify/section-sdk";
import { newEntityId } from "./ids.ts";
import { IdempotencyKeySchema } from "./mutations/contract.ts";
import type { Store } from "./store.ts";
import {
  assetFilePath,
  assetStorageRef,
  historyFilePath,
  historyStorageRef,
  moveAssetFile,
  removeAssetDir,
  removeVariantFiles,
  resolveStoredFile,
  storedFileName,
  variantFilePath,
  writeAssetFile,
} from "./storage.ts";
import { buildImageDerivatives, supportsVariants } from "./variants.ts";
import type {
  Asset,
  AssetBulkResult,
  AssetFolder,
  AssetKind,
  AssetStatus,
  AssetUpdate,
} from "./types.ts";

const CLOSED = { additionalProperties: false } as const;

export const UploadUrlBodySchema = Type.Object(
  {
    filename: Type.String({ minLength: 1, maxLength: 200 }),
    mime: Type.String({ minLength: 1 }),
    byteSize: Type.Integer({ minimum: 0 }),
    replaceAssetId: Type.Optional(Type.String({ minLength: 1 })),
    altText: Type.Optional(Type.String()),
    decorative: Type.Optional(Type.Boolean()),
    folderId: Type.Optional(Type.String({ minLength: 1 })),
    tags: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { maxItems: 30 }),
    ),
    idempotencyKey: Type.Optional(IdempotencyKeySchema),
  },
  CLOSED,
);
export type UploadUrlBody = Static<typeof UploadUrlBodySchema>;

export const AssetPatchBodySchema = Type.Object(
  {
    altText: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    decorative: Type.Optional(Type.Boolean()),
    folderId: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
    tags: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { maxItems: 30 }),
    ),
  },
  CLOSED,
);
export type AssetPatchBody = Static<typeof AssetPatchBodySchema>;

export const CreateAssetFolderBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    parentId: Type.Optional(Type.String({ minLength: 1 })),
  },
  CLOSED,
);
export type CreateAssetFolderBody = Static<typeof CreateAssetFolderBodySchema>;

export const BulkAssetsBodySchema = Type.Object(
  {
    ids: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
      maxItems: 200,
    }),
    patch: Type.Optional(AssetPatchBodySchema),
    trash: Type.Optional(Type.Boolean()),
    purge: Type.Optional(Type.Boolean()),
  },
  CLOSED,
);
export type BulkAssetsBody = Static<typeof BulkAssetsBodySchema>;

export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Signed URLs are short-lived: the client uploads right after asking for one.
const UPLOAD_TTL_MS = 15 * 60 * 1000;

const ALLOWED_MIME_LABEL = "image/*, video/mp4, application/pdf, font/*";

const ASSET_KIND_BY_PREFIX: [prefix: string, kind: AssetKind][] = [
  ["image/", "image"],
  ["video/", "video"],
];

function isAllowedMime(mime: string): boolean {
  return (
    mime.startsWith("image/") ||
    mime.startsWith("font/") ||
    mime === "video/mp4" ||
    mime === "application/pdf"
  );
}

function assetKindForMime(mime: string): AssetKind {
  for (const [prefix, kind] of ASSET_KIND_BY_PREFIX) {
    if (mime.startsWith(prefix)) return kind;
  }
  return "document";
}

function sanitizeFilename(name: string): string {
  const withoutPath = name.replace(/\\/g, "/");
  const base = withoutPath.slice(withoutPath.lastIndexOf("/") + 1);
  const cleaned = [...base]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  if (cleaned === "") {
    throw new SenifyError("validation", "Filename is empty after sanitizing", {
      field: "filename",
      suggestion: "Pass a real file name with an extension.",
    });
  }
  return cleaned;
}

function normalizeAltText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed !== "" && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------- dimensions

function pngDimensions(
  buffer: Buffer,
): { width: number; height: number } | undefined {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) {
    return undefined;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function gifDimensions(
  buffer: Buffer,
): { width: number; height: number } | undefined {
  if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "GIF") {
    return undefined;
  }
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function jpegDimensions(
  buffer: Buffer,
): { width: number; height: number } | undefined {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return undefined;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1] ?? 0;
    // Padding and standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return undefined;
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    if (marker === 0xda) return undefined;
    offset += 2 + length;
  }
  return undefined;
}

function webpDimensions(
  buffer: Buffer,
): { width: number; height: number } | undefined {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return undefined;
  }
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 ") {
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      return undefined;
    }
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return undefined;
}

// Header-only size detection: PNG/JPEG/WebP/GIF carry their dimensions early
// enough that no decoder (let alone sharp) is needed for the asset record.
export function imageDimensions(
  buffer: Buffer,
  mime: string,
): { width: number; height: number } | undefined {
  if (mime === "image/png") return pngDimensions(buffer);
  if (mime === "image/gif") return gifDimensions(buffer);
  if (mime === "image/jpeg") return jpegDimensions(buffer);
  if (mime === "image/webp") return webpDimensions(buffer);
  return undefined;
}

// ------------------------------------------------------------ upload signing

export type UploadTicket = {
  uploadId: string;
  siteId: string;
  filename: string;
  mime: string;
  replaceAssetId: string | null;
  altText: string | null;
  decorative: boolean;
  folderId: string | null;
  tags: string[];
  expiresAt: string;
};

export type UploadSigner = {
  sign(ticket: UploadTicket): string;
  verify(token: string): UploadTicket | undefined;
};

// Presigned-URL shape without a bucket: the whole ticket travels inside an
// HMAC-signed token, so the engine keeps no upload session state.
export function createUploadSigner(secret: string): UploadSigner {
  const digest = (payload: string): string =>
    createHmac("sha256", secret).update(payload).digest("base64url");
  return {
    sign(ticket) {
      const payload = Buffer.from(JSON.stringify(ticket), "utf8").toString(
        "base64url",
      );
      return `${payload}.${digest(payload)}`;
    },
    verify(token) {
      const separator = token.indexOf(".");
      if (separator <= 0) return undefined;
      const payload = token.slice(0, separator);
      const signature = token.slice(separator + 1);
      const expected = Buffer.from(digest(payload));
      const actual = Buffer.from(signature);
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      ) {
        return undefined;
      }
      try {
        return JSON.parse(
          Buffer.from(payload, "base64url").toString("utf8"),
        ) as UploadTicket;
      } catch {
        return undefined;
      }
    },
  };
}

// --------------------------------------------------------------- asset walks

// Collects every `assetRef { assetId }` inside a prop tree; the check pipeline
// and the bake both need the set of assets a page actually uses.
export function walkAssetIds(
  value: unknown,
  path: string,
  visit: (assetId: string, path: string) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      walkAssetIds(entry, `${path}[${index}]`, visit),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.assetId === "string") visit(record.assetId, path);
  for (const [key, entry] of Object.entries(record)) {
    walkAssetIds(entry, path === "" ? key : `${path}.${key}`, visit);
  }
}

export function collectAssetIds(pages: { draft: NodeTree }[]): Set<string> {
  const ids = new Set<string>();
  for (const page of pages) {
    for (const node of Object.values(page.draft.nodes)) {
      walkAssetIds(node.props, "", (assetId) => ids.add(assetId));
    }
  }
  return ids;
}

// Rewrites every `assetRef` in a value through an id map (ADR-0014). Unknown
// ids stay as they are: the `broken-asset` check then reports the gap honestly
// instead of a reference quietly disappearing from the copy.
export function rewriteAssetRefs<T>(value: T, idMap: ReadonlyMap<string, string>): T {
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input === null || typeof input !== "object") return input;
    const record = input as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (key === "assetId" && typeof entry === "string") {
        next[key] = idMap.get(entry) ?? entry;
        continue;
      }
      next[key] = walk(entry);
    }
    return next;
  };
  return walk(value) as T;
}

// ------------------------------------------------------------------ context

export type MediaContext = {
  store: Store;
  dataDir: string;
  maxUploadBytes: number;
};

export type UploadUrl = {
  uploadId: string;
  ticket: UploadTicket;
  expiresAt: string;
};

export type UploadCommit = {
  asset: Asset;
  deduped: boolean;
  // Encoder problems (e.g. a broken image) never fail the upload; they surface
  // here and the asset stays usable with its original file.
  warnings: string[];
};

async function assertFolderInSite(
  store: Store,
  siteId: string,
  folderId: string,
): Promise<void> {
  const folder = await store.getAssetFolder(folderId);
  if (folder.siteId !== siteId) {
    throw new SenifyError(
      "validation",
      `Folder "${folderId}" belongs to another site`,
      { field: "folderId" },
    );
  }
}

export async function createAssetFolder(
  context: MediaContext,
  input: { siteId: string; name: string; parentId: string | null },
): Promise<AssetFolder> {
  await context.store.getSite(input.siteId);
  const name = input.name.trim();
  if (name === "") {
    throw new SenifyError("validation", "Folder name is required", {
      field: "name",
      suggestion: "Give the folder a name.",
    });
  }
  if (input.parentId !== null) {
    await assertFolderInSite(context.store, input.siteId, input.parentId);
  }
  return context.store.createAssetFolder({
    id: newEntityId(),
    siteId: input.siteId,
    name,
    parentId: input.parentId,
  });
}

export async function createUploadTicket(
  context: MediaContext,
  input: { siteId: string; body: UploadUrlBody },
): Promise<UploadUrl> {
  await context.store.getSite(input.siteId);
  const { body } = input;
  const mime = body.mime.trim().toLowerCase();
  if (!isAllowedMime(mime)) {
    throw new SenifyError(
      "validation",
      `Media type "${body.mime}" is not allowed`,
      {
        field: "mime",
        suggestion: `Allowed types: ${ALLOWED_MIME_LABEL}.`,
      },
    );
  }
  if (body.byteSize > context.maxUploadBytes) {
    throw new SenifyError(
      "validation",
      `File exceeds the upload limit of ${context.maxUploadBytes} bytes`,
      {
        field: "byteSize",
        suggestion: "Shrink the file or raise the engine limit (maxUploadBytes).",
      },
    );
  }
  const folderId = body.folderId ?? null;
  if (folderId !== null) {
    await assertFolderInSite(context.store, input.siteId, folderId);
  }
  const replaceAssetId = body.replaceAssetId ?? null;
  if (replaceAssetId !== null) {
    const target = await context.store.getAsset(replaceAssetId);
    if (target.siteId !== input.siteId) {
      throw new SenifyError(
        "validation",
        `Asset "${replaceAssetId}" belongs to another site`,
        { field: "replaceAssetId" },
      );
    }
    if (target.status === "trashed") {
      throw new SenifyError(
        "conflict",
        `Trashed asset "${replaceAssetId}" cannot be replaced`,
        {
          field: "replaceAssetId",
          suggestion: "Restore the asset from the trash first.",
        },
      );
    }
  }
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
  const uploadId = newEntityId();
  return {
    uploadId,
    expiresAt,
    ticket: {
      uploadId,
      siteId: input.siteId,
      filename: sanitizeFilename(body.filename),
      mime,
      replaceAssetId,
      altText: normalizeAltText(body.altText ?? null),
      decorative: body.decorative ?? false,
      folderId,
      tags: normalizeTags(body.tags ?? []),
      expiresAt,
    },
  };
}

// Replace keeps the asset id and URL stable: the previous file moves into the
// history so restore can bring it back, metadata (alt, tags, folder) stays.
async function replaceAssetFile(
  context: MediaContext,
  ticket: UploadTicket,
  data: Buffer,
  hash: string,
): Promise<Asset> {
  const assetId = ticket.replaceAssetId;
  if (assetId === null) throw new Error("replaceAssetFile needs a target asset");
  const asset = await context.store.getAsset(assetId);
  if (asset.siteId !== ticket.siteId) {
    throw new SenifyError(
      "validation",
      `Asset "${assetId}" belongs to another site`,
      { field: "replaceAssetId" },
    );
  }
  if (asset.status === "trashed") {
    throw new SenifyError(
      "conflict",
      `Trashed asset "${assetId}" cannot be replaced`,
      { field: "replaceAssetId" },
    );
  }
  const previousPath = resolveStoredFile(context.dataDir, asset.storageRef);
  if (previousPath !== undefined && existsSync(previousPath)) {
    const historyId = newEntityId();
    const previousName = storedFileName(asset.storageRef);
    moveAssetFile(
      previousPath,
      historyFilePath(context.dataDir, asset.siteId, asset.id, historyId, previousName),
    );
    await context.store.createAssetHistory({
      id: historyId,
      assetId: asset.id,
      storageRef: historyStorageRef(asset.siteId, asset.id, historyId, previousName),
      mime: asset.mime,
      byteSize: asset.byteSize,
    });
  }
  // The file name (and therefore the URL) stays: usages must not change when
  // a file is replaced. The MIME type follows the new bytes instead.
  const filename = storedFileName(asset.storageRef);
  const dimensions = imageDimensions(data, ticket.mime);
  writeAssetFile(
    assetFilePath(context.dataDir, asset.siteId, asset.id, filename),
    data,
  );
  const now = new Date().toISOString();
  return context.store.updateAsset(asset.id, {
    filename,
    mime: ticket.mime,
    kind: assetKindForMime(ticket.mime),
    byteSize: data.length,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    hash,
    storageRef: assetStorageRef(asset.siteId, asset.id, filename),
    replacedAt: now,
    updatedAt: now,
  });
}

// Rebuilds the image ladder and blur hash for an asset. The variant files are
// rewritten from scratch (widths change with the dimensions), and any encoder
// failure only yields a warning — the original file stays deliverable.
async function refreshImageDerivatives(
  context: MediaContext,
  asset: Asset,
  data: Buffer,
): Promise<string[]> {
  removeVariantFiles(context.dataDir, asset.siteId, asset.id);
  if (asset.kind !== "image" || !supportsVariants(asset.mime)) {
    await context.store.deleteAssetDerivatives(asset.id);
    return [];
  }
  try {
    const { variants, blurhash } = await buildImageDerivatives({
      dataDir: context.dataDir,
      siteId: asset.siteId,
      assetId: asset.id,
      data,
      width: asset.width,
    });
    await context.store.replaceAssetDerivatives(asset.id, variants, blurhash);
    return [];
  } catch (error) {
    removeVariantFiles(context.dataDir, asset.siteId, asset.id);
    await context.store.deleteAssetDerivatives(asset.id);
    return [
      `Image variants for asset "${asset.id}" could not be generated: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    ];
  }
}

export async function commitUpload(
  context: MediaContext,
  input: { ticket: UploadTicket; data: Buffer },
): Promise<UploadCommit> {
  const { ticket, data } = input;
  if (data.length === 0) {
    throw new SenifyError("validation", "Uploaded file is empty", {
      field: "file",
      suggestion: "Send the raw file bytes in the request body.",
    });
  }
  if (data.length > context.maxUploadBytes) {
    throw new SenifyError(
      "validation",
      `File exceeds the upload limit of ${context.maxUploadBytes} bytes`,
      { field: "file" },
    );
  }
  const hash = sha256(data);
  if (ticket.replaceAssetId !== null) {
    const replaced = await replaceAssetFile(context, ticket, data, hash);
    const warnings = await refreshImageDerivatives(context, replaced, data);
    return {
      asset: await context.store.getAsset(replaced.id),
      deduped: false,
      warnings,
    };
  }
  const existing = await context.store.findAssetByHash(ticket.siteId, hash);
  if (existing) return { asset: existing, deduped: true, warnings: [] };
  const assetId = newEntityId();
  const filename = ticket.filename;
  const dimensions = imageDimensions(data, ticket.mime);
  writeAssetFile(
    assetFilePath(context.dataDir, ticket.siteId, assetId, filename),
    data,
  );
  const asset = await context.store.createAsset({
    id: assetId,
    siteId: ticket.siteId,
    filename,
    mime: ticket.mime,
    kind: assetKindForMime(ticket.mime),
    byteSize: data.length,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    hash,
    altText: ticket.altText,
    decorative: ticket.decorative,
    folderId: ticket.folderId,
    tags: ticket.tags,
    storageRef: assetStorageRef(ticket.siteId, assetId, filename),
  });
  const warnings = await refreshImageDerivatives(context, asset, data);
  return {
    asset: await context.store.getAsset(asset.id),
    deduped: false,
    warnings,
  };
}

// ------------------------------------------------------- history and library

export async function restoreAssetHistory(
  context: MediaContext,
  input: { siteId: string; assetId: string; historyId: string },
): Promise<Asset> {
  const asset = await context.store.getAssetOfSite(input.assetId, input.siteId);
  const entry = await context.store.getAssetHistory(input.historyId);
  if (entry.assetId !== asset.id) {
    throw new SenifyError(
      "validation",
      `History entry "${entry.id}" belongs to another asset`,
      { field: "historyId" },
    );
  }
  const entryPath = resolveStoredFile(context.dataDir, entry.storageRef);
  if (entryPath === undefined || !existsSync(entryPath)) {
    throw new SenifyError("not_found", "The file of this version is missing", {
      field: "historyId",
      suggestion: "Purge the asset or replace the file once more.",
    });
  }
  // Append-only: the file that is displaced by the restore becomes history.
  const currentPath = resolveStoredFile(context.dataDir, asset.storageRef);
  if (currentPath !== undefined && existsSync(currentPath)) {
    const displacedId = newEntityId();
    const displacedName = storedFileName(asset.storageRef);
    moveAssetFile(
      currentPath,
      historyFilePath(context.dataDir, asset.siteId, asset.id, displacedId, displacedName),
    );
    await context.store.createAssetHistory({
      id: displacedId,
      assetId: asset.id,
      storageRef: historyStorageRef(asset.siteId, asset.id, displacedId, displacedName),
      mime: asset.mime,
      byteSize: asset.byteSize,
    });
  }
  const restoredName = storedFileName(entry.storageRef);
  const restoredPath = assetFilePath(
    context.dataDir,
    asset.siteId,
    asset.id,
    restoredName,
  );
  moveAssetFile(entryPath, restoredPath);
  const bytes = readFileSync(restoredPath);
  const dimensions = imageDimensions(bytes, entry.mime);
  const now = new Date().toISOString();
  const restored = await context.store.updateAsset(asset.id, {
    filename: restoredName,
    mime: entry.mime,
    kind: assetKindForMime(entry.mime),
    byteSize: entry.byteSize,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    hash: sha256(bytes),
    storageRef: assetStorageRef(asset.siteId, asset.id, restoredName),
    replacedAt: now,
    updatedAt: now,
  });
  // The restored bytes have their own dimensions, so the ladder is rebuilt.
  await refreshImageDerivatives(context, restored, bytes);
  return context.store.getAsset(restored.id);
}

export async function applyAssetPatch(
  store: Store,
  input: { siteId: string; assetId: string },
  patch: AssetPatchBody,
): Promise<Asset> {
  const asset = await store.getAssetOfSite(input.assetId, input.siteId);
  const update: AssetUpdate = {};
  if (patch.altText !== undefined) {
    update.altText = normalizeAltText(patch.altText ?? "");
  }
  if (patch.decorative !== undefined) update.decorative = patch.decorative;
  if (patch.tags !== undefined) update.tags = normalizeTags(patch.tags);
  if (patch.folderId !== undefined) {
    if (patch.folderId !== null) {
      await assertFolderInSite(store, asset.siteId, patch.folderId);
    }
    update.folderId = patch.folderId;
  }
  return store.updateAsset(asset.id, update);
}

// ------------------------------------------------- copying a site's media

export type SiteAssetCopy = {
  assets: number;
  folders: number;
  skipped: string[];
  idMap: Map<string, string>;
};

// A duplicated site used to reference the source's asset ids (ADR-0014). That
// made the copy unpublishable — the bake lists assets per site, so it delivered
// no images and `submitReview` reported `broken-asset` — and a purge of the copy
// deleted the source's file. The copy now gets its own ids, its own folders and
// its own files; both sites are independent afterwards.
//
// The rows are written first, because they mint the target ids and storage refs
// the files then have to match. If a file copy fails, the rows are rolled back
// by hand: a rollback can delete rows but never files, so the residue of a
// failure is a folder without rows, which is harmless. The other way round
// would leave rows pointing at files that are not there, and the bake skips
// those silently.
export async function copySiteAssets(
  context: MediaContext,
  input: {
    sourceSiteId: string;
    targetSiteId: string;
    assetIds: ReadonlySet<string>;
    now: string;
  },
): Promise<SiteAssetCopy> {
  // Step one: decide what is copied at all. A missing row, a missing file or a
  // foreign id is reported as skipped instead of failing the whole duplicate.
  const wanted: Asset[] = [];
  const skipped: string[] = [];
  for (const assetId of input.assetIds) {
    let asset: Asset;
    try {
      asset = await context.store.getAsset(assetId);
    } catch {
      skipped.push(assetId);
      continue;
    }
    if (asset.siteId !== input.sourceSiteId) {
      // A draft may point at another site's asset; the copy keeps the reference
      // so the broken-asset check reports it instead of losing it silently.
      skipped.push(`${asset.id} (fremde Site)`);
      continue;
    }
    wanted.push(asset);
  }
  if (wanted.length === 0) {
    // Folders still come along, so the library keeps its structure.
    const empty = await context.store.duplicateAssetRecords({
      sourceSiteId: input.sourceSiteId,
      targetSiteId: input.targetSiteId,
      assetIds: new Set(),
      now: input.now,
    });
    return { assets: 0, folders: empty.folders, skipped, idMap: empty.idMap };
  }

  // Step two: rows. The store mints the ids and the storage refs, so both sides
  // agree on one map before a single file moves.
  const copied = await context.store.duplicateAssetRecords({
    sourceSiteId: input.sourceSiteId,
    targetSiteId: input.targetSiteId,
    assetIds: new Set(wanted.map((asset) => asset.id)),
    now: input.now,
  });

  // Step three: files for whatever actually landed. A rewritten id still points
  // at a deterministic target path, so the ladder follows the same rule as the
  // original row. A source file that is already gone fails the copy on purpose:
  // rows without files would bake into silently broken images.
  const history = await Promise.all(
    wanted.map((asset) => context.store.listAssetHistory(asset.id)),
  );
  try {
    for (const [index, asset] of wanted.entries()) {
      const targetId = copied.idMap.get(asset.id);
      if (targetId === undefined) {
        skipped.push(asset.id);
        continue;
      }
      copyAssetTree(context, asset, input.targetSiteId, targetId, {
        historyIds: copied.historyIds.get(asset.id) ?? new Map(),
        history: history[index] ?? [],
      });
    }
  } catch (error) {
    for (const targetId of copied.idMap.values()) {
      removeAssetDir(context.dataDir, input.targetSiteId, targetId);
    }
    await context.store.deleteCopiedAssetRecords(input.targetSiteId, copied.idMap);
    throw error;
  }
  return {
    assets: copied.assets,
    folders: copied.folders,
    skipped,
    idMap: copied.idMap,
  };
}

// Copies the original, the image ladder and the file history of one asset. The
// target paths mirror the source layout, so every `storage_ref` the row copy
// wrote resolves to a real file.
function copyAssetTree(
  context: MediaContext,
  asset: Asset,
  targetSiteId: string,
  targetId: string,
  copied: {
    historyIds: ReadonlyMap<string, string>;
    history: Awaited<ReturnType<Store["listAssetHistory"]>>;
  },
): void {
  const name = storedFileName(asset.storageRef);
  const from = resolveStoredFile(context.dataDir, asset.storageRef);
  if (from === undefined || !existsSync(from)) {
    throw new SenifyError("not_found", `The file of asset "${asset.id}" is missing`, {
      field: "assetId",
      suggestion: "Restore the source library or drop the reference before duplicating.",
    });
  }
  writeAssetFile(
    assetFilePath(context.dataDir, targetSiteId, targetId, name),
    readFileSync(from),
  );
  for (const variant of asset.variants) {
    const source = resolveStoredFile(context.dataDir, variant.storageRef);
    if (source === undefined || !existsSync(source)) continue;
    writeAssetFile(
      variantFilePath(context.dataDir, targetSiteId, targetId, variant.width, variant.format),
      readFileSync(source),
    );
  }
  // The file history travels too, so restore-history works on the copy. The
  // store minted a new history id per entry, so the file has to use exactly
  // the id that ended up in the copied row.
  for (const [sourceHistoryId, targetHistoryId] of copied.historyIds) {
    const entry = copied.history.find((candidate) => candidate.id === sourceHistoryId);
    if (entry === undefined) continue;
    const source = resolveStoredFile(context.dataDir, entry.storageRef);
    if (source === undefined || !existsSync(source)) continue;
    writeAssetFile(
      historyFilePath(
        context.dataDir,
        targetSiteId,
        targetId,
        targetHistoryId,
        storedFileName(entry.storageRef),
      ),
      readFileSync(source),
    );
  }
}

// A purge deletes files, so it must never touch an asset of another site
// (ADR-0014). A duplicated site used to point at the source ids, which made a
// purge of the copy destroy the source's image.
export async function purgeAsset(
  context: MediaContext,
  input: { siteId: string; assetId: string },
): Promise<Asset> {
  const asset = await context.store.getAssetOfSite(input.assetId, input.siteId);
  await context.store.deleteAssetHistory(asset.id);
  await context.store.deleteAssetDerivatives(asset.id);
  await context.store.deleteAssetRecord(asset.id);
  removeAssetDir(context.dataDir, asset.siteId, asset.id);
  return asset;
}

export async function bulkAssets(
  context: MediaContext,
  input: { siteId: string; body: BulkAssetsBody; allowPurge: boolean },
): Promise<AssetBulkResult> {
  const { body } = input;
  if (body.patch === undefined && body.trash !== true && body.purge !== true) {
    throw new SenifyError("validation", "Bulk request without an operation", {
      field: "ids",
      suggestion: "Set patch, trash or purge.",
    });
  }
  if (body.purge === true && !input.allowPurge) {
    throw new SenifyError("auth", "Purge needs the publish scope", {
      field: "purge",
      suggestion: "Use a token with the publish scope for permanent deletes.",
    });
  }
  const result: AssetBulkResult = { updated: 0, failed: [] };
  const now = new Date().toISOString();
  for (const id of body.ids) {
    try {
      // The guard is the point of this call: a foreign id must fail before any
      // write reaches it, and a purge of another site must not happen at all.
      await context.store.getAssetOfSite(id, input.siteId);
      if (body.purge === true) {
        await purgeAsset(context, { siteId: input.siteId, assetId: id });
      } else if (body.trash === true) {
        await context.store.updateAsset(id, { status: "trashed", trashedAt: now });
      } else if (body.patch !== undefined) {
        await applyAssetPatch(context.store, { siteId: input.siteId, assetId: id }, body.patch);
      }
      result.updated += 1;
    } catch (error) {
      result.failed.push({
        id,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  return result;
}

export type AssetListSort = "createdAt" | "name" | "size" | "replacedAt";

export type AssetListFilters = {
  status?: AssetStatus | "all";
  folderId?: string;
  folderNone?: boolean;
  tag?: string;
  tagNone?: boolean;
  altMissing?: boolean;
  minBytes?: number;
  query?: string;
  sort?: AssetListSort;
};

const ASSET_LIST_SORTS: readonly AssetListSort[] = [
  "createdAt",
  "name",
  "size",
  "replacedAt",
];

export function parseAssetListFilters(
  params: URLSearchParams,
): AssetListFilters {
  const status = params.get("status");
  if (status !== null && status !== "ready" && status !== "trashed" && status !== "all") {
    throw new SenifyError("validation", `Unknown asset status "${status}"`, {
      field: "status",
      suggestion: 'Use "ready", "trashed" or "all".',
    });
  }
  const sort = params.get("sort");
  if (sort !== null && !ASSET_LIST_SORTS.includes(sort as AssetListSort)) {
    throw new SenifyError("validation", `Unknown asset sort "${sort}"`, {
      field: "sort",
      suggestion: `Use one of: ${ASSET_LIST_SORTS.join(", ")}.`,
    });
  }
  const alt = params.get("alt");
  if (alt !== null && alt !== "missing") {
    throw new SenifyError("validation", `Unknown alt filter "${alt}"`, {
      field: "alt",
      suggestion: 'Use alt=missing for the "no alt text" smart list.',
    });
  }
  const minBytesRaw = params.get("minBytes");
  let minBytes: number | undefined;
  if (minBytesRaw !== null) {
    minBytes = Number.parseInt(minBytesRaw, 10);
    if (!Number.isInteger(minBytes) || minBytes < 0) {
      throw new SenifyError("validation", "minBytes must be a positive integer", {
        field: "minBytes",
      });
    }
  }
  const folder = params.get("folder");
  const tag = params.get("tag");
  const query = params.get("q");
  return {
    ...(status === null ? {} : { status: status as AssetStatus | "all" }),
    ...(folder === null
      ? {}
      : folder === "none"
        ? { folderNone: true }
        : { folderId: folder }),
    ...(tag === null ? {} : tag === "none" ? { tagNone: true } : { tag }),
    ...(alt === "missing" ? { altMissing: true } : {}),
    ...(minBytes === undefined ? {} : { minBytes }),
    ...(query === null ? {} : { query }),
    ...(sort === null ? {} : { sort: sort as AssetListSort }),
  };
}

function matchesFilter(asset: Asset, filters: AssetListFilters): boolean {
  if (filters.folderNone === true && asset.folderId !== null) return false;
  if (filters.folderId !== undefined && asset.folderId !== filters.folderId) {
    return false;
  }
  if (filters.tagNone === true && asset.tags.length > 0) return false;
  if (filters.tag !== undefined && !asset.tags.includes(filters.tag)) return false;
  if (
    filters.altMissing === true &&
    (asset.decorative || (asset.altText ?? "").trim() !== "")
  ) {
    return false;
  }
  if (filters.minBytes !== undefined && asset.byteSize < filters.minBytes) {
    return false;
  }
  if (filters.query !== undefined) {
    const needle = filters.query.trim().toLowerCase();
    if (
      needle !== "" &&
      !`${asset.filename} ${asset.altText ?? ""}`.toLowerCase().includes(needle)
    ) {
      return false;
    }
  }
  return true;
}

function sortAssets(assets: Asset[], sort: AssetListSort): Asset[] {
  const copy = [...assets];
  if (sort === "name") {
    return copy.sort(
      (a, b) => a.filename.localeCompare(b.filename) || b.id.localeCompare(a.id),
    );
  }
  if (sort === "size") {
    return copy.sort(
      (a, b) => b.byteSize - a.byteSize || b.id.localeCompare(a.id),
    );
  }
  if (sort === "replacedAt") {
    // Assets without a replace land at the end ("" sorts last descending).
    return copy.sort(
      (a, b) =>
        (b.replacedAt ?? "").localeCompare(a.replacedAt ?? "") ||
        b.id.localeCompare(a.id),
    );
  }
  return copy;
}

export async function queryAssets(
  store: Store,
  siteId: string,
  filters: AssetListFilters,
): Promise<Asset[]> {
  const assets = await store.listAssets(siteId, {
    status: filters.status ?? "ready",
  });
  return sortAssets(
    assets.filter((asset) => matchesFilter(asset, filters)),
    filters.sort ?? "createdAt",
  );
}
