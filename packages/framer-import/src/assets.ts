// The asset pipeline (plan.md S2.3/S2.3b): every URL the capture found is
// downloaded once, deduped by content hash and handed to the caller — either
// as a local file (offline mirror mode) or through an upload callback that
// wires into the engine's media pipeline (the HTTP test routes the bytes
// through the signed upload, production routes them into `commitUpload`).
//
// Fonts are the DSGVO task (2.3b): the `@font-face` blocks of an import point
// at Framer's CDN. The importer downloads the files, dedupes by
// (hash + unicode-range) and rewrites the IR's `src` lists to local paths, so
// no font request leaves the installation after the import. The engine-side
// storage (FontRef.files + bake delivery) is the S3 integration.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { SenifyError } from "@senify/core";
import { fetchPublic } from "@senify/core/net";
import type { FramerIrDocument, IrAsset, IrFontFace, IrNode } from "./ir.ts";
import { dataUrlMime, decodeDataUrl, sanitizeSvg } from "./svg.ts";

/* ------------------------------------------------------------------ types */

// The upload half. `upload` receives the raw bytes plus metadata and returns
// the local URL the mapped nodes should reference (the engine returns
// `/assets/<assetId>/<filename>`).
export type AssetUploadResult = {
  assetId: string;
  url: string;
  // The engine uploader reports false only for a newly created Asset. A
  // content-hash hit is a dedupe and must survive a later import compensation.
  deduped?: boolean;
};

export type AssetUploader = (input: {
  filename: string;
  mime: string;
  data: Buffer;
  alt: string | null;
}) => Promise<AssetUploadResult | string> | AssetUploadResult | string;

export type AssetDownload = {
  url: string;
  hash: string;
  bytes: number;
  // Where the file lives after the run: the local mirror path or the
  // uploader's URL. `null` = the download failed and the finding explains it.
  localUrl: string | null;
  mime: string;
  assetId: string | null;
};

export type AssetReport = {
  downloads: AssetDownload[];
  fonts: {
    family: string;
    weight: number | null;
    style: string | null;
    unicodeRange: string | null;
    // The rewritten local path(s) after dedupe; one file per unique
    // (hash, unicode-range) pair.
    files: string[];
    hash: string;
    bytes: number;
  }[];
  deduped: number;
  failed: number;
};

export type AssetResult = {
  document: FramerIrDocument;
  report: AssetReport;
};

