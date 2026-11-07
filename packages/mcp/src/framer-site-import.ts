import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fetchSitemapRoutes,
  importRoutes,
  listMirrorPages,
  type ImportRoute,
} from "@senify/framer-import";
import type { EngineClient } from "./client.ts";

type PageAnswer = {
  job: { status: string };
  report: {
    irHash: string;
    pageId: string | null;
    existingPage?: { pageId: string };
    findings: { severity: string; message: string }[];
    assets: { failed: number };
    motion?: { measured: number; mappedToPreset: number; documented: number };
  };
};

// FramerExport writes its source URL into the report. Reusing it keeps the
// multi-page sitemap manifest working without a second CLI argument.
function reportedSource(rootDir: string): string | undefined {
  try {
    const report = JSON.parse(readFileSync(join(rootDir, "export-report.json"), "utf8")) as { source?: unknown };
    if (typeof report.source !== "string") return undefined;
    const url = new URL(report.source);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

// The engine commits one page per transaction. This coordinator never treats
// partial completion as an atomic site import and never replaces a draft.
// Flattened Framer subpages are expanded from the sitemap through the live
// browser capture; structured exports keep using their local directory pages.
export async function importFramerSite(
  client: EngineClient,
  input: {
    siteId: string;
    rootDir: string;
    write: boolean;
    assetCacheDir?: string;
    sourceUrl?: string;
    applyTheme?: boolean;
  },
): Promise<{
  status: "analyzed" | "blocked" | "partial" | "imported";
  pages: { path: string; state: string; pageId?: string | null; reason?: string; warnings?: string[] }[];
  ignoredFlattenedPages: boolean;
  routeSource: "sitemap" | "mirror";
  runtimeFreeVerified: false;
}> {
  const inventory = listMirrorPages(input.rootDir);
  let routes: ImportRoute[] | undefined;
  if (inventory.ignoredFlattenedPages) {
    const sourceUrl = input.sourceUrl ?? reportedSource(input.rootDir);
    if (sourceUrl !== undefined) {
      try {
        routes = importRoutes(input.rootDir, await fetchSitemapRoutes(sourceUrl));
      } catch {
        routes = undefined;
      }
    }
  }
  const routeSource = routes === undefined ? "mirror" : "sitemap";
  const ignoredFlattenedPages = routes === undefined && inventory.ignoredFlattenedPages;
  const pagePaths = routes?.map((route) => route.pagePath) ?? inventory.pages;
  const pages: { path: string; state: string; pageId?: string | null; reason?: string; warnings?: string[] }[] = [];
  const hashes = new Map<string, string>();
  let blocked = input.write && ignoredFlattenedPages;
  for (const pagePath of pagePaths) {
    const route = routes?.find((entry) => entry.pagePath === pagePath);
    try {
      const answer = await client.request<PageAnswer>("POST", `/api/sites/${input.siteId}/imports/framer`, {
        source: route?.source ?? { rootDir: input.rootDir, sourcePagePath: pagePath },
        pagePath,
        ...(route?.browser === true ? { browser: true } : {}),
        mode: "fidelity",
        assets: "skip",
        fonts: "skip",
        write: false,
      });
      const finding = answer.report.findings.find((entry) => entry.severity === "block");
      const reason = finding?.message ?? (input.write && answer.report.existingPage !== undefined ? "Zielseite existiert bereits" : undefined);
      const warnings = answer.report.findings.filter((entry) => entry.severity === "warn").map((entry) => entry.message);
      if ((answer.report.motion?.measured ?? 0) > 0) warnings.push("Animationen wurden erfasst; ihre vollständige Wiedergabe und Auslöser sind nicht für alle Zustände geprüft.");
      pages.push({ path: pagePath, state: reason === undefined ? "analyzed" : "blocked", ...(reason === undefined ? {} : { reason }), ...(warnings.length === 0 ? {} : { warnings }) });
      if (reason !== undefined) blocked = true;
      hashes.set(pagePath, answer.report.irHash);
    } catch (error) {
      pages.push({ path: pagePath, state: "blocked", reason: error instanceof Error ? error.message : "Analyse fehlgeschlagen" });
      blocked = true;
    }
  }
  if (blocked) return { status: "blocked", pages, ignoredFlattenedPages, routeSource, runtimeFreeVerified: false };
  if (!input.write) return { status: "analyzed", pages, ignoredFlattenedPages, routeSource, runtimeFreeVerified: false };
  // The theme patch is site-wide. Apply it with the first written page only,
  // so a multi-page import does not create one theme version per page.
  let themeApplied = false;
  for (const page of pages) {
    const route = routes?.find((entry) => entry.pagePath === page.path);
    const base = route?.source ?? { rootDir: input.rootDir, sourcePagePath: page.path };
    const source = input.assetCacheDir === undefined || "url" in base ? base : { ...base, assetCacheDir: input.assetCacheDir };
    try {
      const answer = await client.request<PageAnswer>("POST", `/api/sites/${input.siteId}/imports/framer`, {
        source,
        pagePath: page.path,
        ...(route?.browser === true ? { browser: true } : {}),
        mode: "fidelity",
        write: true,
        createOnly: true,
        applyTheme: input.applyTheme === true && !themeApplied,
        // Browser captures depend on hydration timing and the live page. The
        // dry-run hash is a preview, not a stable contract for a second render.
        ...(route?.browser === true ? {} : { expectedIrHash: hashes.get(page.path) }),
      });
      page.pageId = answer.report.pageId;
      if (answer.job.status !== "succeeded" || answer.report.assets.failed > 0) {
        page.state = "partial";
        page.reason = "Import oder Medienübernahme unvollständig";
        return { status: "partial", pages, ignoredFlattenedPages, routeSource, runtimeFreeVerified: false };
      }
      page.state = "imported";
      if (input.applyTheme === true) themeApplied = true;
    } catch (error) {
      page.state = "failed";
      page.reason = error instanceof Error ? error.message : "Import fehlgeschlagen";
      return { status: "partial", pages, ignoredFlattenedPages, routeSource, runtimeFreeVerified: false };
    }
  }
  return { status: "imported", pages, ignoredFlattenedPages, routeSource, runtimeFreeVerified: false };
}
