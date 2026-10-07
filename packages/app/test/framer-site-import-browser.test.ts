import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// The whole-site flow of the import dialog: the analysis lists the other pages
// the imported page links to, the person ticks them, and each one is analysed
// and written under its own path; a path that already holds a page is skipped
// unless replacing it is confirmed.

const doc = (title: string, body: string): string =>
  `<!doctype html><html lang="de"><head><title>${title}</title></head><body><div id="main" data-framer-hydrate-v2><main><h1>${title}</h1>${body}</main></div></body></html>`;

describe.skipIf(!browserAvailable)("Framer import dialog: whole site", () => {
  it("importiert die verlinkten Seiten einzeln und überspringt vorhandene", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-framer-site-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
      rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
    });
    const mirror = join(dataDir, "mirror");
    mkdirSync(join(mirror, "kontakt"), { recursive: true });
    writeFileSync(join(mirror, "index.html"), doc("Startseite", '<p><a href="./about">Über uns</a> <a href="./kontakt">Kontakt</a> <a href="./logo.png">Logo</a></p>'), "utf8");
    writeFileSync(join(mirror, "about.html"), doc("Über uns", '<p><a href="./">Start</a></p>'), "utf8");
    writeFileSync(join(mirror, "kontakt", "index.html"), doc("Kontakt", '<p><a href="../about">Über uns</a></p>'), "utf8");
    const browser = await chromium.launch({ headless: true });
    const pageErrors: string[] = [];
    try {
      const post = (path: string, body: unknown): Promise<Response> =>
        fetch(`${running.dashboardUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const site = (await (await post("/api/sites", { name: "Import Site" })).json()) as { id: string };
      const start = (await (await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })).json()) as { id: string };
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.on("pageerror", (error) => pageErrors.push(error.message));
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${start.id}`, { waitUntil: "domcontentloaded" });

      const openDialog = async (): Promise<void> => {
        await tab.waitForSelector('[data-action="canvas-overflow"]', { timeout: 30000 });
        // The overflow menu can still be open from the last round: clicking its
        // button then would close it.
        // The overflow menu may or may not still be open from the last round
        // (and re-renders with the editor): open it until the entry shows.
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if (await tab.locator('[data-action="framer-import-open"]').isVisible()) break;
          await tab.locator('[data-action="canvas-overflow"]').dispatchEvent("click");
          await tab.waitForTimeout(400);
        }
        await tab.waitForSelector('[data-action="framer-import-open"]', { state: "visible", timeout: 10000 });
        // The editor of a freshly imported page keeps re-rendering its toolbar,
        // so the button never counts as "stable"; the handler is what matters.
        await tab.locator('[data-action="framer-import-open"]').dispatchEvent("click");
        await tab.waitForSelector('[data-role="framer-import-dialog"]', { timeout: 10000 });
        await tab.selectOption('[data-role="framer-source-mode"]', "mirror");
        await tab.fill('[data-role="framer-source-input"]', mirror);
        await tab.fill('input[placeholder="/landingpage"]', "/start-import");
        await tab.locator('[data-role="framer-import-dialog"] button[type="submit"]').click();
        await tab.waitForSelector('[data-role="framer-import-report"] .framer-report', { timeout: 30000 });
      };
      const pagePaths = async (): Promise<string[]> => {
        const list = (await (await fetch(`${running.dashboardUrl}/api/sites/${site.id}/pages`)).json()) as { path: string }[] | { pages: { path: string }[] };
        return (Array.isArray(list) ? list : list.pages).map((entry) => entry.path).sort();
      };

      // First run: the other pages are offered, the asset link is not.
      await openDialog();
      const offered = await tab.locator('[data-role="framer-site-page"]').evaluateAll((inputs) => inputs.map((input) => (input as { value: string }).value));
      expect(offered).toEqual(["/about", "/kontakt"]);
      await tab.locator('[data-role="framer-site-all"]').check();
      await tab.locator('[data-action="framer-import-apply"]').click();
      await tab.waitForSelector('[data-role="framer-site-results"]', { timeout: 60000 });
      const results = tab.locator('[data-role="framer-site-results"] li');
      const resultRows = async (): Promise<string[]> => {
        const rows: string[] = [];
        for (let index = 0; index < (await results.count()); index += 1) {
          rows.push(`${await results.nth(index).locator("strong").textContent()}|${await results.nth(index).getAttribute("data-state")}`);
        }
        return rows;
      };
      expect(await resultRows()).toEqual(["/about|importiert", "/kontakt|importiert"]);
      expect(await pagePaths()).toEqual(["/", "/about", "/kontakt", "/start-import"]);
      await tab.locator('[data-action="framer-import-close"]').click();
      await expect.poll(async () => tab.locator('[data-role="framer-import-dialog"]').count(), { timeout: 20000 }).toBe(0);

      // Second run: every path is taken now, so the pages are skipped.
      await openDialog();
      await tab.locator('[data-role="framer-confirm-replace"]').check();
      await tab.locator('[data-role="framer-site-all"]').check();
      await tab.locator('[data-action="framer-import-apply"]').click();
      await tab.waitForSelector('[data-role="framer-site-results"]', { timeout: 60000 });
      expect(await resultRows()).toEqual(["/about|übersprungen", "/kontakt|übersprungen"]);
      expect(await pagePaths()).toEqual(["/", "/about", "/kontakt", "/start-import"]);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 240_000);
});