/* ------------------------------------------------------------------ mime */

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function mimeForUrl(url: string): string {
  const dataMime = dataUrlMime(url);
  if (dataMime !== null) return dataMime;
  const clean = url.split(/[?#]/)[0] ?? url;
  return MIME_BY_EXT[extname(clean).toLowerCase()] ?? "application/octet-stream";
}

const EXT_BY_MIME: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
};

function filenameFor(url: string, fallbackKind: string): string {
  // A data URL has no name: the media type gives the extension.
  const dataMime = dataUrlMime(url);
  if (dataMime !== null) {
    return `import-${fallbackKind}${EXT_BY_MIME[dataMime] ?? ""}`;
  }
  const clean = url.split(/[?#]/)[0] ?? url;
  const base = clean.split("/").pop() ?? "asset";
  const safe = base.replace(/[^A-Za-z0-9._-]/g, "-").slice(-120);
  return safe !== "" && extname(safe) !== "" ? safe : `import-${fallbackKind}`;
}

/* ------------------------------------------------------------- downloading */

// A single asset is buffered whole before it reaches the upload check, so the
// download itself has a ceiling (ADR-0016).
const MAX_ASSET_BYTES = 200 * 1024 * 1024;

async function fetchBytes(url: string, timeoutMs: number): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchPublic(url, {
      signal: controller.signal,
      maxBytes: MAX_ASSET_BYTES,
    });
    if (!response.ok) {
      throw new SenifyError("not_found", `Download fehlgeschlagen: ${response.status} ${url}`, {
        field: "url",
        suggestion: "Asset prüfen: die Quelle ist möglicherweise offline oder geschützt.",
      });
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------- main entry */

export type ImportAssetsInput = {
  document: FramerIrDocument;
  // The base of the source page: relative URLs resolve against it. Absent =
  // every asset URL is already absolute (the Framer CDN case).
  baseUrl?: string;
  // The folder the source files live in (mirror mode). A relative asset URL
  // names a file of that copy and is read from there before the network is
  // asked: the mirror is the source of truth for what the page showed.
  localRoot?: string;
  // The folder of the imported page inside `localRoot`. A relative URL of the
  // page points into that folder first, then into `localRoot`.
  localPageDir?: string;
  // Upload into the engine media pipeline when given; otherwise files are
  // written to `outDir` (offline mirror mode).
  uploader?: AssetUploader;
  // The output folder for mirror mode (required without an uploader).
  outDir?: string;
  includeAssets?: boolean;
  includeFonts?: boolean;
  timeoutMs?: number;
};

export async function importAssets(input: ImportAssetsInput): Promise<AssetResult> {
  const { document } = input;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const includeAssets = input.includeAssets ?? true;
  const includeFonts = input.includeFonts ?? true;
  const report: AssetReport = { downloads: [], fonts: [], deduped: 0, failed: 0 };
  const hasTargets = input.uploader !== undefined || input.outDir !== undefined;
  const hasContent =
    (includeAssets && document.assets.length > 0) || (includeFonts && document.styles.fonts.length > 0);
  // Nothing to carry: an empty source is a no-op, not an error — the run
  // still returns its (empty) report so the caller prints stable numbers.
  if (!hasTargets && hasContent) {
    throw new SenifyError(
      "validation",
      "Asset-Import braucht einen Uploader oder ein Ausgabeverzeichnis",
      { field: "outDir", suggestion: "outDir setzen (Offline-Modus) oder uploader mitgeben." },
    );
  }
  if (input.outDir !== undefined) mkdirSync(input.outDir, { recursive: true });

  // --- page assets (images, videos): download once, dedupe by hash.
  const byHash = new Map<string, AssetDownload>();
  const urlToAsset = new Map<string, AssetDownload>();
  for (const asset of includeAssets ? document.assets : []) {
    if (urlToAsset.has(asset.url)) continue;
    // A data URL that is not a picture never becomes an asset: the media
    // library serves what it holds under the site's own address, and a
    // document (HTML) served there would run in the site's origin.
    const dataMime = dataUrlMime(asset.url);
    if (dataMime !== null && !dataMime.startsWith("image/")) {
      report.failed += 1;
      document.findings.push({
        kind: "asset-blocked",
        nodeKey: null,
        message: `Data-URL mit dem Typ "${dataMime}" wurde nicht übernommen.`,
        evidence: asset.url.slice(0, 80),
        severity: "warn",
        suggestion: "Nur Bilder werden aus einer Data-URL übernommen.",
      });
      continue;
    }
    urlToAsset.set(asset.url, await downloadAsset(asset, input, timeoutMs, byHash, report, document.findings));
  }

  // --- fonts (DSGVO 2.3b): download, dedupe by hash + unicode-range,
  // rewrite the IR's src lists to local paths.
  const fontByHash = new Map<string, { hash: string; bytes: number; files: string[] }>();
  const rewrittenFonts: IrFontFace[] = [];
  for (const font of document.styles.fonts) {
    const rewritten: IrFontFace = { ...font, src: includeFonts ? [] : [...font.src] };
    if (!includeFonts) {
      rewrittenFonts.push(rewritten);
      continue;
    }
    // The report names the FACE, not the file: one variable font serves
    // several weights (Manrope 600 and 700 share a file), and the theme
    // writes one `@font-face` per weight. A report that lists the file only
    // once would leave the weight without a file.
    const faceFiles: string[] = [];
    let faceHash = "";
    let faceBytes = 0;
    for (const src of font.src) {
      const key = `${font.family}|${font.unicodeRange ?? ""}|${src}`;
      let entry = fontByHash.get(key);
      if (entry === undefined) {
        try {
          const data = await fontBytes(src, input, timeoutMs);
          const hash = sha256(data);
          const cached = fontByHashByContent(fontByHash, hash);
          if (cached !== undefined) {
            entry = { hash, bytes: cached.bytes, files: cached.files };
            report.deduped += 1;
          } else {
            const filename = filenameFor(src, "font");
            const uploaded = input.uploader !== undefined
              ? await input.uploader({ filename, mime: mimeForUrl(src), data, alt: null })
              : { url: writeMirrorFile(input.outDir, filename, data), assetId: null };
            const localUrl = typeof uploaded === "string" ? uploaded : uploaded.url;
            entry = { hash, bytes: data.length, files: [localUrl] };
          }
          fontByHash.set(key, entry);
        } catch (error) {
          report.failed += 1;
          document.findings.push({
            kind: "asset-blocked",
            nodeKey: null,
            message: `Font-Datei konnte nicht geladen werden: ${src}`,
            evidence: src,
            severity: "warn",
            suggestion:
              error instanceof SenifyError
                ? (error.suggestion ?? "Quelle prüfen.")
                : "Quelle prüfen; der Browser-Capture kann die Datei mitliefern.",
          });
          continue;
        }
      }
      if (entry !== undefined) {
        rewritten.src.push(...entry.files.filter((file) => !rewritten.src.includes(file)));
        for (const file of entry.files) {
          if (!faceFiles.includes(file)) faceFiles.push(file);
        }
        faceHash = entry.hash;
        faceBytes = entry.bytes;
      }
    }
    if (faceFiles.length > 0) {
      report.fonts.push({
        family: font.family,
        weight: font.weight,
        style: font.style,
        unicodeRange: font.unicodeRange,
        files: faceFiles,
        hash: faceHash,
        bytes: faceBytes,
      });
    }
    rewrittenFonts.push(rewritten);
  }

  const assets: IrAsset[] = document.assets.map((asset) => {
    const download = urlToAsset.get(asset.url);
    return {
      ...asset,
      hash: download?.hash ?? asset.hash,
      alt: asset.alt ?? null,
      ...(download?.localUrl ? { localUrl: download.localUrl } : {}),
      ...(download?.assetId ? { assetId: download.assetId } : {}),
    };
  });

  const result: FramerIrDocument = {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      root: applyAssetUrls(page.root, urlToAsset),
    })),
    styles: { ...document.styles, fonts: rewrittenFonts },
    assets,
  };
  return { document: result, report };
}

// The delivery map of a run that did NOT upload its assets: every asset keeps
// the address it has in the source, so a preview shows the same picture the
// source page shows. The keys are the ids the mapper wrote into the nodes
// (`node.assetId ?? node.assetUrl`), so a lookup by id finds the address.
//
// An uploaded asset is left out on purpose: the engine builds its delivery
// from the asset store, with the dimensions and the encoded ladder.
export function sourceAssetDeliveries(
  document: FramerIrDocument,
  baseUrl?: string,
): Record<string, string> {
  const deliveries: Record<string, string> = {};
  const visit = (node: IrNode): void => {
    if (node.assetId === undefined || node.assetId === null) {
      const url = node.assetUrl;
      if (url !== undefined && url !== null && url !== "") {
        deliveries[url] = deliveryUrl(url, baseUrl);
      }
    }
    for (const child of node.children) visit(child);
  };
  for (const page of document.pages) visit(page.root);
  return deliveries;
}

// The address a preview loads. A relative address without a base stays as it
// is: a delivery map is a description, not a download — it must not fail the
// run it describes.
function deliveryUrl(url: string, baseUrl: string | undefined): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (baseUrl === undefined) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

/* ---------------------------------------------------------------- helpers */

function applyAssetUrls(
  node: IrNode,
  urlToAsset: Map<string, AssetDownload>,
): IrNode {
  const download = node.assetUrl == null ? undefined : urlToAsset.get(node.assetUrl);
  return {
    ...node,
    ...(download?.localUrl ? { assetUrl: download.localUrl } : {}),
    ...(download?.assetId ? { assetId: download.assetId } : {}),
    children: node.children.map((child) => applyAssetUrls(child, urlToAsset)),
  };
}

function fontByHashByContent(
  fontByHash: Map<string, { hash: string; bytes: number; files: string[] }>,
  hash: string,
): { hash: string; bytes: number; files: string[] } | undefined {
  for (const entry of fontByHash.values()) {
    if (entry.hash === hash) return entry;
  }
  return undefined;
}

async function downloadAsset(
  asset: IrAsset,
  input: ImportAssetsInput,
  timeoutMs: number,
  byHash: Map<string, AssetDownload>,
  report: AssetReport,
  findings: FramerIrDocument["findings"],
): Promise<AssetDownload> {
  // A data URL carries its bytes in the address: it is decoded, never
  // fetched. There is no host to reach, so the address check does not apply.
  const dataContent = decodeDataUrl(asset.url);
  // The mirror's own file wins over the network: the local copy is what the
  // page pointed at.
  const local = dataContent === null ? readLocalAsset(asset.url, input) : null;
  // Without a local file and without a data URL the address has to be
  // resolvable, and a relative URL needs the address of the original site.
  // The error stands outside the try: a source that cannot be resolved stops
  // the import instead of quietly importing a page without its images.
  const absolute =
    local !== null || dataContent !== null ? asset.url : absoluteUrl(asset.url, input.baseUrl);
  try {
    const raw = dataContent !== null ? dataContent.bytes : local ?? (await fetchBytes(absolute, timeoutMs));
    const mime = dataContent === null ? mimeForUrl(asset.url) : dataContent.mime;
    // An SVG can carry a script. It becomes an asset only cleaned up: the
    // file may be opened directly from the media library.
    const data = mime === "image/svg+xml" ? Buffer.from(sanitizeSvg(raw.toString("utf8")), "utf8") : raw;
    const hash = sha256(data);
    const existing = byHash.get(hash);
    if (existing !== undefined) {
      report.deduped += 1;
      return existing;
    }
    const filename = filenameFor(asset.url, asset.kind);
    const uploaded = input.uploader !== undefined
      ? await input.uploader({ filename, mime, data, alt: asset.alt })
      : { url: writeMirrorFile(input.outDir, filename, data), assetId: null };
    const localUrl = typeof uploaded === "string" ? uploaded : uploaded.url;
    const assetId = typeof uploaded === "string" ? null : uploaded.assetId;
    const download: AssetDownload = {
      url: asset.url,
      hash,
      bytes: data.length,
      localUrl,
      mime,
      assetId,
    };
    byHash.set(hash, download);
    report.downloads.push(download);
    return download;
  } catch (error) {
    // The count alone was a silent loss: the report names the file, like it
    // does for a font.
    report.failed += 1;
    findings.push({
      kind: "asset-blocked",
      nodeKey: null,
      message: `Datei konnte nicht geladen werden: ${asset.url}`,
      evidence: asset.url,
      severity: "warn",
      suggestion:
        error instanceof SenifyError
          ? (error.suggestion ?? "Quelle prüfen.")
          : "Quelle prüfen: die Datei ist möglicherweise offline oder geschützt.",
    });
    return { url: asset.url, hash: "", bytes: 0, localUrl: null, mime: mimeForUrl(asset.url), assetId: null };
  }
}

function absoluteUrl(url: string, baseUrl: string | undefined): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (baseUrl === undefined) {
    throw new SenifyError(
      "validation",
      `Relative Asset-URL ohne baseUrl nicht auflösbar: ${url}`,
      { field: "baseUrl" },
    );
  }
  return new URL(url, baseUrl).toString();
}

