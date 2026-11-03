import { mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { SenifyError } from "@senify/core";
import { captureFixture } from "./capture-html.ts";
import { importAssets, type AssetReport } from "./assets.ts";
import type { FramerIrDocument } from "./ir.ts";

const EXCLUDED_DIRS = new Set(["assets", "styles", "scripts", "data", "subpages", "node_modules"]);
const PAGE_LIMIT = 1000;

// Structured website exports use real directories. FramerExport's flattened
// subpages need a separate route manifest: underscores cannot be decoded safely.
export function listMirrorPages(rootDir: string): { pages: string[]; ignoredFlattenedPages: boolean } {
  const root = realpathSync(rootDir);
  const pages = new Set<string>();
  let ignoredFlattenedPages = false;
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (dir === root && entry.name.toLowerCase() === "subpages") ignoredFlattenedPages = true;
        if (entry.name.startsWith(".") || EXCLUDED_DIRS.has(entry.name.toLowerCase())) continue;
        visit(full);
      } else if (entry.isFile() && /\.html$/i.test(entry.name) && entry.name.toLowerCase() !== "404.html") {
        const parts = relative(root, full).split(sep);
        const last = parts.pop()?.replace(/\.html$/i, "") ?? "";
        if (last.toLowerCase() !== "index") parts.push(last);
        const path = parts.length === 0 ? "/" : `/${parts.map(encodeURIComponent).join("/")}`;
        if (pages.has(path)) throw new SenifyError("validation", `Mehrere Dateien für Route ${path}`, { field: "rootDir" });
        pages.add(path);
        if (pages.size > PAGE_LIMIT) throw new SenifyError("validation", "Zu viele Seiten im Export", { field: "rootDir" });
      }
    }
  };
  visit(root);
  if (!pages.has("/")) throw new SenifyError("validation", "Startseite index.html fehlt im Export", { field: "rootDir" });
  return { pages: [...pages].sort((a, b) => a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)), ignoredFlattenedPages };
}

export type PreparedMirrorSite = {
  outputDir: string;
  pages: number;
  blockedPages: string[];
  ignoredFlattenedPages: boolean;
  assets: AssetReport;
  runtimeFreeVerified: false;
};

export async function prepareMirrorSite(input: { rootDir: string; outputDir: string }): Promise<PreparedMirrorSite> {
  const root = realpathSync(input.rootDir);
  const inventory = listMirrorPages(root);
  const parent = realpathSync(dirname(resolve(input.outputDir)));
  const target = resolve(parent, relative(dirname(resolve(input.outputDir)), resolve(input.outputDir)));
  const relation = relative(root, target);
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation))) {
    throw new SenifyError("validation", "Das Ausgabeziel darf nicht im Quellordner liegen", { field: "outputDir" });
  }
  try { mkdirSync(target); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new SenifyError("validation", "Das Ausgabeziel existiert bereits", { field: "outputDir" });
  }
  const docs = inventory.pages.map((path) => captureFixture(root, path, path));
  const blockedPages = docs.flatMap((doc, index) => doc.findings.some((finding) => finding.severity === "block") ? [inventory.pages[index] ?? ""] : []);
  const first = docs[0];
  if (first === undefined) throw new SenifyError("validation", "Keine Seiten im Export", { field: "rootDir" });
  const assets = [...new Map(docs.flatMap((doc) => doc.assets).map((asset) => [asset.url, asset])).values()];
  const fonts = docs.flatMap((doc) => doc.styles.fonts);
  const combined: FramerIrDocument = { ...first, pages: docs.flatMap((doc) => doc.pages), assets, styles: { ...first.styles, fonts }, findings: [] };
  const processed = await importAssets({ document: combined, outDir: join(target, "assets"), mirrorRoot: root, timeoutMs: 8000, allowedRemoteHosts: ["framerusercontent.com", "framerstatic.com"] });
  const assetsByUrl = new Map(processed.document.assets.map((asset) => [asset.url, asset]));
  let offset = 0;
  const pages = docs.map((doc, index) => {
    const start = offset;
    offset += doc.styles.fonts.length;
    const page = processed.document.pages[index];
    return { ...doc, pages: page === undefined ? [] : [page], assets: doc.assets.map((asset) => assetsByUrl.get(asset.url) ?? asset), styles: { ...doc.styles, fonts: processed.document.styles.fonts.slice(start, offset) } };
  });
  writeFileSync(join(target, "site-ir.json"), JSON.stringify({ version: 1, status: "capture-only", inventory, blockedPages, pages, assetReport: processed.report, assetFindings: processed.document.findings }, null, 2), { flag: "wx" });
  return { outputDir: target, pages: pages.length, blockedPages, ignoredFlattenedPages: inventory.ignoredFlattenedPages, assets: processed.report, runtimeFreeVerified: false };
}
