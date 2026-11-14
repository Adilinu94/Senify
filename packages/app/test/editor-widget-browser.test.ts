import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Der Editor-Live-Mount des Widgets (Spec 2026-11-12, Task 9) im echten
// Browser: das Canvas rendert den Host, die Injection laedt den Kern aus
// `/api/widget-module`, der Host mountet im iframe.
//
// Zwei Pfade werden getrennt belegt:
// 1. `setProps` am Handle aendert den laufenden Kern ohne Remount (derselbe
//    Handle, weiterlaufende Frames).
// 2. Eine Store-Aenderung laeuft durch den Live-Modus des Canvas. Der baut
//    das iframe absichtlich neu auf (`rebuildFrames`, damit die Release-
//    Runtime frisch bindet); das Widget mountet dort mit den neuen Props.
//    Der `setProps`-Zweig der Injection bleibt fuer In-Place-Renders
//    (Design/kuenftige Patch-Pfade) und ist im Unit-Test abgedeckt.

const RED =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGO4I6cBRwzEcQDiwxIhcqFjJAAAAABJRU5ErkJggg==";
const BLUE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGMQsbkDRwzEcQDbQxLBjzuzCwAAAABJRU5ErkJggg==";

const HARNESS = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>Widget-Live-Mount</title></head>
<body style="margin:0">
  <div id="canvas-host" style="width:1500px;height:900px"></div>
  <script type="module">
    import { EditorStore, createRegistry, mountCanvas } from "/editor.js";

    const initialDocument = {
      version: 2,
      rootNodeId: "root000001",
      nodes: {
        root000001: {
          id: "root000001",
          primitive: "root",
          props: {},
          children: ["rib000001"],
        },
        rib000001: {
          id: "rib000001",
          primitive: "ribbon-gallery",
          props: {
            speed: 8.28,
            images: [
              { image: ${JSON.stringify(RED)} },
              { image: ${JSON.stringify(BLUE)} },
            ],
          },
        },
      },
      styleRules: [],
    };

    const store = new EditorStore({ document: initialDocument });
    const canvas = mountCanvas(document.getElementById("canvas-host"), {
      store,
      registry: createRegistry(),
    });
    canvas.setMode("live");
    globalThis.__canvas = canvas;
    globalThis.__store = store;
    globalThis.__ready = true;
  </script>
