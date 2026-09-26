import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Der Wiederherstellen-Knopf in den Einstellungen (T12): Sicherung anlegen,
// im Browser zwei Klicks (Wiederherstellen, wirkliche Bestaetigung) und das
// Schutznetz in der Erfolgsmeldung. Uebersprungen, wenn playwright fehlt.

describe.skipIf(!browserAvailable)("restore from the settings view (T12)", () => {
  it("restores a backup with a second confirmation click", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-settings-browser-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(`${running.dashboardUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
      const site = (await (await post("/api/sites", { name: "Restore-Prüfung" })).json()) as {
        id: string;
      };
      expect(site.id).not.toBe("");
      const backup = (await (
        await fetch(`${running.dashboardUrl}/api/backups`, { method: "POST" })
      ).json()) as { backup: { id: string } };
      expect(backup.backup.id).not.toBe("");

      const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(15000);       tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
       await tab.goto(`${running.dashboardUrl}/#/settings`, { waitUntil: "domcontentloaded" });
       await tab.waitForSelector(".backup-list");
       expect(await tab.evaluate(`document.documentElement.dataset.mode`)).toBe("light");
       await tab.locator("#theme-toggle").click();        expect(await tab.evaluate(`document.documentElement.dataset.mode`)).toBe("dark");
        await tab.reload({ waitUntil: "domcontentloaded" });
        await tab.waitForSelector(".backup-list");
        expect(await tab.evaluate(`document.documentElement.dataset.mode`)).toBe("dark");
       await tab.locator("#theme-toggle").click();
       const unlabelled = await tab.evaluate(`(() => [...document.querySelectorAll("input, select, textarea")].filter((field) => {
         const id = field.getAttribute("id");
         const explicit = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]') : null;
         return !explicit && !field.closest("label") && !field.getAttribute("aria-label") && !field.getAttribute("aria-labelledby");
       }).map((field) => field.getAttribute("id")))()`);
       expect(unlabelled).toEqual([]);

      const restore = tab.locator(".backup-list button", { hasText: "Wiederherstellen" }).first();
      await restore.click();
      await expect
        .poll(async () =>
          tab.locator('.backup-list button:has-text("Wirklich wiederherstellen?")').count(),
        )
        .toBe(1);
      await tab.locator('.backup-list button:has-text("Wirklich wiederherstellen?")').click();
      await expect
        .poll(async () => tab.locator(".toast").first().textContent())
        .toContain("Wiederhergestellt — Schutznetz:");
      expect(await tab.locator(".toast", { hasText: "fehlgeschlagen" }).count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
