import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

const author = { kind: "human", id: "programm", label: "Programm" };
const referencePng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);
const designDocument = [
  "# Redesign Canvas Gate",
  "",
  "## Colors",
  "| Token | Value |",
  "|---|---|",
  "| brand | #7c5cff |",
  "| bg | #101018 |",
  "",
  "## Typography",
  "Font family: **Sora, Inter**",
  "",
  "| Style | Size | Weight |",
  "|---|---|---|",
  "| Body | 15px | 400 |",
].join("\n");

describe.skipIf(!browserAvailable)("reference redesign handoff in a real browser", () => {
  it("opens an applied draft with its site theme and keeps editor changes after reload", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-redesign-canvas-"));
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
    const errors: string[] = [];

    try {
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);
      const source = (await (await post("/api/sites", { name: "Redesign-Quelle" })).json()) as {
        id: string;
      };
      const sourcePageResponse = await post(`/api/sites/${source.id}/pages`, {
        title: "Quelle",
        path: "/",
      });
      expect(sourcePageResponse.status).toBe(201);
      const referenceResponse = await post("/api/references/manual", {
        name: "Redesign Canvas",
        image: referencePng.toString("base64"),
        documents: { design: designDocument, guidelines: null, components: null },
        author,
      });
      expect(referenceResponse.status).toBe(201);
      const reference = (await referenceResponse.json()) as { reference: { id: string } };

      const appliedResponse = await post(`/api/sites/${source.id}/redesign`, {
        referenceIds: [reference.reference.id],
        withContent: false,
        idempotencyKey: "redesign-canvas-browser-1",
      });
      expect(appliedResponse.status).toBe(201);
      const applied = (await appliedResponse.json()) as {
        siteId: string;
        pages: {
          pageId: string;
          seeded: boolean;
          draftVersion: number;
          sections: { type: string; nodeId: string }[];
        }[];
      };
      const target = applied.pages.find((page) => page.seeded);
      expect(target?.pageId).toBeTruthy();
      expect(target?.sections.map((section) => section.type)).toEqual([
        "hero",
        "content",
        "cta",
      ]);

      const context = await browser.newContext({ viewport: { width: 2600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      tab.on("response", (response) => {
        if (response.status() < 400 && !response.url().endsWith("/favicon.ico")) return;
        if (!response.url().endsWith("/favicon.ico")) {
          errors.push(`http ${response.status()}: ${response.url()}`);
        }
      });

      const pageUrl = `${running.dashboardUrl}/#/projects/${applied.siteId}/pages/${target?.pageId}`;
      await tab.goto(pageUrl, { waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });
      const desktopFrame = () =>
        tab
          .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
          .contentFrame();
      await desktopFrame().locator('section[data-section="divider"], section[data-section="hero"]').first().waitFor();

      const themeLinkHref = await desktopFrame()
        .locator('link[href*="/api/sites/"][href*="/theme.css"]')
        .getAttribute("href");
      expect(themeLinkHref).toContain(`/api/sites/${applied.siteId}/theme.css`);
      const themeCssResponse = await fetch(`${running.dashboardUrl}${themeLinkHref ?? ""}`);
      expect(themeCssResponse.status).toBe(200);
      const themeCss = await themeCssResponse.text();
      const brandVariable = themeCss.match(/--color-brand-500:\s*([^;]+);/)?.[1]?.trim();
      expect(brandVariable).toBeTruthy();
      const renderedBrandVariable = await desktopFrame().locator("html").evaluate((element) => {
        const target = element as unknown as {
          ownerDocument: { defaultView: { getComputedStyle(node: never): { getPropertyValue(name: string): string } } };
        };
        return target.ownerDocument.defaultView
          .getComputedStyle(element as never)
          .getPropertyValue("--color-brand-500")
          .trim();
      });
      expect(renderedBrandVariable).toBe(brandVariable);

      const heroNodeId = target?.sections.find((section) => section.type === "hero")?.nodeId;
      expect(heroNodeId).toBeTruthy();
      const heroItem = tab.locator(`.senify-explorer__item[data-node="${heroNodeId}"]`);
      await heroItem.waitFor();
      await heroItem.click();
      await expect.poll(async () => tab.locator(".senify-inspector").count()).toBe(1);
      await tab.locator('.senify-inspector__tab[data-tab="style"]').click();
      const background = tab.locator('.senify-inspector__field[data-key="background"] input');
      await background.fill("#123456");
      const versionBeforeSave = target?.draftVersion ?? 0;
      await background.dispatchEvent("change");
      await tab.locator('[data-action="canvas-save"]').click();
      await expect
        .poll(async () => {
          const response = await fetch(`${running.dashboardUrl}/api/pages/${target?.pageId}`);
          const page = (await response.json()) as { draftVersion: number };
          return page.draftVersion;
        })
        .toBeGreaterThan(versionBeforeSave);

      await tab.reload({ waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-canvas", { timeout: 30000 });
      const reloadedHero = desktopFrame().locator('section[data-section="hero"]').first();
      await reloadedHero.waitFor();
      await expect
        .poll(async () =>
          reloadedHero.evaluate((element) => {
            const target = element as unknown as {
              ownerDocument: {
                defaultView: {
                  getComputedStyle(node: unknown): { backgroundColor: string };
                };
              };
            };
            return target.ownerDocument.defaultView.getComputedStyle(element).backgroundColor;
          }),
        )
        .toBe("rgb(18, 52, 86)");

      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
