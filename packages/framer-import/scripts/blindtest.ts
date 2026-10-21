// The blind test (step 3 of `docs/fahrplan-framer-1zu1.md`): ten foreign Framer
// sites that are NOT the fixtures and NOT the Earn template. The fixtures are
// the pages the import was tuned against; a change that only helps them proves
// nothing about the next site. This run answers two questions:
//
//   1. Does the import survive the page at all (capture → map → bake)?
//   2. How far is the baked page from the source, in pixels and in height?
//
// It is a diagnostic, not a gate: the numbers are reported, nothing fails. A
// gate on foreign pages would need a stable set, and public sites change.
//
// Usage:
//   pnpm exec tsx packages/framer-import/scripts/blindtest.ts
//   pnpm exec tsx packages/framer-import/scripts/blindtest.ts https://a.example/ https://b.example/
//
// The height comparison is the point of the second version: the older script
// cut both screenshots to the shorter one, so a page that was 3000 px too short
// still scored 0 % below the fold. Here the taller canvas is the frame and the
// missing strip counts as different — the same rule `diffScreenshots` uses.

import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { editorDocumentToNodeTree, fontFilesOf } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, mergeThemePatch, resolveTheme } from "@senify/tokens";
import { runImport } from "../src/index.ts";

// The ten sites measured on 21.10.2026, plus a few that were added later. A
// public site can disappear or change; a failure here reports the URL, it does
// not stop the run.
const DEFAULT_TARGETS = [
  "https://wedge.framer.website/",
  "https://donutshop.framer.website/",
  "https://last-studio.framer.website/",
  "https://refined.framer.website/",
  "https://notes.framer.website/",
  "https://receivio.framer.website/",
  "https://meeko.framer.website/",
  "https://unifiersofjapan.framer.website/",
];

const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 900, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

function serve(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    let body: Buffer;
    try {
      body = readFileSync(file);
    } catch {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" })
      .end(body);
  });
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      done({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((end) => server.close(() => end())),
      });
    }),
  );
}

// The source starts its sections at the appear state. Only scrolling through
// the page lets the reveals play; without that the comparison measures the
// start state of the source against the end state of the import, and every
// text of the source comes out 25 % too narrow.
//
// The DOM types are declared locally: this repository compiles without `lib.dom`
// on purpose (the engine must not reach for browser globals), so a script that
// runs in the page names the few shapes it uses. The function below is passed as
// source text, so it reads `globalThis` rather than these names — they document
// the contract and keep the reviewer from guessing which globals exist.
type PageWindow = {
  innerHeight: number;
  scrollTo(x: number, y: number): void;
};
type PageDocument = {
  body: { scrollHeight: number };
  querySelectorAll(selector: string): ArrayLike<unknown>;
};
type PageGlobals = {
  window: PageWindow;
  document: PageDocument;
  getComputedStyle(element: unknown): { opacity: string };
  setTimeout(handler: () => void, timeout: number): unknown;
};
export type { PageGlobals };

async function settleSources(page: import("playwright").Page): Promise<void> {
  // `page.evaluate` receives the function as source text, and the bundler wraps
  // local helpers in `__name(...)` — a Node-side helper that does not exist in
  // the page. Everything the browser runs is therefore written inline.
  await page.evaluate(`(async () => {
    const globals = globalThis;
    const wait = (ms) => new Promise((resolve) => { globals.setTimeout(() => resolve(), ms); });
    const step = Math.max(200, Math.floor(globals.window.innerHeight * 0.8));
    for (let y = 0; y < globals.document.body.scrollHeight; y += step) {
      globals.window.scrollTo(0, y);
      await wait(240);
    }
    globals.window.scrollTo(0, 0);
    await wait(600);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const elements = globals.document.querySelectorAll("*");
      let open = false;
      for (let index = 0; index < elements.length; index += 1) {
        if (Number.parseFloat(globals.getComputedStyle(elements[index]).opacity) < 0.99) {
          open = true;
          break;
        }
      }
      if (!open) break;
      await wait(220);
    }
  })()`);
}

