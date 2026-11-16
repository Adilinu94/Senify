import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

describe.skipIf(!browserAvailable)("Klassen-History nach Neuladen", () => {
  it("erhält die History einer neu angelegten Klasse nach dem Speichern", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-class-history-"));
    const running = await startProgram({ db: database.db, dataDir, programTokenFile: join(dataDir, "token.json"), enginePort: 0, appPort: 0, openBrowser: false, reviewVisuals: false, rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 } });
    const browser = await chromium.launch({ headless: true });
    try {
      const post = (path: string, body: unknown) => fetch(`${running.dashboardUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const site = await (await post("/api/sites", { name: "Klassen-History" })).json() as { id: string };
      const page = await (await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })).json() as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const seed = await post(`/api/pages/${page.id}/mutations`, { baseDraftVersion: page.draftVersion, author: { kind: "human", id: "programm", label: "Programm" }, mutations: [{ op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { id: "frame00001", type: "frame", props: { width: "200px", height: "80px" } } }] });
      expect(seed.status).toBe(200);
      const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
      const frame = tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame();
      await frame.locator('[data-node-id="frame00001"]').click({ timeout: 30000, position: { x: 6, y: 6 } });
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      await tab.getByRole("textbox", { name: "Name der neuen Klasse" }).fill("vergleich");
      await tab.getByRole("button", { name: "Anlegen", exact: true }).click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      await tab.reload();
      await tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').waitFor({ timeout: 30000 });
      await expect.poll(async () => tab.locator('.senify-canvas__button[data-action="undo"]').isEnabled(), { timeout: 20000 }).toBe(true);
      await tab.getByRole("tab", { name: "Variablen", exact: true }).click();
      expect(await tab.locator('[data-variable-status]').textContent()).not.toContain("Der gespeicherte Verlauf passt nicht");
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      const rules = async () => (await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/style-rules`)).json() as { rules: { name: string }[] }).rules.map((rule) => rule.name);
      expect(await rules()).not.toContain("vergleich");
      await tab.locator('.senify-canvas__button[data-action="redo"]').click();
      await expect.poll(async () => tab.locator('[data-role="canvas-status"]').textContent(), { timeout: 20000 }).toBe("Gespeichert");
      expect(await rules()).toContain("vergleich");
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
