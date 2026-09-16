import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import type { ReferenceDeps } from "@senify/engine";
import { browserAvailable, memoryDb } from "./support.ts";

// Motion-Aufnahme der Live-Analyse im Referenz-Detail (T14): Die Engine legt
// das .webm als Snapshot ab, das Fenster zeigt es im aufklappbaren Bereich.
// Übersprungen, wenn playwright/Chromium fehlt.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const WEBM = Buffer.from("1a45dfa3a3", "hex");
const author = { kind: "human", id: "programm", label: "Programm" };

const deps: ReferenceDeps = {
  capture: async () => ({
    markup: "<html><body><h1>Motion Studio</h1></body></html>",
    screenshots: [
      { breakpoint: "1440", kind: "fullpage", bytes: PNG, width: 1440, height: 900 },
    ],
    video: { bytes: WEBM, durationMs: 3840 },
  }),
};

describe.skipIf(!browserAvailable)("reference motion video (T14)", () => {
  it("shows the recorded scroll pass in the detail window", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-refs-motion-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      referenceDeps: deps,
    });
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      const created = await fetch(`${running.dashboardUrl}/api/references`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://motion-studio.test", wait: true, author }),
      });
      const text = await created.text();
      expect(created.status, text).toBe(201);
      const reference = (JSON.parse(text) as {
        reference: { id: string; snapshots: { kind: string; durationMs?: number }[] };
      }).reference;
      const motion = reference.snapshots.find((shot) => shot.kind === "motion");
      expect(motion?.durationMs).toBe(3840);

      const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(15000);
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      await tab.goto(`${running.dashboardUrl}/#/references`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".refs-card");
      await tab.locator(".refs-card-art").first().click();
      await tab.waitForSelector(".refs-inspector[open]");

      const fold = tab.locator(".refs-fold", { hasText: "Motion-Aufnahme" });
      await expect.poll(async () => fold.count()).toBe(1);
      expect(await fold.locator("summary").textContent()).toContain("3.8 s");
      const videoSrc = await fold.locator("video").first().getAttribute("src");
      expect(videoSrc).toContain(
        `/api/references/${reference.id}/snapshots/`,
      );
      const served = await fetch(`${running.dashboardUrl}${videoSrc}`);
      expect(served.status).toBe(200);
      expect(served.headers.get("content-type")).toBe("video/webm");
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
