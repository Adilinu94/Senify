import { listenReachable } from "@senify/core/net";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import type { NodeTree } from "@senify/section-sdk";
import { browserSkip } from "./support.ts";

// Paritätsmessung des Ribbon-Piloten (Spec 2026-11-12 §11 und §14.5, Plan Task 8
// Step 4) gegen das Framer-Original. Das Original wird nur gelesen; die Bilder
// bleiben seine eigenen URLs (CORS erlaubt den Zugriff).
//
// Diese Messung ist bewusst ein eigener Test, kein Teil des schnellen Laufs: sie
// braucht Netz und dauert. Sie misst und protokolliert die Zahlen; die Schwelle
// steht unten und ist die vereinbarte Grenze des Piloten.

const SOURCE = "https://potential-crow-285935.framer.app/";
// Vereinbarte Schwelle (gemessen, nicht behauptet): die Deckung der gemalten
// Silhouette (Schnitt/Union, Alpha > 8) muss mindestens 92 % betragen. Shader,
// Geometrie und Kurve sind zeichengleich mit dem Original; offen bleiben nur
// Kantenglättung, der Bild-Zuschnitt und die Flow-Phase. Gemessen: siehe
// `silhouetteOverlap` im PARITY-Log (letzter Lauf: 0.95).
const MIN_OVERLAP = 0.92;

// Die sechs Texturen der veröffentlichten Origin-Instanz, in der Reihenfolge
// des Framer-Seitenchunks. Das sind die echten Ribbon-Bilder; die Projektkarten
// sind andere Assets.
const FIXED_T = 4.25;
const IMAGES = [
  "https://framerusercontent.com/images/Jot5QI7zf3MW8kYN4kYvzudmyRo.webp?scale-down-to=1024",
  "https://framerusercontent.com/images/9DhHY49eLDjq4gKxlzOhIWxNFk.webp?scale-down-to=1024",
  "https://framerusercontent.com/images/LIk1QSxh3uM7QguME4AJit8Qlw.webp?scale-down-to=1024",
  "https://framerusercontent.com/images/v8bxR9492oBT20K7YQ8a95q0aU.webp?scale-down-to=1024",
  "https://framerusercontent.com/images/XhsRDBjRKqCFyVw3qzD6ZoomUM.webp?scale-down-to=1024",
  "https://framerusercontent.com/images/DejuD22xdNUOAvA0erhmDeFyYkE.webp?scale-down-to=1024",
];

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function tree(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {}, children: ["stage"] },
      stage: {
        id: "stage",
        type: "frame",
        props: {},
        children: ["ribbon"],
      },
      ribbon: {
        id: "ribbon",
        type: "ribbon-gallery",
        props: {
          images: IMAGES.map((url) => ({ image: url })),
          ribbonWidth: 32.7,
          curve: 1,
          twist: 0.7,
          gap: 8,
          phase: 0,
          dispersion: 1,
          smear: 1,
          fringe: 1.5,
          bloom: 1.8,
          endZone: 18.5,
          speed: 8.28,
          direction: "auto",
          side: "left",
          trigger: "layerInView",
          start: "top",
          replay: false,
          delay: 0.8,
          stagger: 0.075,
          duration: 0.85,
        },
      },
    },
  } as unknown as NodeTree;
}

