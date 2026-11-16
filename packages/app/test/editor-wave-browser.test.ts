import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { browserAvailable, memoryDb } from "./support.ts";

// Der Editor-Live-Mount des WaveBackground-Widgets (spec 2026-11-12) im echten
// Browser: der Canvas rendert den Host, die Injection laedt den Kern aus
// `/api/widget-module?type=wave-background`, der Host mountet im iframe.
//
// Wie beim Ribbon werden zwei Pfade getrennt belegt:
// 1. `setProps` am Handle aendert den laufenden Kern ohne Remount.
// 2. Eine Store-Aenderung laeuft durch den Live-Modus des Canvas (iframe-Neubau),
//    das Widget mountet dort mit den neuen Props.

const HARNESS = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>Wave-Live-Mount</title></head>
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
          children: ["wave000001"],
        },
        wave000001: {
          id: "wave000001",
          primitive: "wave-background",
          props: { speed: 1, glow: 1, steps: 22 },
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

type WaveProbe = {
  state: string | null;
  propsSpeed: number | null;
  coreSpeed: number | null;
  frames: number | null;
  hasContext: boolean;
  running: boolean;
  sameHandle: boolean;
  timeOrigin: number | null;
  hostCount: number;
  canvasCount: number;
};

describe.skipIf(!browserAvailable)("editor wave live mount", () => {
  it("mounts in the live iframe and reacts to setProps and store changes", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-editor-wave-"));
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

      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const tab = await context.newPage();
      tab.setDefaultTimeout(30000);
      tab.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
      });
      tab.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
      const isFavicon = (url: string): boolean => url.endsWith("/favicon.ico");
      tab.on("requestfailed", (request) => {
        if (isFavicon(request.url())) return;
        failedRequests.push(`failed: ${request.url()} (${request.failure()?.errorText ?? "?"})`);
      });
      tab.on("response", (response) => {
        if (response.status() < 400 || isFavicon(response.url())) return;
        failedRequests.push(`http ${response.status()}: ${response.url()}`);
      });

      await tab.route(
        (url) => url.pathname === "/",
        (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HARNESS }),
      );
      await tab.goto(`${running.dashboardUrl}/`, { waitUntil: "load" });
      await tab.waitForFunction("window.__ready === true");

      const desktopFrame = tab
        .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
        .contentFrame();
      await desktopFrame.locator('[data-island="widget"]').waitFor();
      await desktopFrame.locator('[data-island="widget"][data-widget-state="mounted"]').waitFor();

      const probe = (): Promise<WaveProbe> =>
        desktopFrame.locator("body").evaluate((body) => {
          const doc = (body as unknown as {
            ownerDocument: {
              querySelector(selector: string): unknown;
              querySelectorAll(selector: string): unknown[];
              defaultView: { __firstWave?: unknown; performance: { timeOrigin: number } };
            };
          }).ownerDocument;
          const host = doc.querySelector('[data-island="widget"]') as { getAttribute(name: string): string | null } | null;
          const canvas = doc.querySelector('[data-island="widget"] canvas') as {
            __wave?: { opts?: { speed?: number }; frames?: number; hasContext?: boolean; running?: boolean };
          } | null;
          let speed: number | null = null;
          try {
            speed = (JSON.parse(host?.getAttribute("data-props") ?? "{}") as { speed?: number }).speed ?? null;
          } catch {
            speed = null;
          }
          return {
            state: host?.getAttribute("data-widget-state") ?? null,
            propsSpeed: speed,
            coreSpeed: canvas?.__wave?.opts?.speed ?? null,
            frames: canvas?.__wave?.frames ?? null,
            hasContext: canvas?.__wave?.hasContext ?? false,
            running: canvas?.__wave?.running ?? false,
            sameHandle: doc.defaultView.__firstWave === canvas?.__wave,
            timeOrigin: doc.defaultView.performance.timeOrigin,
            hostCount: doc.querySelectorAll('[data-island="widget"]').length,
            canvasCount: doc.querySelectorAll('[data-island="widget"] canvas').length,
          };
        });

      const before = await probe();
      expect(before.state).toBe("mounted");
      expect(before.hasContext).toBe(true);
      expect(before.propsSpeed).toBe(1);
      expect(before.coreSpeed).toBe(1);
      expect(before.frames ?? 0).toBeGreaterThan(0);
      expect(before.hostCount).toBe(1);
      expect(before.canvasCount).toBe(1);

      // 1. setProps am laufenden Handle: kein Remount, der Kern uebernimmt den
      //    neuen Speed (derselbe Aufruf wie bei einem In-Place-Re-Render).
      await desktopFrame.locator("body").evaluate((body) => {
        const win = (body as unknown as {
          ownerDocument: {
            querySelector(selector: string): unknown;
            defaultView: {
              __senifyWidgetHandles?: Record<string, { setProps(props: unknown): void }>;
              __firstWave?: unknown;
            };
          };
        }).ownerDocument;
        const host = win.querySelector('[data-island="widget"]') as { getAttribute(name: string): string | null };
        const props = JSON.parse(host.getAttribute("data-props") || "{}") as Record<string, unknown>;
        win.defaultView.__firstWave = (win.querySelector('[data-island="widget"] canvas') as { __wave?: unknown }).__wave;
        win.defaultView.__senifyWidgetHandles?.["wave000001"]?.setProps({ ...props, speed: 2 });
      });

      await expect.poll(async () => (await probe()).coreSpeed, { timeout: 20000 }).toBe(2);
      const afterSetProps = await probe();
      expect(afterSetProps.sameHandle).toBe(true);
      expect(afterSetProps.state).toBe("mounted");
      expect(afterSetProps.frames ?? 0).toBeGreaterThanOrEqual(before.frames ?? 0);
      expect(afterSetProps.timeOrigin).toBe(before.timeOrigin);

      // 2. Store-Aenderung: der Live-Modus baut das iframe neu auf, das Widget
      //    mountet dort mit dem neuen Prop.
      await tab.evaluate(() => {
        const scope = globalThis as unknown as { __store: { apply(input: unknown): unknown } };
        scope.__store.apply({ op: "setNodeProp", id: "wave000001", key: "speed", value: 3 });
      });

      await expect
        .poll(async () => {
          const seen = await probe();
          return seen.timeOrigin !== before.timeOrigin ? seen.coreSpeed : null;
        }, { timeout: 20000 })
        .toBe(3);
      const afterStore = await probe();
      expect(afterStore.propsSpeed).toBe(3);
      expect(afterStore.state).toBe("mounted");
      expect(afterStore.hasContext).toBe(true);
      expect(afterStore.hostCount).toBe(1);
      expect(afterStore.canvasCount).toBe(1);

      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});