import { listenReachable } from "@senify/core/net";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { diffScreenshots } from "@senify/analysis-worker";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import type { NodeTree } from "@senify/section-sdk";
import { browserSkip } from "./support.ts";

// Task 8: the pilot end to end. A real bake writes the widget bundle and the
// image assets; a real browser mounts the island, paints the WebGL canvas and
// reacts to changed props. Reduced motion must stop the loop after one frame.
//
// The debug handle on the canvas (`__ribbon`) is part of the ported core; this
// test reads it instead of guessing from pixels alone. The screenshot diff is
// the second, independent signal.

const RED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGO4I6cBRwzEcQDiwxIhcqFjJAAAAABJRU5ErkJggg==",
  "base64",
);
const BLUE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGMQsbkDRwzEcQDbQxLBjzuzCwAAAABJRU5ErkJggg==",
  "base64",
);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

const tempRoots: string[] = [];

function tempRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

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

function ribbonTree(speed: number, dispersion?: number): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {}, children: ["sec"] },
      sec: { id: "sec", type: "section", props: {}, children: ["ribbon"] },
      ribbon: {
        id: "ribbon",
        type: "ribbon-gallery",
        props: {
          images: [{ image: "a1" }, { image: "a2" }],
          speed,
          ...(dispersion === undefined ? {} : { dispersion }),
        },
      },
    },
  };
}

async function bakeRibbon(
  speed: number,
  dispersion?: number,
): Promise<{ url: string; close(): Promise<void> }> {
  const outDir = join(tempRoot("senify-ribbon-browser-"), "dist");
  const result = await bakeSite(
    {
      siteName: "Ribbon",
      baseUrl: "https://beispiel.de",
      pages: [
        { id: "ribbon", path: "/", title: "Ribbon", tree: ribbonTree(speed, dispersion) },
      ],
      assets: { a1: "/media/a1.png", a2: "/media/a2.png" },
      themeCss: emitCss(resolveTheme(defaultTheme())),
      motionTokens: { ease: {}, baseDurationMs: 300, baseStaggerMs: 80 },
      aeo: false,
    },
    { outDir },
  );
  mkdirSync(join(result.outDir, "media"), { recursive: true });
  writeFileSync(join(result.outDir, "media", "a1.png"), RED_PNG);
  writeFileSync(join(result.outDir, "media", "a2.png"), BLUE_PNG);
  return serveDir(result.outDir);
}

type RibbonCanvas = {
  width: number;
  height: number;
  __ribbon?: {
    hasContext?: boolean;
    loaded?: boolean;
    frames?: number;
    ticking?: boolean;
    layersReady?: number;
    geo?: { speed?: number };
  };
};

const waitForRibbon = async (page: {
  waitForFunction(
    fn: () => boolean,
    arg?: unknown,
    options?: { timeout?: number },
  ): Promise<unknown>;
}): Promise<void> => {
  await page.waitForFunction(
    () => {
      const doc = (globalThis as unknown as {
        document: { querySelector(selector: string): RibbonCanvas | null };
      }).document;
      const canvas = doc.querySelector('[data-island="widget"] canvas');
      return (
        canvas !== null &&
        canvas.__ribbon?.hasContext === true &&
        canvas.__ribbon.loaded === true &&
        (canvas.__ribbon.layersReady ?? 0) >= 1 &&
        (canvas.__ribbon.frames ?? 0) > 2
      );
    },
    undefined,
    { timeout: 20000 },
  );
};