/* ------------------------------------------------------------ mirror files */

// A mirror is a copy of the site on disk: the page's HTML plus the files it
// points at. A relative URL in such a page names a file of that copy, so the
// copy is read before the network is asked - the mirror is the source of
// truth for what the page showed, and the import works without the address of
// the original site.
//
// The mirror may only deliver its own files (ADR-0016): a path that leaves the
// mirror folder is refused, and so is a link that points out of it.
function readLocalAsset(url: string, input: ImportAssetsInput): Buffer | null {
  const root = input.localRoot;
  if (root === undefined) return null;
  // Absolute URLs (http, https, data) name no file of the mirror.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return null;
  const clean = (url.split(/[?#]/)[0] ?? "").trim();
  if (clean === "") return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    return null;
  }
  const fromRoot = decoded.replace(/^\/+/, "");
  if (fromRoot === "") return null;

  const rootReal = realPathOf(root);
  if (rootReal === null) return null;

  // A path without a leading slash belongs to the page's own folder first (the
  // page's relatives), a root-relative path belongs to the mirror root.
  const candidates: string[] = [];
  if (!decoded.startsWith("/") && input.localPageDir !== undefined) {
    candidates.push(resolve(input.localPageDir, decoded));
  }
  candidates.push(resolve(rootReal, fromRoot));

  for (const candidate of candidates) {
    if (!isInside(rootReal, candidate)) continue;
    if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
    const real = realPathOf(candidate);
    if (real === null || !isInside(rootReal, real)) continue;
    return readFileSync(real);
  }
  return null;
}

function realPathOf(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

// A font file of the mirror is read from disk; only a file that is not there
// goes to the network.
async function fontBytes(url: string, input: ImportAssetsInput, timeoutMs: number): Promise<Buffer> {
  const local = readLocalAsset(url, input);
  if (local !== null) return local;
  return fetchBytes(absoluteUrl(url, input.baseUrl), timeoutMs);
}

// `inside` means: the path lies in the folder or is the folder itself.
function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function writeMirrorFile(outDir: string | undefined, filename: string, data: Buffer): string {
  if (outDir === undefined) {
    throw new SenifyError("validation", "Mirror-Modus braucht outDir", { field: "outDir" });
  }
  const path = resolve(join(outDir, filename));
  writeFileSync(path, data);
  return path;
}

// Read-back helper for tests and the mirror mode: the mirror writes plain
// files, this resolves one without network access.
export function readMirrorFile(path: string): Buffer {
  return readFileSync(path);
}
