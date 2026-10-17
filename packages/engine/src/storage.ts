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

// Removes what a deleted site left on disk: its asset folder and the build
// directories of its releases and previews. A build reference that does not
// resolve inside the data directory is skipped - a corrupted row must never make
// a delete reach outside it.
export function removeSiteFiles(
  dataDir: string,
  siteId: string,
  buildRefs: readonly string[],
): void {
  rmSync(join(dataDir, "assets", siteId), { recursive: true, force: true });
  const root = resolve(dataDir);
  for (const ref of buildRefs) {
    const target = resolve(ref);
    if (target === root || !target.startsWith(root + sep)) continue;
    rmSync(target, { recursive: true, force: true });
  }
}
