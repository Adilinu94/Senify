import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
        root000001: { id: "root000001", primitive: "root", props: {}, children: ["div000001", "head000001"] },
        div000001: {
          id: "div000001",
          primitive: "divider",
          props: {},
          states: { hover: { background: "#ff0000" } },
        },
        head000001: {
          id: "head000001",
          primitive: "heading",
          props: { level: "h2", text: "Katalogbaustein" },
        },
      },
      styleRules: [],
    };

    const store = new EditorStore({ document: initialDocument });
    const canvas = mountCanvas(document.getElementById("canvas-host"), {
      store,
      registry: createRegistry(),
      // The product canvas keeps pseudo-state controls in the Inspector. This
      // browser contract still exercises the opt-in diagnostic chrome.
      debugChrome: true,
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
      // The opt-in diagnostic chrome is explicit in this harness.
      expect(await tab.locator('[data-role="states"] .senify-canvas__button:visible').count()).toBe(7);

      const desktopFrame = tab
        .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
        .contentFrame();
      // Nodes are visible: the real section component, not a stub, drawn by the
      // React renderer inside the frame.
      await desktopFrame.locator('section[data-section="divider"]').first().waitFor();
      expect(await desktopFrame.locator('section[data-section="divider"]').count()).toBe(1);
      expect(await desktopFrame.locator('[data-node-id="div000001"]').count()).toBe(1);

      // A catalog primitive without a section twin draws from the one markup
      // description (Phase 1): real element, real class, node markers and text.
      // The tag is the catalog value ("h2"), not a fixed one. The generated
      // scope class rides along (ticket 21) so anchored rules can match.
      const describedHeading = desktopFrame.locator('h2[data-widget="heading"]');
      await describedHeading.waitFor();
      expect(await describedHeading.getAttribute("class")).toBe(
        "w-heading __senify_scope_head000001",
      );
      expect(await describedHeading.getAttribute("data-node-id")).toBe("head000001");
      expect(await describedHeading.textContent()).toBe("Katalogbaustein");
      // A name both vocabularies carry ("divider") stays with the running
      // section registry (strangler, E2), so the legacy node is not re-rendered.
      expect(await desktopFrame.locator('[data-widget="divider"]').count()).toBe(0);

      // Visual evidence of the round: the transient instance only, no fixed
      // ports (4321/4322 stay untouched).
      const shotDir = resolve(process.cwd(), ".scratch/refs/nick/ui");
      mkdirSync(shotDir, { recursive: true });
      await tab.screenshot({ path: join(shotDir, "canvas-bausteine-1600.png") });

      // The compiler rules reach the frame: the authored layer plus the chrome
      // (the pointer cursor; the markers moved to the portal, ticket 16).
      const injectedRules = await desktopFrame
        .locator("style[data-senify-canvas-rules]")
        .textContent();
      expect(injectedRules).toContain("@layer user-authored");
      expect(injectedRules).toContain("[data-node-id] { cursor: pointer; }");
      expect(injectedRules).not.toContain(".senify-canvas__marker");
      // Content neutrality: no editor token and none of the legacy palette
      // reaches the frame.
      expect(injectedRules).not.toContain("--ed-");
      expect(injectedRules).not.toContain("#d004d4");
      expect(injectedRules).not.toContain("#0ea5e9");

      // Inline text (ticket 03 point 4): double-click edits the real leaf in
      // place; the burst folds into one history entry, Escape consumes it.
      const headingText = (): Promise<string | null> =>
        tab.evaluate(() => {
          const scope = globalThis as unknown as {
            __store?: { document: { nodes: Record<string, { props: Record<string, unknown> }> } };
          };
          const value = scope.__store?.document.nodes.head000001?.props.text;
          return typeof value === "string" ? value : null;
        });
      const inlineLeaf = desktopFrame.locator('[data-inline][data-inline-node="head000001"]');
      await inlineLeaf.dblclick();
      await expect
        .poll(async () => inlineLeaf.getAttribute("contenteditable"))
        .toBe("plaintext-only");
      await inlineLeaf.pressSequentially("Neu-");
      await expect.poll(headingText).toContain("Neu-");
      await tab.keyboard.press("Escape");
      await expect.poll(headingText).toBe("Katalogbaustein");
      await expect.poll(async () => inlineLeaf.getAttribute("contenteditable")).toBeNull();
      // The revert consumed the burst: nothing left to undo.
      await expect.poll(async () => (await probe()).canUndo).toBe(false);

      // Commit with Enter keeps the text as one entry; a single undo restores it.
      await inlineLeaf.dblclick();
      await inlineLeaf.pressSequentially("Neu-");
      await tab.keyboard.press("Enter");
      await expect.poll(headingText).toContain("Neu-");
      await expect.poll(async () => inlineLeaf.getAttribute("contenteditable")).toBeNull();
      await expect.poll(async () => (await probe()).canUndo).toBe(true);
      await tab.locator('.senify-canvas__button[data-action="undo"]').click();
      await expect.poll(headingText).toBe("Katalogbaustein");

      // Hover draws the 1px ring in the portal with the name badge — outside
      // the frame, so the content stays untouched. The pointer path into the
      // frame is the known iframe-boundary flake (HANDOFF §8): Playwright's
      // stepped mouse move delivers the mousemove and then a spurious
      // `mouseout`, so the test dispatches the same bubbling mousemove the
      // handler listens for. The target differs from the current selection
      // (the inline edit left the heading selected).
      await desktopFrame.locator('[data-node-id="div000001"]').evaluate((element) => {
        const view = (element as unknown as {
          ownerDocument: { defaultView: { MouseEvent: new (type: string, init: object) => Event } };
        }).ownerDocument.defaultView;
        (element as unknown as { dispatchEvent(event: Event): void }).dispatchEvent(
          new view.MouseEvent("mousemove", { bubbles: true }),
        );
      });
      await expect
        .poll(async () => tab.locator(".senify-canvas__hover-ring:visible").count())
        .toBeGreaterThan(0);
      const hoverBox = await tab.locator(".senify-canvas__hover-ring:visible").first().boundingBox();
      expect(hoverBox).not.toBeNull();
      expect(await desktopFrame.locator(".senify-canvas__marker").count()).toBe(0);

      // A click selects the node: the root carries it and the selection ring
      // lives in the portal over the stage.
      await desktopFrame.locator('[data-node-id="div000001"]').click();
      await expect.poll(async () => (await probe()).focus).toBe("div000001");
      expect(await tab.locator('.senify-canvas[data-selected="div000001"]').count()).toBe(1);
      await expect
        .poll(async () => tab.locator(".senify-canvas__select-ring:visible").count())
        .toBeGreaterThan(0);
      // One ring per sheet, four 24x24 handles at the active one, the size
      // pair as text — all in the editor DOM, not in the frame.
      expect(await tab.locator(".senify-canvas__select-ring:visible").count()).toBe(3);
      await expect
        .poll(async () => tab.locator(".senify-canvas__handle:visible").count())
        .toBe(12);
      expect(await tab.locator(".senify-canvas__select-size:visible").first().textContent()).toMatch(
        /^\d+ × \d+$/,
      );
      expect(await desktopFrame.locator('[data-selected="true"]').count()).toBe(0);
      // The ring sits inside the desktop sheet's visual box (geometry bridge).
      const ringBox = await tab.locator(".senify-canvas__select-ring:visible").first().boundingBox();
      const ringSheetBox = await tab
        .locator('.senify-canvas__frame[data-device="desktop"]')
        .boundingBox();
      expect(ringBox).not.toBeNull();
      expect(ringSheetBox).not.toBeNull();
      if (ringBox !== null && ringSheetBox !== null) {
        expect(ringBox.x).toBeGreaterThanOrEqual(ringSheetBox.x - 1);
        expect(ringBox.y).toBeGreaterThanOrEqual(ringSheetBox.y - 1);
        expect(ringBox.x + ringBox.width).toBeLessThanOrEqual(ringSheetBox.x + ringSheetBox.width + 1);
      }

      // The live-follow flash (ticket 05): a ring over the changed node that
      // fades by itself — the same geometry as the selection, no handles.
      await tab.evaluate(() => {
        (globalThis as unknown as { __canvas: { flashNodes(ids: string[]): void } }).__canvas.flashNodes([
          "div000001",
        ]);
      });
      await expect
        .poll(async () => tab.locator(".senify-canvas__flash-ring:visible").count())
        .toBeGreaterThan(0);
      await expect
        .poll(async () => tab.locator(".senify-canvas__flash-ring:visible").count(), {
          timeout: 4000,
        })
        .toBe(0);

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

      // The history sheet (ticket 03 point 5): time and action per row, a click
      // jumps to that state through the undo/redo gate. Two changes in a row
      // (a new change after an undo drops the redo future — HistoryStack).
      await tab.locator('.senify-canvas__button[data-action="insert-after"]').click();
      await expect
        .poll(async () => desktopFrame.locator('section[data-section="divider"]').count())
        .toBe(2);
      await tab.locator('.senify-canvas__button[data-action="insert-after"]').click();
      await expect
        .poll(async () => desktopFrame.locator('section[data-section="divider"]').count())
        .toBe(3);
      await tab.locator('.senify-canvas__button[data-action="history"]').click();
      const historyRows = tab.locator(".senify-history__row");
      await expect.poll(async () => historyRows.count()).toBeGreaterThanOrEqual(2);
      expect(await tab.locator('.senify-history__row[data-current="true"]').count()).toBe(1);
      expect(await tab.locator(".senify-history__time").first().textContent()).toMatch(
        /^\d{2}:\d{2}:\d{2}$/,
      );
      // Newest first: the last row is the older state — jumping back removes
      // the newest divider, the newer entry stays visible as the future.
      await historyRows.last().click();
      await expect
        .poll(async () => desktopFrame.locator('section[data-section="divider"]').count())
        .toBe(2);
      await expect
        .poll(async () => tab.locator('.senify-history__row[data-future="true"]').count())
        .toBeGreaterThan(0);
      await tab.keyboard.press("Escape");
      await expect
        .poll(async () => tab.locator('.senify-history[data-open="true"]').count())
        .toBe(0);

      // Keyboard (ticket 03 point 7): Cmd+D duplicates, Delete removes, Cmd+Z
      // restores, Escape walks one level up and Enter one level down.
      const dividerCount = (): Promise<number> =>
        desktopFrame.locator('section[data-section="divider"]').count();
      await desktopFrame.locator('[data-node-id="div000001"]').click();
      await expect.poll(async () => (await probe()).focus).toBe("div000001");
      expect(await dividerCount()).toBe(2);
      await tab.keyboard.press("Control+d");
      await expect.poll(dividerCount).toBe(3);
      await tab.keyboard.press("Control+z");
      await expect.poll(dividerCount).toBe(2);
      await tab.keyboard.press("Delete");
      await expect.poll(dividerCount).toBe(1);
      await tab.keyboard.press("Control+z");
      await expect.poll(dividerCount).toBe(2);
      await tab.keyboard.press("Escape");
      await expect.poll(async () => (await probe()).focus).toBe("root000001");
      await tab.keyboard.press("Enter");
      await expect.poll(async () => (await probe()).focus).toBe("div000001");

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
