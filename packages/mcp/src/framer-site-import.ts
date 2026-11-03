import { listMirrorPages } from "@senify/framer-import";
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

// The engine commits one page per transaction. This coordinator never treats
// partial completion as an atomic site import and never replaces a draft.
export async function importFramerSite(
  client: EngineClient,
  input: { siteId: string; rootDir: string; write: boolean; assetCacheDir?: string },
): Promise<{
  status: "analyzed" | "blocked" | "partial" | "imported";
  pages: { path: string; state: string; pageId?: string | null; reason?: string; warnings?: string[] }[];
  ignoredFlattenedPages: boolean;
  runtimeFreeVerified: false;
}> {
  const inventory = listMirrorPages(input.rootDir);
  const pages: { path: string; state: string; pageId?: string | null; reason?: string; warnings?: string[] }[] = [];
  const hashes = new Map<string, string>();
  let blocked = input.write && inventory.ignoredFlattenedPages;
  for (const path of inventory.pages) {
    try {
      const answer = await client.request<PageAnswer>("POST", `/api/sites/${input.siteId}/imports/framer`, {
        source: { rootDir: input.rootDir, sourcePagePath: path }, pagePath: path, mode: "fidelity", assets: "skip", fonts: "skip", write: false,
      });
      const finding = answer.report.findings.find((entry) => entry.severity === "block");
      const reason = finding?.message ?? (input.write && answer.report.existingPage !== undefined ? "Zielseite existiert bereits" : undefined);
      const warnings = answer.report.findings.filter((entry) => entry.severity === "warn").map((entry) => entry.message);
      if ((answer.report.motion?.measured ?? 0) > 0) warnings.push("Animationen wurden erfasst; ihre vollständige Wiedergabe und Auslöser sind nicht für alle Zustände geprüft.");
      pages.push({ path, state: reason === undefined ? "analyzed" : "blocked", ...(reason === undefined ? {} : { reason }), ...(warnings.length === 0 ? {} : { warnings }) });
      if (reason !== undefined) blocked = true;
      hashes.set(path, answer.report.irHash);
    } catch (error) {
      pages.push({ path, state: "blocked", reason: error instanceof Error ? error.message : "Analyse fehlgeschlagen" });
      blocked = true;
    }
  }
  if (blocked) return { status: "blocked", pages, ignoredFlattenedPages: inventory.ignoredFlattenedPages, runtimeFreeVerified: false };
  if (!input.write) return { status: "analyzed", pages, ignoredFlattenedPages: inventory.ignoredFlattenedPages, runtimeFreeVerified: false };
  for (const page of pages) {
    try {
      const answer = await client.request<PageAnswer>("POST", `/api/sites/${input.siteId}/imports/framer`, {
        source: { rootDir: input.rootDir, sourcePagePath: page.path, ...(input.assetCacheDir === undefined ? {} : { assetCacheDir: input.assetCacheDir }) }, pagePath: page.path, mode: "fidelity", write: true, createOnly: true, expectedIrHash: hashes.get(page.path),
      });
      page.pageId = answer.report.pageId;
      if (answer.job.status !== "succeeded" || answer.report.assets.failed > 0) {
        page.state = "partial";
        page.reason = "Import oder Medienübernahme unvollständig";
        return { status: "partial", pages, ignoredFlattenedPages: inventory.ignoredFlattenedPages, runtimeFreeVerified: false };
      }
      page.state = "imported";
    } catch (error) {
      page.state = "failed";
      page.reason = error instanceof Error ? error.message : "Import fehlgeschlagen";
      return { status: "partial", pages, ignoredFlattenedPages: inventory.ignoredFlattenedPages, runtimeFreeVerified: false };
    }
  }
  return { status: "imported", pages, ignoredFlattenedPages: inventory.ignoredFlattenedPages, runtimeFreeVerified: false };
}