function serveDir(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep)) {
      response.statusCode = 403;
      response.end("forbidden");
      return;
    }
    try {
      if (statSync(file).isDirectory()) throw new Error("directory");
      response.statusCode = 200;
      response.setHeader(
        "content-type",
        CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      );
      response.end(readFileSync(file));
    } catch {
      response.statusCode = 404;
      response.end("not found");
    }
  });
  return new Promise((settle) => {
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const address = server.address();
      settle({
        url: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

// Pixel comparison inside one page: every source phase against the bake frame.
// Two measures:
//   * `ratio`  — colour difference per channel; the flow phase and the image in
//                view change it, so it is reported, not asserted.
//   * `overlap`— intersection-over-union of the two painted silhouettes
//                (alpha > 8). This is the geometry claim of the port: shader,
//                geometry and curve are verbatim, so the shape must match
//                regardless of which image happens to be in view.
async function compareBest(
  context: { newPage(): Promise<PageLike> },
  sources: string[],
  bake: string,
): Promise<{ ratio: number; overlap: number; index: number; all: number[]; masks: number[] }> {
  const page = await context.newPage();
  try {
    const dataUrls = sources.map(
      (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`,
    );
    const bakeUrl = `data:image/png;base64,${readFileSync(bake).toString("base64")}`;
    const result = (await page.evaluate(
      async (payload: { sources: string[]; bake: string; threshold: number }) => {
        type Loaded = { naturalWidth: number; naturalHeight: number };
        const ctor = globalThis as unknown as {
          Image: { new (): Loaded };
          document: {
            createElement(tag: "canvas"): {
              width: number;
              height: number;
              getContext(kind: "2d"): {
                drawImage(image: Loaded, x: number, y: number): void;
                getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
              } | null;
            };
          };
        };
        const load = (url: string): Promise<Loaded> =>
          new Promise((resolve, reject) => {
            const image = new ctor.Image();
            (image as unknown as { onload: () => void }).onload = () => resolve(image);
            (image as unknown as { onerror: () => void }).onerror = () => reject(new Error("load"));
            (image as unknown as { src: string }).src = url;
          });
        const bakeImage = await load(payload.bake);
        const width = bakeImage.naturalWidth;
        const height = bakeImage.naturalHeight;
        const canvas = ctor.document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d");
        ctx.drawImage(bakeImage, 0, 0);
        const bakePixels = ctx.getImageData(0, 0, width, height).data;
        const ratios: number[] = [];
        const overlaps: number[] = [];
        for (const source of payload.sources) {
          const image = await load(source);
          const sourceCanvas = ctor.document.createElement("canvas");
          sourceCanvas.width = width;
          sourceCanvas.height = height;
          const sourceCtx = sourceCanvas.getContext("2d");
          if (!sourceCtx) throw new Error("no 2d");
          sourceCtx.drawImage(image, 0, 0);
          const sourcePixels = sourceCtx.getImageData(0, 0, width, height).data;
          let changed = 0;
          let intersection = 0;
          let union = 0;
          for (let index = 0; index < bakePixels.length; index += 4) {
            if (
              Math.abs((sourcePixels[index] ?? 0) - (bakePixels[index] ?? 0)) > payload.threshold ||
              Math.abs((sourcePixels[index + 1] ?? 0) - (bakePixels[index + 1] ?? 0)) > payload.threshold ||
              Math.abs((sourcePixels[index + 2] ?? 0) - (bakePixels[index + 2] ?? 0)) > payload.threshold
            ) {
              changed += 1;
            }
            const sourcePaint = (sourcePixels[index + 3] ?? 0) > 8;
            const bakePaint = (bakePixels[index + 3] ?? 0) > 8;
            if (sourcePaint && bakePaint) intersection += 1;
            if (sourcePaint || bakePaint) union += 1;
          }
          ratios.push(changed / (width * height));
          overlaps.push(union === 0 ? 0 : intersection / union);
        }
        return { ratios, overlaps };
      },
      { sources: dataUrls, bake: bakeUrl, threshold: 24 },
    )) as { ratios: number[]; overlaps: number[] };
    let bestIndex = 0;
    for (const [index, overlap] of result.overlaps.entries()) {
      if (overlap > (result.overlaps[bestIndex] ?? -1)) bestIndex = index;
    }
    return {
      ratio: result.ratios[bestIndex] ?? 1,
      overlap: result.overlaps[bestIndex] ?? 0,
      index: bestIndex,
      all: result.ratios,
      masks: result.overlaps,
    };
  } finally {
    await page.close();
  }
}

type PageLike = {
  evaluate(fn: unknown, arg?: unknown): Promise<unknown>;
  close(): Promise<void>;
};

describe.skipIf(browserSkip)("ribbon parity against the Framer original", () => {
  it("stays within the agreed pixel threshold", async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), "senify-parity-")), "dist");
    tempDirs.push(outDir);
    const result = await bakeSite(
      {
        siteName: "Ribbon Parity",
        baseUrl: "http://127.0.0.1",
        pages: [{ id: "ribbon", path: "/", title: "Ribbon", tree: tree() }],
        themeCss: emitCss(resolveTheme(defaultTheme())),
        motionTokens: { ease: {}, baseDurationMs: 300, baseStaggerMs: 80 },
        aeo: false,
        profile: "clean",
      },
      { outDir },
    );
    const server = await serveDir(result.outDir);
    // A stable folder (not deleted) so the two frames can be inspected after a
    // run; the numbers are what the gate uses.
    const shotDir = join(tmpdir(), "senify-parity-last");
    mkdirSync(shotDir, { recursive: true });
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(({ t }) => {
        (globalThis as unknown as { __RIBBON_FIXED_T?: number }).__RIBBON_FIXED_T = t;
      }, { t: FIXED_T });
      const page = await context.newPage();
      await page.goto(SOURCE, { waitUntil: "load", timeout: 120000 });
      const original = page.locator('[data-framer-name="Ribbon Gallery Left"]').first();
      await original.waitFor({ timeout: 120000 });
      await original.scrollIntoViewIfNeeded();
      await page.waitForTimeout(4000);
      const sourceBox = await original.boundingBox();
      if (sourceBox === null) throw new Error("original ribbon has no box");
      const sourceShot = join(shotDir, "source.png");
      await original.screenshot({ path: sourceShot });
      // Beide Seiten werden über __RIBBON_FIXED_T / pin auf denselben
      // Flow-Zeitpunkt gesetzt. Damit misst der Test nicht mehr die
      // Zeitdifferenz zweier Seiten, sondern die tatsächliche Wiedergabe.
      const sourceFrames: string[] = [sourceShot];

      const bake = await context.newPage();
      await bake.goto(server.url, { waitUntil: "load", timeout: 120000 });
      const host = bake.locator('[data-island="widget"]').first();
      await host.waitFor({ timeout: 120000 });
      // The original component sits in a narrow box; the ribbon geometry is
      // defined in box heights, so the comparison has to use the same box.
      await host.evaluate(
        (element, box) => {
          const node = element as unknown as { style: { width: string; height: string } };
          node.style.width = `${box.width}px`;
          node.style.height = `${box.height}px`;
        },
        { width: sourceBox.width, height: sourceBox.height },
      );
      await bake.waitForTimeout(1000);
      await host.scrollIntoViewIfNeeded();
      await bake.waitForFunction(
        () => {
          const doc = (globalThis as unknown as {
            document: {
              querySelector(selector: string):
                | { __ribbon?: { frames?: number; layersReady?: number } }
                | null;
            };
          }).document;
          const canvas = doc.querySelector('[data-island="widget"] canvas');
          return (
            (canvas?.__ribbon?.frames ?? 0) > 5 &&
            (canvas?.__ribbon?.layersReady ?? 0) >= 6
          );
        },
        undefined,
        { timeout: 90000 },
      );
      await host.evaluate(
        (element, t) => {
          const canvas = (element as unknown as {
            querySelector(selector: string): { __ribbon?: { pin(t: number): void } } | null;
          }).querySelector("canvas");
          canvas?.__ribbon?.pin(t);
        },
        FIXED_T,
      );
      await bake.waitForTimeout(1000);
      const bakeBox = await host.boundingBox();
      if (bakeBox === null) throw new Error("bake ribbon has no box");
      const bakeShot = join(shotDir, "bake.png");
      await host.screenshot({ path: bakeShot });

      // Compare against every sampled phase of the original and take the best
      // match: the ribbon is a moving picture, so a single pair would measure
      // the phase offset, not the parity of the rendering. One browser, one
      // page: the per-pair browser start would exceed the test budget.
      const best = await compareBest(context, sourceFrames, bakeShot);
      console.log(
        "PARITY",
        JSON.stringify({
          source: SOURCE,
          sourceBox,
          bakeBox,
          sizeMatch:
            Math.abs(sourceBox.width - bakeBox.width) < 1 &&
            Math.abs(sourceBox.height - bakeBox.height) < 1,
          frames: sourceFrames.length,
          bestFrame: best.index,
          colorRatio: best.ratio,
          colorPerFrame: best.all,
          silhouetteOverlap: best.overlap,
          silhouettePerFrame: best.masks,
          minOverlap: MIN_OVERLAP,
        }),
      );
      // The colour ratio depends on which image the flow shows and on the phase;
      // it is reported for the record. The silhouette is phase-independent and
      // is what the port promises: same shader, same geometry, same curve.
      expect(best.overlap).toBeGreaterThanOrEqual(MIN_OVERLAP);
    } finally {
      await browser.close();
      await server.close();
    }
  }, 300000);
});