</body>
</html>`;

type WidgetProbe = {
  state: string | null;
  propsSpeed: number | null;
  coreSpeed: number | null;
  frames: number | null;
  hasContext: boolean;
  sameHandle: boolean;
  timeOrigin: number | null;
  hostCount: number;
  canvasCount: number;
};

describe.skipIf(!browserAvailable)("editor widget live mount", () => {
  it("mounts in the live iframe and reacts to setProps and store changes", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-editor-widget-"));
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
      const bundle = await fetch(`${running.dashboardUrl}/editor.js`);
      expect(bundle.status).toBe(200);

      const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
      });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
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

      const desktopFrame = tab
        .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
        .contentFrame();
      await desktopFrame.locator('[data-island="widget"]').waitFor();
      await desktopFrame
        .locator('[data-island="widget"][data-widget-state="mounted"]')
        .waitFor();

      const probe = (): Promise<WidgetProbe> =>
        desktopFrame.locator("body").evaluate((body) => {
          const doc = (
            body as unknown as {
              ownerDocument: {
                querySelector(selector: string): unknown;
                querySelectorAll(selector: string): unknown[];
                defaultView: {
                  __firstRibbon?: unknown;
                  performance: { timeOrigin: number };
                };
              };
            }
          ).ownerDocument;
          const host = doc.querySelector(
            '[data-island="widget"]',
          ) as { getAttribute(name: string): string | null } | null;
          const canvas = doc.querySelector(
            '[data-island="widget"] canvas',
          ) as {
            __ribbon?: {
              geo?: { speed?: number };
              frames?: number;
              hasContext?: boolean;
            };
          } | null;
          const raw = host?.getAttribute("data-props") ?? "{}";
          let speed: number | null = null;
          try {
            speed = (JSON.parse(raw) as { speed?: number }).speed ?? null;
          } catch {
            speed = null;
          }
          return {
            state: host?.getAttribute("data-widget-state") ?? null,
            propsSpeed: speed,
            coreSpeed: canvas?.__ribbon?.geo?.speed ?? null,
            frames: canvas?.__ribbon?.frames ?? null,
            hasContext: canvas?.__ribbon?.hasContext ?? false,
            sameHandle: doc.defaultView.__firstRibbon === canvas?.__ribbon,
            timeOrigin: doc.defaultView.performance.timeOrigin,
            hostCount: doc.querySelectorAll('[data-island="widget"]').length,
            canvasCount: doc.querySelectorAll('[data-island="widget"] canvas').length,
          };
        });

      const before = await probe();
      expect(before.state).toBe("mounted");
      expect(before.hasContext).toBe(true);
      expect(before.propsSpeed).toBe(8.28);
      expect(before.coreSpeed).toBeCloseTo(0.0828, 4);
      expect(before.frames ?? 0).toBeGreaterThan(0);
      expect(before.hostCount).toBe(1);
      expect(before.canvasCount).toBe(1);

      // 1. setProps am laufenden Handle: kein Remount, der Kern uebernimmt
      //    den neuen Speed. Das ist derselbe Aufruf, den die Injection bei
      //    einem In-Place-Re-Render macht.
      await desktopFrame.locator("body").evaluate((body) => {
        const win = (
          body as unknown as {
            ownerDocument: {
              querySelector(selector: string): unknown;
              defaultView: {
                __senifyWidgetHandles?: Record<
                  string,
                  { setProps(props: unknown): void }
                >;
                __firstRibbon?: unknown;
              };
            };
          }
        ).ownerDocument;
        const host = win.querySelector(
          '[data-island="widget"]',
        ) as { getAttribute(name: string): string | null };
        const props = JSON.parse(host.getAttribute("data-props") || "{}") as Record<
          string,
          unknown
        >;
        win.defaultView.__firstRibbon = (
          win.querySelector('[data-island="widget"] canvas') as {
            __ribbon?: unknown;
          }
        ).__ribbon;
        win.defaultView.__senifyWidgetHandles?.["rib000001"]?.setProps({
          ...props,
          speed: 30,
        });
      });

      await expect
        .poll(async () => (await probe()).coreSpeed, { timeout: 20000 })
        .toBeCloseTo(0.3, 4);
      const afterSetProps = await probe();
      expect(afterSetProps.sameHandle).toBe(true);
      expect(afterSetProps.state).toBe("mounted");
      expect(afterSetProps.frames ?? 0).toBeGreaterThanOrEqual(before.frames ?? 0);
      expect(afterSetProps.timeOrigin).toBe(before.timeOrigin);

      // 2. Store-Aenderung: der Live-Modus baut das iframe neu auf (bewusste
      //    Release-Treue), das Widget mountet dort mit dem neuen Prop.
      await tab.evaluate(() => {
        const scope = globalThis as unknown as {
          __store: { apply(input: unknown): unknown };
        };
        scope.__store.apply({
          op: "setNodeProp",
          id: "rib000001",
          key: "speed",
          value: 45,
        });
      });

      await expect
        .poll(async () => {
          const seen = await probe();
          return seen.timeOrigin !== before.timeOrigin
            ? seen.coreSpeed
            : null;
        }, { timeout: 20000 })
        .toBeCloseTo(0.45, 4);
      const afterStore = await probe();
      expect(afterStore.propsSpeed).toBe(45);
      expect(afterStore.state).toBe("mounted");
      expect(afterStore.hasContext).toBe(true);
      expect(afterStore.hostCount).toBe(1);
      expect(afterStore.canvasCount).toBe(1);

      // 3. Design-Modus: derselbe Kern mountet in-place, der Poster weicht.
      await tab.evaluate(() => {
        (globalThis as unknown as {
          __canvas: { setMode(mode: string): void; setEffects(enabled: boolean): void };
        }).__canvas.setMode("design");
      });
      await expect
        .poll(async () => (await probe()).state, { timeout: 20000 })
        .toBe("mounted");
      const design = await probe();
      expect(design.hasContext).toBe(true);
      expect(design.frames ?? 0).toBeGreaterThan(0);
      const posterVisibility = async (): Promise<string> =>
        desktopFrame
          .locator(".w-ribbon-gallery--poster")
          .evaluate((element) =>
            (
              globalThis as unknown as {
                getComputedStyle(target: unknown): { visibility: string };
              }
            ).getComputedStyle(element).visibility,
          );
      expect(await posterVisibility()).toBe("hidden");

      // 4. Effekte aus: frischer Design-Rahmen, Poster steht, kein WebGL.
      await tab.evaluate(() => {
        (globalThis as unknown as {
          __canvas: { setMode(mode: string): void; setEffects(enabled: boolean): void };
        }).__canvas.setEffects(false);
      });
      await expect
        .poll(async () => (await probe()).state, { timeout: 20000 })
        .toBe("pending");
      expect((await probe()).hasContext).toBe(false);
      expect(await posterVisibility()).toBe("visible");

      // 5. Wieder an: der Kern mountet erneut.
      await tab.evaluate(() => {
        (globalThis as unknown as {
          __canvas: { setMode(mode: string): void; setEffects(enabled: boolean): void };
        }).__canvas.setEffects(true);
      });
      await expect
        .poll(async () => (await probe()).state, { timeout: 20000 })
        .toBe("mounted");
      const designOn = await probe();
      expect(designOn.hasContext).toBe(true);

      // 6. Design-Store-Aenderung: In-Place-Refresh, setProps statt Remount.
      await desktopFrame.locator("body").evaluate((body) => {
        const doc = (
          body as unknown as {
            ownerDocument: {
              querySelector(selector: string): unknown;
              defaultView: { __firstRibbon?: unknown };
            };
          }
        ).ownerDocument;
        doc.defaultView.__firstRibbon = (
          doc.querySelector('[data-island="widget"] canvas') as { __ribbon?: unknown }
        ).__ribbon;
      });
      await tab.evaluate(() => {
        (globalThis as unknown as {
          __store: { apply(input: unknown): unknown };
        }).__store.apply({
          op: "setNodeProp",
          id: "rib000001",
          key: "speed",
          value: 20,
        });
      });
      await expect
        .poll(async () => (await probe()).coreSpeed, { timeout: 20000 })
        .toBeCloseTo(0.2, 4);
      const designAfter = await probe();
      expect(designAfter.sameHandle).toBe(true);
      expect(designAfter.timeOrigin).toBe(designOn.timeOrigin);
      expect(designAfter.state).toBe("mounted");

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