// Pixel difference over the TALLER canvas: the missing strip of the shorter
// image counts as different. Cutting both to the shorter one hides exactly the
// failure this run is looking for (a page that lost its lower half).
function diffOverTaller(before: PNG, after: PNG): { percent: number; height: number } {
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const frame = (image: PNG): PNG => {
    if (image.width === width && image.height === height) return image;
    const out = new PNG({ width, height });
    PNG.bitblt(image, out, 0, 0, image.width, image.height, 0, 0);
    return out;
  };
  const a = frame(before);
  const b = frame(after);
  const diff = new PNG({ width, height });
  const changed = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });
  return { percent: (changed / (width * height)) * 100, height };
}

const targets = process.argv.slice(2).filter((argument) => argument.startsWith("http"));
const urls = targets.length > 0 ? targets : DEFAULT_TARGETS;
const work = resolve("_blindtest");
mkdirSync(work, { recursive: true });
const browser = await chromium.launch();
const rows: string[] = [];
const failures: string[] = [];

for (const url of urls) {
  const name = new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-");
  let counter = 0;
  const uploads: { assetId: string; filename: string; data: Buffer }[] = [];
  const uploader = async ({ filename, data }: { filename: string; mime: string; data: Buffer; alt: string | null }) => {
    counter += 1;
    const assetId = `up-${counter}`;
    uploads.push({ assetId, filename, data });
    return { assetId, url: `/assets/${assetId}/${filename}`, deduped: false };
  };
  try {
    const run = await runImport({ source: { kind: "url", url }, mode: "fidelity", uploader });
    const patch = fontFilesOf(run.mapped.themePatch, run.assets?.fonts ?? []);
    const assets = Object.fromEntries(
      uploads.map((upload) => [
        upload.assetId,
        { src: `/assets/${upload.assetId}/${upload.filename}`, width: null, height: null },
      ]),
    );
    const theme = mergeThemePatch(defaultTheme(), patch.fonts === undefined ? {} : { fonts: patch.fonts });
    const resolved = resolveTheme(theme);
    const dir = join(work, name);
    mkdirSync(dir, { recursive: true });
    await bakeSite(
      {
        siteName: name,
        baseUrl: "https://preview.local",
        breakpoints: run.breakpoints ?? undefined,
        pages: [{ id: "p", path: "/", title: name, tree: editorDocumentToNodeTree(run.mapped.document) }],
        themeCss: emitCss(resolved),
        styleRules: run.mapped.rules,
        assets,
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        aeo: false,
      },
      { outDir: dir, selfContained: true },
    );
    for (const upload of uploads) {
      const assetDir = join(dir, "assets", upload.assetId);
      mkdirSync(assetDir, { recursive: true });
      writeFileSync(join(assetDir, upload.filename), upload.data);
    }
    const server = await serve(dir);
    try {
      const parts: string[] = [];
      for (const viewport of WIDTHS) {
        const shots: Record<string, Buffer> = {};
        for (const [side, target] of [
          ["original", url],
          ["import", `${server.url}/index.html`],
        ] as const) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 1,
            reducedMotion: "reduce",
          });
          const page = await context.newPage();
          await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await settleSources(page);
          await page.evaluate(`(async () => { await globalThis.document.fonts.ready; })()`);
          await page.waitForTimeout(2000);
          shots[side] = await page.screenshot({ fullPage: true });
          await context.close();
        }
        const before = PNG.sync.read(shots["original"] as Buffer);
        const after = PNG.sync.read(shots["import"] as Buffer);
        const { percent } = diffOverTaller(before, after);
        parts.push(
          `${viewport.name} ${percent.toFixed(2)}% (${before.height}->${after.height}, ${after.height - before.height}px)`,
        );
      }
      rows.push(
        `${name.padEnd(30)} ${parts.join("  ")}  nodes=${run.report.counts.nodes} score=${run.report.score}`,
      );
    } finally {
      await server.close();
    }
  } catch (error) {
    failures.push(`${name}: ${String(error).slice(0, 220)}`);
  }
}

await browser.close();
console.log("\n=== Blindtest foreign Framer sites (desktop / tablet / mobile) ===");
for (const row of rows) console.log(`  ${row}`);
if (failures.length > 0) {
  console.log("\n=== Failed ===");
  for (const failure of failures) console.log(`  ${failure}`);
}
