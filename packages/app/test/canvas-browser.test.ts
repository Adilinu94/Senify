import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// The canvas of the editor rebuild (Phase 0, fourth slice) in a real browser:
// the frame shell loads, the React renderer draws the nodes, a click selects
// and marks, forcing a pseudo state paints through the injected rules, the
// catalog inserts and Undo takes it back — without console errors or failed
// requests.
//
// The canvas itself is served by `/editor.js` (the editor browser bundle); the
// test mounts it on a minimal harness page of the same origin instead of the
// dashboard shell, so the run hits the canvas and nothing else. Skipped when
// Playwright is missing (same contract as the other browser tests).

const HARNESS = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>Canvas-Prüfung</title></head>
<body style="margin:0">
  <div id="canvas-host" style="width:1500px;height:900px"></div>
  <script type="module">
    import { EditorStore, createRegistry, mountCanvas } from "/editor.js";

    const initialDocument = {
      version: 2,
      rootNodeId: "root000001",
      nodes: {
        root000001: { id: "root000001", primitive: "root", props: {}, children: ["div000001"] },
        div000001: {
          id: "div000001",
          primitive: "divider",
          props: {},
          states: { hover: { background: "#ff0000" } },
        },
      },
      classes: {},
    };

    const store = new EditorStore({ document: initialDocument });
    const canvas = mountCanvas(document.getElementById("canvas-host"), {
      store,
      registry: createRegistry(),
    });
    globalThis.__canvas = canvas;
    globalThis.__store = store;
    globalThis.__ready = true;
  </script>
</body>
</html>`;

type Probe = {
  selected: string | null;
  previewState: string | null;
  zoom: number;
  focus: string | null;
  canUndo: boolean;
};

describe.skipIf(!browserAvailable)("editor canvas in a real browser", () => {
  it("loads, draws, selects, forces a state, inserts and undoes", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-canvas-browser-"));
    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    const browser = await chromium.launch({ headless: true });
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    try {
      // Warm the on-demand editor bundle: the canvas runs on it, the timing of
      // the test should be the canvas, not esbuild.
      const bundle = await fetch(`${running.dashboardUrl}/editor.js`);
      expect(bundle.status).toBe(200);
      expect(await bundle.text()).toContain("mountCanvas");

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(20000);
      tab.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
      // The harness page has no favicon; that request is not a canvas failure.
      const isFavicon = (url: string): boolean => url.endsWith("/favicon.ico");
      tab.on("requestfailed", (request) => {
        if (isFavicon(request.url())) return;
        failedRequests.push(
          `failed: ${request.url()} (${request.failure()?.errorText ?? "?"})`,
        );
      });
      tab.on("response", (response) => {
        if (response.status() < 400 || isFavicon(response.url())) return;
        failedRequests.push(`http ${response.status()}: ${response.url()}`);
      });

      // Same origin as the bundle, so the harness can import `/editor.js`.
      await tab.route(
        (url) => url.pathname === "/",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: HARNESS,
          }),
      );
      await tab.goto(`${running.dashboardUrl}/`, { waitUntil: "load" });
      await tab.waitForFunction("window.__ready === true");

      const probe = (): Promise<Probe> =>
        tab.evaluate(() => {
          const scope = globalThis as unknown as {
            __canvas?: {
              state(): { selected: string | null; previewState: string | null; zoom: number };
            };
            __store?: { selection: { focus: string | null }; canUndo: boolean };
          };
          return {
            selected: scope.__canvas?.state().selected ?? null,
            previewState: scope.__canvas?.state().previewState ?? null,
            zoom: scope.__canvas?.state().zoom ?? 0,
            focus: scope.__store?.selection.focus ?? null,
            canUndo: scope.__store?.canUndo ?? false,
          };
        });

      // Canvas loads: the shell, three device frames at the start zoom.
      await tab.waitForSelector(".senify-canvas");
      expect(await tab.locator(".senify-canvas").count()).toBe(1);
      expect(await tab.locator(".senify-canvas__frame").count()).toBe(3);
      expect(await tab.locator(".senify-canvas__iframe").count()).toBe(3);
      expect(await tab.locator('[data-role="zoom"]').textContent()).toBe("50%");

      const desktopFrame = tab
        .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
        .contentFrame();
      // Nodes are visible: the real section component, not a stub, drawn by the
      // React renderer inside the frame.
      await desktopFrame.locator('section[data-section="divider"]').first().waitFor();
      expect(await desktopFrame.locator('section[data-section="divider"]').count()).toBe(1);
      expect(await desktopFrame.locator('[data-node-id="div000001"]').count()).toBe(1);

      // The compiler rules reach the frame: the authored layer plus the chrome.
      const injectedRules = await desktopFrame
        .locator("style[data-senify-canvas-rules]")
        .textContent();
      expect(injectedRules).toContain("@layer user-authored");
      expect(injectedRules).toContain(".senify-canvas__marker");

      // A click selects the node and marks it in the frame, the root and the
      // selection ring.
      await desktopFrame.locator('[data-node-id="div000001"]').click();
      await expect.poll(async () => (await probe()).focus).toBe("div000001");
      expect(await tab.locator('.senify-canvas[data-selected="div000001"]').count()).toBe(1);
      await expect
        .poll(async () =>
          desktopFrame.locator('[data-node-id="div000001"][data-selected="true"]').count(),
        )
        .toBe(1);
      await expect
        .poll(async () =>
          desktopFrame.locator('.senify-canvas__marker[data-kind="selection"]').first().isVisible(),
        )
        .toBe(true);

      // A forced hover paints through the injected rules: the frame root carries
      // the attribute and the section's computed background flips to red.
      const sectionBackground = (): Promise<string> =>
        desktopFrame.locator('[data-node-id="div000001"]').evaluate((element) => {
          const target = element as unknown as {
            ownerDocument: {
              defaultView: { getComputedStyle(node: unknown): { backgroundColor: string } };
            };
          };
          return target.ownerDocument.defaultView.getComputedStyle(element).backgroundColor;
        });
      await tab.locator('.senify-canvas__button[data-state="hover"]').click();
      await expect
        .poll(async () => desktopFrame.locator("html").getAttribute("data-force-state"))
        .toBe("hover");
      await expect
        .poll(async () =>
          (await desktopFrame.locator("style[data-senify-canvas-rules]").textContent())?.includes(
            '[data-force-state="hover"] [data-node-id="div000001"]',
          ) ?? false,
        )
        .toBe(true);
      await expect.poll(sectionBackground).toBe("rgb(255, 0, 0)");
      await expect.poll(async () => (await probe()).previewState).toBe("hover");

      // Back to "Aus": the attribute is gone and the element is transparent again.
      await tab.locator('.senify-canvas__button[data-state="none"]').click();
      await expect
        .poll(async () => desktopFrame.locator("html").getAttribute("data-force-state"))
        .toBeNull();
      await expect.poll(sectionBackground).toBe("rgba(0, 0, 0, 0)");

      // Insert from the catalog lands behind the selection; Undo takes it back.
      await tab.selectOption('.senify-canvas__select', "divider");
      await tab.locator('.senify-canvas__button[data-action="insert-after"]').click();
      await expect
        .poll(async () => desktopFrame.locator('section[data-section="divider"]').count())
        .toBe(2);
      await expect.poll(async () => (await probe()).canUndo).toBe(true);

      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect
        .poll(async () => desktopFrame.locator('section[data-section="divider"]').count())
        .toBe(1);

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
