import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// A mirror made by a scraper writes its own links as absolute URLs. Without the
// address of the original site the import cannot tell them from links to other
// sites, so the analysis finds no other pages. The dialog offers that address
// for a local mirror and sends it with every request of the import.

const ORIGIN = "https://original.test";

const doc = (title: string, body: string): string =>
  `<!doctype html><html lang="de"><head><title>${title}</title></head><body><div id="main" data-framer-hydrate-v2><main><h1>${title}</h1>${body}</main></div></body></html>`;

describe.skipIf(!browserAvailable)("Framer import dialog: mirror with the original address", () => {
  it("findet mit der Basis-URL die Seiten hinter absoluten Links und sendet sie mit", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-framer-base-url-"));
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
    mkdirSync(mirror, { recursive: true });
    writeFileSync(join(mirror, "index.html"), doc("Startseite", `<p><a href="${ORIGIN}/about">Über uns</a> <a href="https://other.test/x">Extern</a></p>`), "utf8");
    writeFileSync(join(mirror, "about.html"), doc("Über uns", `<p><a href="${ORIGIN}/">Start</a></p>`), "utf8");
    const browser = await chromium.launch({ headless: true });
    const pageErrors: string[] = [];
    const sources: { baseUrl?: string; rootDir?: string; page?: string }[] = [];
    try {
      const post = (path: string, body: unknown): Promise<Response> =>
        fetch(`${running.dashboardUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const site = (await (await post("/api/sites", { name: "Import Site" })).json()) as { id: string };
      const start = (await (await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })).json()) as { id: string };
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.on("pageerror", (error) => pageErrors.push(error.message));
      tab.on("request", (request) => {
        if (request.method() !== "POST" || !request.url().endsWith("/imports/framer")) return;
        sources.push((request.postDataJSON() as { source: { baseUrl?: string; rootDir?: string; page?: string } }).source);
      });
      await tab.goto(`${running.dashboardUrl}/#/projects/${site.id}/pages/${start.id}`, { waitUntil: "domcontentloaded" });

      const openDialog = async (baseUrl: string | null): Promise<void> => {
        await tab.waitForSelector('[data-action="canvas-overflow"]', { timeout: 30000 });
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if (await tab.locator('[data-action="framer-import-open"]').isVisible()) break;
          await tab.locator('[data-action="canvas-overflow"]').dispatchEvent("click");
          await tab.waitForTimeout(400);
        }
        await tab.waitForSelector('[data-action="framer-import-open"]', { state: "visible", timeout: 10000 });
        await tab.locator('[data-action="framer-import-open"]').dispatchEvent("click");
        await tab.waitForSelector('[data-role="framer-import-dialog"]', { timeout: 10000 });
        await tab.selectOption('[data-role="framer-source-mode"]', "mirror");
        await tab.fill('[data-role="framer-source-input"]', mirror);
        if (baseUrl !== null) await tab.fill('[data-role="framer-base-url"]', baseUrl);
        await tab.fill('input[placeholder="/landingpage"]', "/start-import");
        await tab.locator('[data-role="framer-import-dialog"] button[type="submit"]').click();
        await tab.waitForSelector('[data-role="framer-import-report"] .framer-report', { timeout: 30000 });
      };
      const closeDialog = async (): Promise<void> => {
        await tab.keyboard.press("Escape");
        await expect.poll(async () => tab.locator('[data-role="framer-import-dialog"]').count(), { timeout: 20000 }).toBe(0);
      };

      // Without the address the absolute link counts as another site's.
      await openDialog(null);
      expect(await tab.locator('[data-role="framer-site-page"]').count()).toBe(0);
      expect(sources.at(-1)).toEqual({ rootDir: mirror });
      await closeDialog();

      // With it, the page behind the link is offered; the real other site is not.
      sources.length = 0;
      await openDialog(ORIGIN);
      const offered = await tab.locator('[data-role="framer-site-page"]').evaluateAll((inputs) => inputs.map((input) => (input as { value: string }).value));
      expect(offered).toEqual(["/about"]);
      expect(sources.at(-1)).toEqual({ rootDir: mirror, baseUrl: ORIGIN });

      // The page itself is analysed and written with the same address.
      await tab.locator('[data-role="framer-site-all"]').check();
      await tab.locator('[data-action="framer-import-apply"]').click();
      await tab.waitForSelector('[data-role="framer-site-results"]', { timeout: 60000 });
      expect(await tab.locator('[data-role="framer-site-results"] li').first().getAttribute("data-state")).toBe("importiert");
      const aboutRequests = sources.filter((source) => source.page === "/about");
      expect(aboutRequests.length).toBeGreaterThanOrEqual(2);
      expect(aboutRequests.every((source) => source.baseUrl === ORIGIN)).toBe(true);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 240_000);
});
