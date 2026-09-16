import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import type { ReviewVisualDriver } from "@senify/engine";
import { browserAvailable, memoryDb } from "./support.ts";

// Die Review-Details im Browser (T07): der Submit läuft mit einem
// Aufnahme-Doppel durch die echte Engine, die Prüfen-Ansicht zeigt danach
// Struktur-Diff, Vorher/Nachher, das Diff-Bild und die Motion-Aufnahme.
// Übersprungen, wenn playwright/Chromium fehlt.

// Ein echtes, dekodierbares 1x1-PNG: der Browser misst naturalWidth daran.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const WEBM = Buffer.from("1a45dfa3a3", "hex");
const AUTHOR = { kind: "human", id: "operator", label: "Operator" };

const driver: ReviewVisualDriver = async (input) => {
  const page = input.pages[0];
  if (page === undefined) throw new Error("kein Ziel");
  const shot = (role: "before" | "after") => ({
    pageId: page.pageId,
    path: page.path,
    role,
    breakpoint: "desktop",
    width: 1440,
    height: 900,
    bytes: PNG,
  });
  return {
    screenshots: [shot("after"), shot("before")],
    diffs: [
      {
        pageId: page.pageId,
        breakpoint: "desktop",
        changedPixels: 4,
        ratio: 0.02,
        bounds: { left: 0, top: 0, right: 1, bottom: 1 },
        bytes: PNG,
      },
    ],
    ...(input.recordMotion ? { video: { bytes: WEBM, durationMs: 3840 } } : {}),
  };
};

describe.skipIf(!browserAvailable)("review visuals in the dashboard (T07)", () => {
  it("shows screenshots, diff and the motion video in the review detail", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-review-browser-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      reviewVisuals: driver,
    });
    const base = running.dashboardUrl;
    const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      expect(response.status, `${path}: ${text}`).toBeLessThan(300);
      return JSON.parse(text) as Record<string, unknown>;
    };
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      const site = (await post("/api/sites", { name: "Review-Prüfung" })) as { id: string };
      const page = (await post(`/api/sites/${site.id}/pages`, {
        title: "Start",
        path: "/",
      })) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const inserted = (await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author: AUTHOR,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { id: "hero-1", type: "hero", props: { headline: "Vorher" } },
          },
        ],
      })) as { newDraftVersion: number };
      await post(`/api/sites/${site.id}/releases`, { author: AUTHOR, note: "Basis" });
      const changed = (await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: inserted.newDraftVersion,
        author: AUTHOR,
        mutations: [
          { op: "updateNodeProps", id: "hero-1", patch: { headline: "Nachher" } },
          { op: "setMotion", id: "hero-1", spec: { preset: "fade-up" } },
        ],
      })) as { newDraftVersion: number };
      expect(changed.newDraftVersion).toBeGreaterThan(inserted.newDraftVersion);
      const review = (await post(`/api/sites/${site.id}/reviews`, {
        author: AUTHOR,
        note: "Bitte prüfen",
      })) as { review: { id: string; visuals: { assets: unknown[]; video?: unknown } | null } };
      expect(review.review.visuals?.assets).toHaveLength(2);
      expect(review.review.visuals?.video).toBeDefined();

      const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(15000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      await tab.goto(`${base}/#/projects/${site.id}/review`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".panel button:has-text('Details')");

      await tab.locator(".panel button", { hasText: "Details" }).first().click();
      await tab.waitForSelector(".review-visuals");

      // Struktur-Diff in Klartext, Bewegung als Feld benannt.
      const diffText = (await tab.locator(".review-block").first().textContent()) ?? "";
      expect(diffText).toContain("/");
      expect(diffText).toContain("Bewegung");

      // Vorher, Nachher und das Diff-Bild.
      await expect
        .poll(async () => tab.locator(".review-visuals .review-figure img").count())
        .toBe(3);
      const captions = await tab
        .locator(".review-visuals .review-figure figcaption")
        .allTextContents();
      expect(captions.some((text) => text.startsWith("Vorher"))).toBe(true);
      expect(captions.some((text) => text.startsWith("Nachher"))).toBe(true);
      expect(captions.some((text) => text.startsWith("Diff ·"))).toBe(true);

      // Die Bilder laden wirklich (1x1-PNG) und die Motion-Aufnahme hängt dran.
      // Lazy Loading schiebt die Aufnahmen erst in den Blick, dann messen.
      await tab.locator(".review-visuals .review-figure img").first().scrollIntoViewIfNeeded();
      await expect
        .poll(async () =>
          tab.locator(".review-visuals .review-figure img").first().evaluate(
            // The repo compiles without the DOM lib: structural access.
            (img) => (img as unknown as { naturalWidth: number }).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
      const videoSrc = await tab
        .locator(".review-video video")
        .first()
        .getAttribute("src");
      expect(videoSrc).toContain(`/api/reviews/${review.review.id}/visuals/`);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
