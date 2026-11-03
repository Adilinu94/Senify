import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
  snapshot: { pages: number; components: number; collections: number; missingStaticPages: string[] } | null;
  assets: AssetReport;
  runtimeFreeVerified: false;
};

export async function prepareMirrorSite(input: { rootDir: string; outputDir: string; unframerSnapshot?: string }): Promise<PreparedMirrorSite> {
  const root = realpathSync(input.rootDir);
  const inventory = listMirrorPages(root);
  const inspected = input.unframerSnapshot === undefined ? null : inspectSnapshot(input.unframerSnapshot, root, inventory.pages);
  const snapshot = inspected?.summary ?? null;
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
  if (inspected !== null) writeFileSync(join(target, "unframer-snapshot.json"), inspected.contents, { flag: "wx" });
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
  writeFileSync(join(target, "site-ir.json"), JSON.stringify({ version: 1, status: "capture-only", inventory, snapshot, blockedPages, pages, assetReport: processed.report, assetFindings: processed.document.findings }, null, 2), { flag: "wx" });
  return { outputDir: target, pages: pages.length, blockedPages, ignoredFlattenedPages: inventory.ignoredFlattenedPages, snapshot, assets: processed.report, runtimeFreeVerified: false };
}

function inspectSnapshot(file: string, root: string, routes: string[]): { contents: string; summary: NonNullable<PreparedMirrorSite["snapshot"]> } {
  let snapshot: { version?: unknown; source?: unknown; pages?: unknown; components?: unknown; cms?: unknown };
  let contents: string;
  try { contents = readFileSync(file, "utf8"); snapshot = JSON.parse(contents) as typeof snapshot; } catch {
    throw new SenifyError("validation", "Unframer-Snapshot ist nicht lesbar", { field: "unframerSnapshot" });
  }
  if (snapshot === null || snapshot.version !== 1 || typeof snapshot.source !== "string" || !Array.isArray(snapshot.pages) || !Array.isArray(snapshot.components) || !Array.isArray(snapshot.cms)) {
    throw new SenifyError("validation", "Unframer-Snapshot hat ein unbekanntes Format", { field: "unframerSnapshot" });
  }
  const html = readFileSync(join(root, "index.html"), "utf8");
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).find((tag) => /\brel\s*=\s*["']canonical["']/i.test(tag));
  const href = canonical === undefined ? undefined : /\bhref\s*=\s*["']([^"']+)["']/i.exec(canonical)?.[1];
  try {
    if (href === undefined || new URL(href).origin !== new URL(snapshot.source).origin) throw new Error("origin mismatch");
  } catch {
    throw new SenifyError("validation", "Export und Unframer-Snapshot lassen sich nicht demselben Projekt zuordnen", { field: "unframerSnapshot" });
  }
  const staticPages = snapshot.pages.flatMap((page: unknown) => {
    if (typeof page !== "object" || page === null || !("name" in page) || typeof page.name !== "string") return [];
    return page.name.startsWith("/") && !page.name.includes(":") ? [page.name] : [];
  });
  return { contents, summary: { pages: snapshot.pages.length, components: snapshot.components.length, collections: snapshot.cms.length, missingStaticPages: staticPages.filter((path: string) => !routes.includes(path)) } };
}
