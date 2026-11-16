/* Gemeinsame Helfer: Senify in isolierter In-memory-DB starten, Testseite anlegen, Editor öffnen.
   Nur Messwerkzeug unter .scratch; kein Produktcode. */
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startProgram } from "../../../packages/app/src/index.ts";
import { memoryDb } from "../../../packages/app/test/support.ts";

export const out = resolve(".scratch/editor-umbau/elementor-live/aufnahmen");
mkdirSync(out, { recursive: true });

export async function startSenify() {
  const { chromium } = await import("playwright");
  const database = memoryDb();
  const dataDir = mkdtempSync(join(tmpdir(), "senify-abgleich-"));
  const running = await startProgram({ db: database.db, dataDir, programTokenFile: join(dataDir, "token.json"), enginePort: 0, appPort: 0, openBrowser: false, reviewVisuals: false, rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 } });
  const post = (path: string, body: unknown) => fetch(`${running.dashboardUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const site = (await (await post("/api/sites", { name: "Senify Abgleich" })).json()) as { id: string };
  const page = (await (await post(`/api/sites/${site.id}/pages`, { title: "Senify Abgleich 2026-11-11", path: "/" })).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
  const browser = await chromium.launch({ headless: true });
  const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  tab.on("pageerror", (e) => console.log("pageerror: " + e.message.slice(0, 160)));
  await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}`);
  await tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').waitFor({ timeout: 30000 });
  const shot = async (n: string) => { await tab.screenshot({ path: join(out, n + ".png") }); console.log("shot " + n); };
  const close = async () => { await browser.close(); await running.close(); await database.close(); rmSync(dataDir, { recursive: true, force: true }); };
  return { tab, shot, close, running, site, page, frame: () => tab.locator('.senify-canvas__frame[data-device="desktop"] iframe').contentFrame() };
}