describe.skipIf(browserSkip)("ribbon widget in the bake", () => {
  afterAll(() => {
    for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
  });

  it("mounts, paints, and reacts to changed props", async () => {
    const { chromium } = await import("playwright");
    const shotDir = tempRoot("senify-ribbon-shots-");
    const servers: { url: string; close(): Promise<void> }[] = [];
    const browser = await chromium.launch({ headless: true });
    try {
      servers.push(await bakeRibbon(8.28), await bakeRibbon(30, 2));
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      try {
        const page = await context.newPage();
        await page.goto(servers[0]!.url, { waitUntil: "load" });
        const host = page.locator('[data-island="widget"]').first();
        await host.waitFor({ timeout: 30000 });
        await host.scrollIntoViewIfNeeded();
        await expect
          .poll(async () => host.getAttribute("data-widget-state"), { timeout: 30000 })
          .toBe("mounted");
        await waitForRibbon(page);

        const first = await page.evaluate(() => {
          const doc = (globalThis as unknown as {
            document: {
              querySelector(selector: string): (RibbonCanvas & {
                getAttribute(name: string): string | null;
              }) | null;
            };
          }).document;
          const canvas = doc.querySelector('[data-island="widget"] canvas');
          return {
            width: canvas?.width ?? 0,
            height: canvas?.height ?? 0,
            ticking: canvas?.__ribbon?.ticking ?? false,
            speed: canvas?.__ribbon?.geo?.speed ?? 0,
            props: (globalThis as unknown as {
              document: { querySelector(selector: string): { getAttribute(name: string): string | null } | null };
            }).document
              .querySelector('[data-island="widget"]')
              ?.getAttribute("data-props") ?? "{}",
          };
        });
        expect(first.width).toBeGreaterThan(0);
        expect(first.height).toBeGreaterThan(0);
        expect(first.ticking).toBe(true);
        expect(first.speed).toBeCloseTo(0.0828);
        expect((JSON.parse(first.props) as { speed?: number }).speed).toBe(8.28);

        const ribbonShot = join(shotDir, "ribbon-paint.png");
        const blankShot = join(shotDir, "ribbon-background.png");
        await host.screenshot({ path: ribbonShot });
        const box = await host.boundingBox();
        if (box === null) throw new Error("widget has no box");
        await host.evaluate((element) => {
          (element as unknown as { style: { visibility: string } }).style.visibility = "hidden";
        });
        await page.screenshot({ path: blankShot, clip: box });
        const paint = await diffScreenshots({
          before: blankShot,
          after: ribbonShot,
          outDir: shotDir,
          name: "ribbon-paint",
          threshold: 24,
        });
        expect(paint.changedPixels).toBeGreaterThan(0);

        // One WebGL page at a time: two live contexts would compete for the GPU
        // and the second one stalled before it could mount.
        await page.close();
        const page2 = await context.newPage();
        await page2.goto(servers[1]!.url, { waitUntil: "load" });
        const host2 = page2.locator('[data-island="widget"]').first();
        await host2.waitFor({ timeout: 30000 });
        await host2.scrollIntoViewIfNeeded();
        await expect
          .poll(async () => host2.getAttribute("data-widget-state"), { timeout: 30000 })
          .toBe("mounted");
        await waitForRibbon(page2);
        const secondSpeed = await page2.evaluate(() => {
          const doc = (globalThis as unknown as {
            document: { querySelector(selector: string): RibbonCanvas | null };
          }).document;
          return doc.querySelector('[data-island="widget"] canvas')?.__ribbon?.geo?.speed ?? 0;
        });
        expect(secondSpeed).toBeCloseTo(0.3);
        const secondProps = await page2.evaluate(() => {
          const doc = (globalThis as unknown as {
            document: { querySelector(selector: string): { getAttribute(name: string): string | null } | null };
          }).document;
          return doc.querySelector('[data-island="widget"]')?.getAttribute("data-props") ?? "{}";
        });
        expect((JSON.parse(secondProps) as { dispersion?: number }).dispersion).toBe(2);

        const secondShot = join(shotDir, "ribbon-edited.png");
        await host2.screenshot({ path: secondShot });
        const edited = await diffScreenshots({
          before: ribbonShot,
          after: secondShot,
          outDir: shotDir,
          name: "ribbon-edited",
          threshold: 24,
        });
        expect(edited.changedPixels).toBeGreaterThan(0);
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
      for (const server of servers) await server.close();
      rmSync(shotDir, { recursive: true, force: true });
    }
  }, 180000);

  it("shows one static frame with reduced motion", async () => {
    const { chromium } = await import("playwright");
    const server = await bakeRibbon(8.28);
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        reducedMotion: "reduce",
      });
      try {
        const page = await context.newPage();
        await page.goto(server.url, { waitUntil: "load" });
        const host = page.locator('[data-island="widget"]').first();
        await host.waitFor({ timeout: 30000 });
        await expect
          .poll(async () => host.getAttribute("data-widget-state"), { timeout: 30000 })
          .toBe("mounted");
        await page.waitForFunction(
          () => {
            const doc = (globalThis as unknown as {
              document: { querySelector(selector: string): RibbonCanvas | null };
            }).document;
            return (doc.querySelector('[data-island="widget"] canvas')?.__ribbon?.frames ?? 0) > 0;
          },
          undefined,
          { timeout: 30000 },
        );
        const before = await page.evaluate(() => {
          const doc = (globalThis as unknown as {
            document: { querySelector(selector: string): RibbonCanvas | null };
          }).document;
          return doc.querySelector('[data-island="widget"] canvas')?.__ribbon?.frames ?? 0;
        });
        await page.waitForTimeout(1500);
        const after = await page.evaluate(() => {
          const doc = (globalThis as unknown as {
            document: { querySelector(selector: string): RibbonCanvas | null };
          }).document;
          const canvas = doc.querySelector('[data-island="widget"] canvas');
          return {
            frames: canvas?.__ribbon?.frames ?? 0,
            ticking: canvas?.__ribbon?.ticking ?? true,
          };
        });
        expect(after.ticking).toBe(false);
        expect(after.frames).toBe(before);
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
      await server.close();
    }
  }, 120000);
});
