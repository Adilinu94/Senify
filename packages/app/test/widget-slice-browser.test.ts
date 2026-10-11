import { listenReachable } from "@senify/core/net";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { startProgram } from "@senify/app";
import { diffScreenshots } from "@senify/analysis-worker";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { PRIMITIVE_BASE_CSS, type PropValue } from "@senify/widget-engine";
import { EditorStore, createDocument } from "@senify/editor/state";
import {
  canvasNodeTree,
  insertMutation,
  insertPlan,
} from "@senify/editor/canvas";
import { browserAvailable, memoryDb } from "./support.ts";

// Der senkrechte Durchstich von Phase 1 (O8): **eine** Sektion von der
// Bearbeitung bis zur Veroeffentlichung, geprueft gegen das Ergebnis.
//
//   * Bearbeiten: die Sektion entsteht ueber den Store (das einzige Schreibtor),
//     genau wie beim Einfuegen im Canvas.
//   * Arbeitsflaeche: der echte Canvas (`/editor.js`, `mountCanvas`) rendert das
//     Dokument in einem Frame mit den echten Rahmen-Stylesheets
//     (`/theme.css`, `/editor-frame.css`) und den Regeln aus `canvasFrameRules`.
//   * Veroeffentlichen: derselbe Baum geht durch den echten Bake (`bakeSite`,
//     die Stelle, die auch die Engine benutzt) und wird als Release ausgeliefert.
//
// Der Vergleich ist ein Bildvergleich **mit Toleranz** (`diffScreenshots`):
// Schriftglaettung, Kantenglaettung und Rundung duerfen sich zwischen
// Arbeitsflaeche und Release unterscheiden, ein Unterschied in den Stilen
// (fehlendes Grund-CSS, fehlende Regel, falsche Reihenfolge) nicht. Deshalb wird
// zusaetzlich jedes Mass numerisch auf beiden Seiten gelesen und verglichen.
//
// Die Katalog-Bausteine sind noch nicht in der Mutations-API der Engine
// registriert (Strangler, E2 in `map.md`): die Veroeffentlichung laeuft deshalb
// ueber `bakeSite` — dieselbe Funktion, die `bakePages` der Engine aufruft — und
// nicht ueber `POST /api/releases`.

// Die Toleranz des Bildvergleichs. Sie muss zwei Dinge zugleich leisten: die
// Glaettungs- und Rundungsunterschiede zwischen Arbeitsflaeche und Release
// durchlassen und einen echten Stilunterschied fangen (Grund-CSS fehlt, Regel
// fehlt, Reihenfolge falsch). Gemessen: 3 von 80.640 Bildpunkten (0,0037 %) —
// die Gegenprobe ohne Grund-CSS liegt weit darueber (siehe Bericht).
const PARITY_RATIO = 0.01;

