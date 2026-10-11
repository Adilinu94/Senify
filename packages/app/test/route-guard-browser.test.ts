import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Stale-Render-Guard des Dashboards: eine langsame Antwort der alten Route darf
// die Bühne der neuen Route nicht überschreiben.
describe.skipIf(!browserAvailable)("dashboard route guard", () => {
  it("ignores a slow view that finishes after a newer navigation", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-route-guard-browser-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      tab.setDefaultTimeout(30000);

      // Die Papierkorb-Ansicht hängt an dieser Antwort; sie wird erst freigegeben,
      // wenn die Einstellungen schon stehen.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let trashRequested = false;
      await tab.route(
        (url) => url.pathname === "/api/sites" && url.searchParams.get("trash") === "1",
        async (route) => {
          trashRequested = true;
          await held;
          await route.continue();
        },
      );

      await tab.goto(`${running.dashboardUrl}/#/`, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector("#view h1, #view .empty");

      await tab.evaluate('location.hash = "#/trash"');
      await expect.poll(() => trashRequested).toBe(true);

      await tab.evaluate('location.hash = "#/settings"');
      await tab.waitForFunction('document.getElementById("view")?.textContent?.includes("Einstellungen")');

      release();
      // Die veraltete Antwort ist durch; der Papierkorb darf die Einstellungen nicht ersetzen.
      await tab.waitForTimeout(600);
      const text = (await tab.locator("#view").textContent()) ?? "";
      expect(text).toContain("Einstellungen");
      expect(text).not.toContain("Papierkorb");
      expect(await tab.evaluate("location.hash")).toBe("#/settings");
    } finally {
      await browser.close();
      await running.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
