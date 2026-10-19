import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

// Storage layout: <dataDir>/assets/<siteId>/<assetId>/<filename>. Replaced
// files move into a history/ subfolder instead of being deleted, so a restore
// only swaps paths and never needs a second copy of the library.
export function assetDir(
  dataDir: string,
  siteId: string,
  assetId: string,
): string {
  return join(dataDir, "assets", siteId, assetId);
}

export function assetFilePath(
  dataDir: string,
  siteId: string,
  assetId: string,
  filename: string,
): string {
  return join(assetDir(dataDir, siteId, assetId), filename);
}

export function historyFilePath(
  dataDir: string,
  siteId: string,
  assetId: string,
  historyId: string,
  filename: string,
): string {
  return join(assetDir(dataDir, siteId, assetId), "history", historyId, filename);
}

export function assetStorageRef(
  siteId: string,
  assetId: string,
  filename: string,
): string {
  return ["assets", siteId, assetId, filename].join("/");
}

// One directory per history entry keeps the original file name intact, so a
// restore can put the file back under its old URL.
export function historyStorageRef(
  siteId: string,
  assetId: string,
  historyId: string,
  filename: string,
): string {
  return ["assets", siteId, assetId, "history", historyId, filename].join("/");
}

// Encoded ladder rungs live in a variants/ subfolder next to the original, so
// a purge (which removes the whole asset dir) takes them with it.
export function variantsDir(
  dataDir: string,
  siteId: string,
  assetId: string,
): string {
  return join(assetDir(dataDir, siteId, assetId), "variants");
}

export function variantFilePath(
  dataDir: string,
  siteId: string,
  assetId: string,
  width: number,
  format: string,
): string {
  return join(variantsDir(dataDir, siteId, assetId), `${width}.${format}`);
}

export function variantStorageRef(
  siteId: string,
  assetId: string,
  width: number,
  format: string,
): string {
  return ["assets", siteId, assetId, "variants", `${width}.${format}`].join("/");
}

export function removeVariantFiles(
  dataDir: string,
  siteId: string,
  assetId: string,
): void {
  rmSync(variantsDir(dataDir, siteId, assetId), {
    recursive: true,
    force: true,
  });
}

export function storedFileName(storageRef: string): string {
  const parts = storageRef.split("/");
  return parts[parts.length - 1] ?? storageRef;
}

export function writeAssetFile(path: string, data: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

export function moveAssetFile(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

export function removeAssetDir(
  dataDir: string,
  siteId: string,
  assetId: string,
): void {
  rmSync(assetDir(dataDir, siteId, assetId), { recursive: true, force: true });
}

// Traversal guard for stored files (same shape as resolvePreviewFile): the
// resolved path must stay inside dataDir, even for a corrupted storage_ref.
export function resolveStoredFile(
  dataDir: string,
  storageRef: string,
): string | undefined {
  const root = resolve(dataDir);
  const target = resolve(root, storageRef.replace(/^[/\\]+/, ""));
  if (target === root || !target.startsWith(root + sep)) return undefined;
  return target;
}

export type SiteFileRef = {
  kind: "releases" | "previews" | "reviews" | "redesign-proposals";
  id: string;
  storedPath?: string;
};

// Entity IDs use the IDs alphabet, never path syntax. Only direct children of
// the owned storage roots may be removed. A build must
// match its own row ID, not merely point somewhere inside dataDir: a corrupted
// reference must not remove the asset root or another site's build.
export function removeSiteFiles(
  dataDir: string,
  siteId: string,
  fileRefs: readonly SiteFileRef[],
): void {
  const root = resolve(dataDir);
  const assets = join(root, "assets");
  const siteAssets = resolve(assets, siteId);
  if (/^[A-Za-z0-9_-]+$/.test(siteId) && dirname(siteAssets) === assets) {
    rmSync(siteAssets, { recursive: true, force: true });
  }
  for (const file of fileRefs) {
    if (!/^[A-Za-z0-9_-]+$/.test(file.id)) continue;
    const files = join(root, file.kind);
    const expected = resolve(files, file.id);
    if (dirname(expected) !== files) continue;
    if (file.storedPath !== undefined && resolve(file.storedPath) !== expected) continue;
    rmSync(expected, { recursive: true, force: true });
  }
}