const HARNESS = (document: string): string => `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>Durchstich</title></head>
<body style="margin:0">
  <div id="canvas-host" style="width:1500px;height:1000px"></div>
  <script type="module">
    import { EditorStore, createRegistry, mountCanvas } from "/editor.js";

    const initialDocument = ${document};

    const store = new EditorStore({ document: initialDocument });
    const canvas = mountCanvas(document.getElementById("canvas-host"), {
      store,
      registry: createRegistry(),
      zoom: 1,
      frameStyles: ["/theme.css", "/editor-frame.css"],
    });
    globalThis.__canvas = canvas;
    globalThis.__store = store;
    globalThis.__ready = true;
  </script>
</body>
</html>`;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// A minimal static server for the baked release: the test must look at the real
// artifact, not at a reconstructed page.
function serveDir(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://release.local");
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep)) {
      response.statusCode = 403;
      response.end();
      return;
    }
    try {
      if (statSync(file).isDirectory()) throw new Error("directory");
      const body = readFileSync(file);
      response.statusCode = 200;
      response.setHeader(
        "content-type",
        CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      );
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.end("not found");
    }
  });
  return new Promise((settle) => {
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      settle({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

// The measurements both sides must agree on. Structural access only: the repo
// compiles without the DOM lib.
type Measurements = {
  width: number;
  height: number;
  maxWidth: string;
  gridColumns: string;
  gridGap: string;
  headingMargin: string;
  headingFontSize: string;
  headingFontFamily: string;
  textMargin: string;
};

type Measured = {
  ownerDocument: { defaultView: { getComputedStyle(node: never): Record<string, string> } };
  getBoundingClientRect(): { width: number; height: number };
  querySelector(selector: string): Measured | null;
};

describe.skipIf(!browserAvailable)("vertical slice: one section from editing to release (Phase 1)", () => {
  it("renders the same section in the canvas and in the release, within tolerance", async () => {
    const { chromium } = await import("playwright");
    const database = memoryDb();
    const dataDir = mkdtempSync(join(tmpdir(), "senify-slice-browser-"));

    // ---------------------------------------------------------------- bearbeiten
    // The section is built through the store: `insertPlan` picks parent and
    // index, the store validates and records the change (one undo entry each).
    const store = new EditorStore({
      document: createDocument(() => "root000001"),
    });
    const place = (
      target: string,
      primitive: string,
      props: Record<string, PropValue> = {},
    ): string => {
      const plan = insertPlan(store.document, target, primitive, "into");
      store.apply(insertMutation(plan, primitive, props));
      const children = store.document.nodes[target]?.children ?? [];
      return children[children.length - 1] ?? "";
    };
    const sectionId = place("root000001", "section");
    const headingId = place(sectionId, "heading", {
      level: "h2",
      text: "Durchstich",
    });
    const gridId = place(sectionId, "grid");
    const cellOne = place(gridId, "text", { text: "Zelle eins" });
    const cellTwo = place(gridId, "text", { text: "Zelle zwei" });

    // The document is the one the canvas renders and the one that is published.
    expect(store.document.nodes[sectionId]?.primitive).toBe("section");
    expect(store.document.nodes[headingId]?.props.text).toBe("Durchstich");
    expect(store.document.nodes["root000001"]?.children).toEqual([sectionId]);
    expect(store.document.nodes[gridId]?.children).toEqual([cellOne, cellTwo]);
    expect(store.canUndo).toBe(true);
    const tree = canvasNodeTree(store.document);
    expect(tree.nodes[sectionId]?.type).toBe("section");
    expect(tree.nodes[gridId]?.children).toHaveLength(2);

    const themeCss = emitCss(resolveTheme(defaultTheme()));
    const shotDir = resolve(process.cwd(), ".scratch/refs/nick/ui");
    mkdirSync(shotDir, { recursive: true });

    const running = await startProgram({
      db: database.db,
      dataDir,
      programTokenFile: join(dataDir, "program-token.json"),
      enginePort: 0,
      appPort: 0,
      openBrowser: false,
    });
    let bakedOutDir: string | undefined;
    let staticServer: { url: string; close(): Promise<void> } | undefined;
    const browser = await chromium.launch({ headless: true });
    const problems: string[] = [];
    try {
      // ------------------------------------------------ veroeffentlichen (Bake)
      const baked = await bakeSite(
        {
          siteName: "Durchstich",
          baseUrl: "https://beispiel.de",
          pages: [
            {
              id: "page",
              path: "/",
              title: "Durchstich",
              tree: tree as never,
            },
          ],
          themeCss,
          motionTokens: { ease: {}, baseDurationMs: 300, baseStaggerMs: 80 },
          aeo: false,
        },
        { outDir: join(mkdtempSync(join(tmpdir(), "senify-slice-bake-")), "dist") },
      );
      bakedOutDir = baked.outDir;
      expect(baked.warnings).toEqual([]);
      staticServer = await serveDir(bakedOutDir);
      const releaseHtml = readFileSync(join(bakedOutDir, "index.html"), "utf8");
      expect(releaseHtml).toContain('data-widget="grid"');

      // --------------------------------------------------- Arbeitsflaeche (Canvas)
      const bundle = await fetch(`${running.dashboardUrl}/editor.js`);
      expect(bundle.status).toBe(200);
      expect(await bundle.text()).toContain("mountCanvas");

      const canvasTab = await browser.newPage({
        viewport: { width: 1500, height: 1000 },
      });
      canvasTab.setDefaultTimeout(30000);
      canvasTab.on("pageerror", (error) => problems.push(`canvas pageerror: ${error.message}`));
      await canvasTab.route(
        (url) => url.pathname === "/",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: HARNESS(JSON.stringify(store.document)),
          }),
      );
      await canvasTab.goto(`${running.dashboardUrl}/`, { waitUntil: "load" });
      await canvasTab.waitForFunction("window.__ready === true");
      const desktopFrame = canvasTab
        .locator('.senify-canvas__frame[data-device="desktop"] .senify-canvas__iframe')
        .contentFrame();
      const canvasSection = desktopFrame.locator('[data-widget="section"]');
      await canvasSection.waitFor();
      expect(await canvasSection.getAttribute("data-node-id")).toBe(sectionId);
      // The base stylesheet and the document rules both reach the frame.
      const injected = (await desktopFrame
        .locator("style[data-senify-canvas-rules]")
        .textContent()) ?? "";
      expect(injected).toContain(".w-heading {");
      expect(injected).toContain("@layer user-authored");

      // ------------------------------------------------------ Release im Browser
      const releaseTab = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      releaseTab.setDefaultTimeout(30000);
      releaseTab.on("pageerror", (error) => problems.push(`release pageerror: ${error.message}`));
      releaseTab.on("response", (response) => {
        if (response.status() >= 400) {
          problems.push(`release http ${response.status()}: ${response.url()}`);
        }
      });
      await releaseTab.goto(`${staticServer.url}/`, { waitUntil: "load" });
      const releaseSection = releaseTab.locator('[data-widget="section"]');
      await releaseSection.waitFor();
      expect(
        await releaseTab.evaluate(
          () => (globalThis as unknown as { document: { fonts: { status: string } } }).document.fonts.status,
        ),
      ).toBe("loaded");

      // ------------------------------------------------------------- Vermessung
      const measure = async (locator: typeof canvasSection): Promise<Measurements> =>
        locator.evaluate((element) => {
          const node = element as unknown as Measured;
          const style = (target: Measured | null, property: string): string =>
            target === null ? "" : node.ownerDocument.defaultView.getComputedStyle(target as never)[property] ?? "";
          const grid = node.querySelector(".w-grid");
          const heading = node.querySelector(".w-heading");
          const text = node.querySelector(".w-text");
          const rect = node.getBoundingClientRect();
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            maxWidth: style(node, "maxWidth"),
            gridColumns: style(grid, "gridTemplateColumns"),
            gridGap: style(grid, "columnGap"),
            headingMargin: `${style(heading, "marginTop")} ${style(heading, "marginBottom")}`,
            headingFontSize: style(heading, "fontSize"),
            headingFontFamily: style(heading, "fontFamily"),
            textMargin: style(text, "marginTop"),
          };
        });

      const canvasMetrics = await measure(canvasSection);
      const releaseMetrics = await measure(releaseSection);

      const canvasShot = join(shotDir, "phase1-durchstich-canvas.png");
      const releaseShot = join(shotDir, "phase1-durchstich-release.png");
      await canvasSection.screenshot({ path: canvasShot });
      await releaseSection.screenshot({ path: releaseShot });
      // Belegbilder des Durchstichs: die ganze Arbeitsflaeche und die ganze
      // ausgelieferte Seite, damit das Grund-Styling im Zusammenhang sichtbar ist.
      await canvasTab.screenshot({
        path: join(shotDir, "phase1-durchstich-canvas-voll.png"),
      });
      await releaseTab.screenshot({
        path: join(shotDir, "phase1-durchstich-release-1440.png"),
        fullPage: true,
      });

      // Kein waagerechter Ueberlauf: weder das Rahmen-Dokument der Arbeitsflaeche
      // noch die ausgelieferte Seite darf breiter als ihr Fenster sein — genau der
      // Fehler, den falsch eingespeistes Grund-CSS ausloesen wuerde. Ein Pixel
      // Rundung bleibt erlaubt.
      const documentOverflow = async (scope: typeof canvasSection): Promise<number> =>
        scope.evaluate((element) => {
          const node = element as unknown as {
            ownerDocument: {
              documentElement: { scrollWidth: number; clientWidth: number };
            };
          };
          const root = node.ownerDocument.documentElement;
          return root.scrollWidth - root.clientWidth;
        });
      const canvasOverflow = await documentOverflow(canvasSection);
      const releaseOverflow = await releaseTab.evaluate(() => {
        const doc = (globalThis as unknown as {
          document: { documentElement: { scrollWidth: number; clientWidth: number } };
        }).document;
        return doc.documentElement.scrollWidth - doc.documentElement.clientWidth;
      });

      // The picture: same size, then per-pixel with tolerance.
      const diff = await diffScreenshots({
        before: canvasShot,
        after: releaseShot,
        outDir: shotDir,
        name: "phase1-durchstich",
        // Tolerance: a channel counts as changed only above 24/255 (about 9%),
        // which swallows the antialiasing of glyph and box edges; the ratio cap
        // then allows a small share of such pixels. Sizes must match exactly.
        threshold: 24,
      });
      // Evidence for the ledger: the numbers of this run.
      console.log(
        "PARITY",
        JSON.stringify({ diff, canvasMetrics, releaseMetrics, canvasOverflow, releaseOverflow }),
      );

      expect(canvasMetrics).toEqual(releaseMetrics);
      expect(diff.width).toBe(canvasMetrics.width);
      expect(diff.height).toBe(canvasMetrics.height);
      expect(diff.ratio).toBeLessThanOrEqual(PARITY_RATIO);
      // No horizontal overflow on either side (one pixel of rounding allowed).
      expect(canvasOverflow).toBeLessThanOrEqual(1);
      expect(releaseOverflow).toBeLessThanOrEqual(1);

      // ------------------------------------------------- Gegenprobe (Schaerfe)
      // The tolerance has to be tight enough to catch the failure it exists for:
      // the same release page without the widget base stylesheet must leave the
      // tolerance and must lose the measured values. Without this control the
      // number above would say nothing.
      const withoutBase = releaseHtml.replace(PRIMITIVE_BASE_CSS, "/* Grund-CSS entfernt */");
      expect(withoutBase).not.toBe(releaseHtml);
      const controlTab = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      controlTab.setDefaultTimeout(30000);
      await controlTab.route(`${staticServer.url}/`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: withoutBase,
        }),
      );
      await controlTab.goto(`${staticServer.url}/`, { waitUntil: "load" });
      const controlSection = controlTab.locator('[data-widget="section"]');
      await controlSection.waitFor();
      const controlMetrics = await measure(controlSection);
      const controlShot = join(shotDir, "phase1-durchstich-ohne-grund-angleich.png");
      await controlSection.screenshot({ path: controlShot });
      const controlDiff = await diffScreenshots({
        before: canvasShot,
        after: controlShot,
        outDir: shotDir,
        name: "phase1-durchstich-gegenprobe",
        threshold: 24,
      });
      console.log(
        "PARITY-GEGENPROBE",
        JSON.stringify({ ratio: controlDiff.ratio, controlMetrics }),
      );
      expect(controlMetrics.maxWidth).not.toBe(canvasMetrics.maxWidth);
      expect(controlDiff.ratio).toBeGreaterThan(PARITY_RATIO);

      expect(problems).toEqual([]);
    } finally {
      await browser.close();
      await running.close();
      await database.close();
      if (staticServer) await staticServer.close();
      if (bakedOutDir) rmSync(bakedOutDir, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 300000);
});
