import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Befund des Elementor-Abgleichs vom 11.11.2026: Bei 768 und 390 px Fensterbreite
// war die Seite 862 px breit, weil die Kopfleiste des Editors nicht umbrach. Die
// Leiste bricht jetzt um (der Editor stapelt unter 1100 px ohnehin), alle Knoepfe
// bleiben im Fenster erreichbar und die Seite scrollt nicht seitwaerts.

describe.skipIf(!browserAvailable)("editor at narrow window widths", () => {
  it("keeps the top bar inside the window without sideways scrolling", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-schmal-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const browser = await chromium.launch({ headless: true });
    try {
      const site = (await (await post("/api/sites", { name: "Schmal" })).json()) as { id: string };
      const page = (await (await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })).json()) as {
        id: string;
      };
      const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
      await tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').waitFor({ timeout: 30000 });

      for (const width of [768, 390]) {
        await tab.setViewportSize({ width, height: 900 });
        await expect
          .poll(() => tab.evaluate("document.documentElement.scrollWidth"), { message: `Seitenbreite bei ${width} px` })
          .toBeLessThanOrEqual(width);
        // Jeder Knopf der Kopfleiste liegt im Fenster, auch "Mehr" ganz rechts.
        const rights = (await tab.evaluate(
          `[...document.querySelectorAll("body.is-editor .view.editor-view > .toolbar button")]
             .filter((b) => b.getBoundingClientRect().width > 0)
             .map((b) => Math.round(b.getBoundingClientRect().right))`,
        )) as number[];
        expect(rights.length).toBeGreaterThan(0);
        expect(Math.max(...rights), `rechtester Knopf bei ${width} px`).toBeLessThanOrEqual(width);
      }

      // Die breite Ansicht bleibt einzeilig.
      await tab.setViewportSize({ width: 1440, height: 900 });
      const height = (await tab.evaluate(
        `document.querySelector("body.is-editor .view.editor-view > .toolbar").getBoundingClientRect().height`,
      )) as number;
      expect(height).toBeLessThan(64);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
