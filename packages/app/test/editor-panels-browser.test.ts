import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Aufgabe 29 ("Panelbreiten und Ziehen") in the running editor, not just the
// preview: the Inspektor (properties, left) and the Explorer (layer list,
// beside it) are resizable through a separator at the panel edge. This run
// drives the edge with the pointer, the keyboard and a double click in a real
// browser and proves the widths hold, never jump and survive a reload — without
// console errors or failed requests. Skipped when Playwright is missing.

const author = { kind: "human", id: "programm", label: "Programm" };

type PanelMessung = {
  breiten: string | null;
  inspector: number;
  explorer: number;
  ueberlaufPx: number;
};

// The measurement runs as a string in the browser (the project has no DOM lib
// in its tsconfig, the same solution the other browser tests use).
const MESS_QUELLE = `(() => {
  const main = document.querySelector(".senify-editor__main");
  const width = (selector) =>
    Math.round(document.querySelector(selector)?.getBoundingClientRect().width ?? 0);
  return {
    breiten: main?.getAttribute("data-breiten") ?? null,
    inspector: width(".senify-editor__panels"),
    explorer: width(".senify-editor__rail"),
    ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`;

describe.skipIf(!browserAvailable)("editor panel edges in a real browser", () => {
  it("resizes the inspector and the explorer, without jumping, and remembers it", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-editor-panels-"));
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
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    try {
      expect((await fetch(`${running.dashboardUrl}/editor.js`)).status).toBe(200);
      const site = (await (await post("/api/sites", { name: "Panelbreiten" })).json()) as {
        id: string;
      };
      const page = (await (
        await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
      ).json()) as { id: string; draftVersion: number; draft: { rootNodeId: string } };
      const applied = await post(`/api/pages/${page.id}/mutations`, {
        baseDraftVersion: page.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { type: "hero", props: { headline: "Panel-Prüfung" } },
          },
        ],
      });
      expect(applied.status).toBe(200);

      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      const isFavicon = (url: string): boolean => url.endsWith("/favicon.ico");
      tab.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
      tab.on("requestfailed", (request) => {
        if (isFavicon(request.url())) return;
        failedRequests.push(`failed: ${request.url()}`);
      });
      tab.on("response", (response) => {
        if (response.status() < 400 || isFavicon(response.url())) return;
        failedRequests.push(`http ${response.status()}: ${response.url()}`);
      });

      const url = `${running.dashboardUrl}/#/projects/${site.id}/pages/${page.id}?view=editor`;
      let mounted = false;
      for (let attempt = 0; attempt < 3 && !mounted; attempt += 1) {
        await tab.goto(url, { waitUntil: "domcontentloaded" });
        mounted = await tab
          .waitForSelector(".senify-editor", { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
      }
      expect(mounted).toBe(true);

      const messen = async (): Promise<PanelMessung> =>
        (await tab.evaluate(MESS_QUELLE)) as PanelMessung;

      // Two visible edges, the defaults from tokens.ts (320 / 264).
      const edges = tab.locator(".senify-editor__split");
      expect(await edges.count()).toBe(2);
      expect(await tab.locator('.senify-editor__split[data-panel="inspector"]').isVisible()).toBe(true);
      expect(await tab.locator('.senify-editor__split[data-panel="explorer"]').isVisible()).toBe(true);
      expect((await messen()).breiten).toBe("320x264");
      expect((await messen()).inspector).toBe(320);
      expect((await messen()).explorer).toBe(264);

      // Drag the inspector edge: the width follows the pointer exactly.
      const inspector = tab.locator('.senify-editor__split[data-panel="inspector"]');
      const box = await inspector.boundingBox();
      expect(box).not.toBeNull();
      const startX = (box?.x ?? 0) + (box?.width ?? 0) / 2;
      const y = (box?.y ?? 0) + 200;
      await tab.mouse.move(startX, y);
      await tab.mouse.down();
      await tab.mouse.move(startX + 40, y, { steps: 6 });
      const bei40 = await messen();
      expect(bei40.breiten).toBe("360x264");
      expect(bei40.inspector).toBe(360);
      expect(bei40.ueberlaufPx).toBe(0);
      // The edge stays under the pointer (no jump): width == moved distance.
      expect(Math.abs(bei40.inspector - 320 - 40)).toBeLessThanOrEqual(1);
      await tab.mouse.move(startX + 600, y, { steps: 8 });
      await tab.mouse.up();
      expect((await messen()).breiten).toBe("420x264"); // upper bound (Aufgabe 29)

      // Double click sets the default of the panel the edge belongs to.
      await inspector.dblclick();
      expect((await messen()).breiten).toBe("320x264");

      // Keyboard: arrow right widens by 8px, without the pointer.
      await inspector.focus();
      await tab.keyboard.press("ArrowRight");
      expect((await messen()).breiten).toBe("328x264");

      // The explorer edge: 200 to 360, drag +30 then back to the default.
      const explorer = tab.locator('.senify-editor__split[data-panel="explorer"]');
      const explorerBox = await explorer.boundingBox();
      const explorerX = (explorerBox?.x ?? 0) + (explorerBox?.width ?? 0) / 2;
      await tab.mouse.move(explorerX, y);
      await tab.mouse.down();
      await tab.mouse.move(explorerX + 30, y, { steps: 6 });
      await tab.mouse.up();
      const explorerBreit = await messen();
      expect(explorerBreit.breiten).toBe("328x294");
      expect(explorerBreit.explorer).toBe(294);
      await explorer.dblclick();
      expect((await messen()).breiten).toBe("328x264");

      // The widths survive a reload.
      await tab.reload({ waitUntil: "domcontentloaded" });
      await tab.waitForSelector(".senify-editor", { timeout: 30000 });
      const nachNeuladen = await messen();
      expect(nachNeuladen.breiten).toBe("328x264");
      expect(nachNeuladen.ueberlaufPx).toBe(0);

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 180000);
});
