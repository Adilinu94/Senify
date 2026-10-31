// Messung zu P3-7 Punkt 15 (`unifiersofjapan`): Wo liegt die Abweichung?
//
// Der Blindtest nennt eine Zahl pro Seite; diese Probe schneidet dieselben
// Bilder in Bänder und vergleicht zusätzlich die Text- und Bildboxen beider
// Seiten. Sie ist ein Befund-Werkzeug, keine Tür: Zahlen werden berichtet.
//
// Usage: pnpm exec tsx .scratch/p3-7-punkt-15/messung.ts [desktop|tablet|mobile ...]

import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { editorDocumentToNodeTree, fontFilesOf } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, mergeThemePatch, resolveTheme } from "@senify/tokens";
import { runImport } from "../../packages/framer-import/src/index.ts";

const SOURCE_URL = "https://unifiersofjapan.framer.website/";
const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 900, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const BAND = 200;

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

async function settle(page: import("playwright").Page): Promise<void> {
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
    await globalThis.document.fonts.ready;
    await wait(400);
  })()`);
}

const TEXT_AND_IMAGES = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const texts = [];
  const elements = document.querySelectorAll("*");
  for (const element of elements) {
    let text = "";
    for (const child of element.childNodes) {
      if (child.nodeType === 3) text += child.textContent;
    }
    text = text.trim().replace(/\\s+/g, " ");
    if (text.length < 2) continue;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (Number.parseFloat(style.opacity) === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    texts.push({
      text: text.slice(0, 70),
      tag: element.tagName,
      top: round(rect.top + scrollY),
      height: round(rect.height),
      width: round(rect.width),
    });
  }
  const images = [];
  for (const image of document.querySelectorAll("img")) {
    const rect = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    if (style.display === "none" || rect.width < 1 || rect.height < 1) continue;
    images.push({
      src: (image.currentSrc || image.src || "").split("/").pop(),
      top: round(rect.top + scrollY),
      height: round(rect.height),
      width: round(rect.width),
    });
  }
  return { height: document.body.scrollHeight, texts, images };
})()`;

type Box = { text: string; tag: string; top: number; height: number; width: number };
type Probe = { height: number; texts: Box[]; images: { src: string; top: number; height: number; width: number }[] };

function bandReport(before: PNG, after: PNG): string[] {
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
  const rows: { from: number; to: number; percent: number; changed: number }[] = [];
  for (let from = 0; from < height; from += BAND) {
    const to = Math.min(height, from + BAND);
    const bandHeight = to - from;
    const crop = new PNG({ width, height: bandHeight });
    PNG.bitblt(a, crop, 0, from, width, bandHeight, 0, 0);
    const other = new PNG({ width, height: bandHeight });
    PNG.bitblt(b, other, 0, from, width, bandHeight, 0, 0);
    const diff = new PNG({ width, height: bandHeight });
    const changed = pixelmatch(crop.data, other.data, diff.data, width, bandHeight, { threshold: 0.1 });
    rows.push({ from, to, changed, percent: (changed / (width * bandHeight)) * 100 });
  }
  const worst = [...rows].sort((left, right) => right.percent - left.percent).slice(0, 14);
  const lines = worst.map(
    (row) => `    y ${String(row.from).padStart(5)}..${String(row.to).padStart(5)}  ${row.percent.toFixed(1).padStart(5)}%  (${row.changed} px)`,
  );
  const total = rows.reduce((sum, row) => sum + row.changed, 0);
  lines.push(`    gesamt ${((total / (width * height)) * 100).toFixed(2)}%`);
  return lines;
}

function compareBoxes(source: Probe, imported: Probe): string[] {
  const pool = new Map<string, Box[]>();
  for (const box of imported.texts) {
    const list = pool.get(box.text) ?? [];
    list.push(box);
    pool.set(box.text, list);
  }
  const misses: string[] = [];
  const rows: { text: string; dTop: number; dHeight: number; dWidth: number; top: number }[] = [];
  for (const box of source.texts) {
    const list = pool.get(box.text);
    if (list === undefined || list.length === 0) {
      misses.push(`    fehlt im Import: "${box.text}" (top ${box.top}, h ${box.height})`);
      continue;
    }
    const other = list.shift() as Box;
    rows.push({
      text: box.text,
      top: box.top,
      dTop: other.top - box.top,
      dHeight: other.height - box.height,
      dWidth: other.width - box.width,
    });
  }
  const off = rows
    .filter((row) => Math.abs(row.dTop) > 2 || Math.abs(row.dHeight) > 2 || Math.abs(row.dWidth) > 2)
    .sort((left, right) => Math.abs(right.dTop) + Math.abs(right.dHeight) - (Math.abs(left.dTop) + Math.abs(left.dHeight)))
    .slice(0, 25)
    .map(
      (row) =>
        `    "${row.text.slice(0, 40)}" top ${row.top}  dTop ${row.dTop.toFixed(1)}  dH ${row.dHeight.toFixed(1)}  dW ${row.dWidth.toFixed(1)}`,
    );
  return [...off, ...misses.slice(0, 15)];
}

const wanted = process.argv.slice(2).filter((argument) => ["desktop", "tablet", "mobile"].includes(argument));
const viewports = wanted.length > 0 ? WIDTHS.filter((item) => wanted.includes(item.name)) : WIDTHS;
const work = resolve(".scratch/p3-7-punkt-15/bilder");
mkdirSync(work, { recursive: true });

let counter = 0;
const uploads: { assetId: string; filename: string; data: Buffer }[] = [];
const uploader = async ({ filename, data }: { filename: string; mime: string; data: Buffer; alt: string | null }) => {
  counter += 1;
  const assetId = `up-${counter}`;
  uploads.push({ assetId, filename, data });
  return { assetId, url: `/assets/${assetId}/${filename}`, deduped: false };
};

const run = await runImport({ source: { kind: "url", url: SOURCE_URL }, mode: "fidelity", uploader });
const patch = fontFilesOf(run.mapped.themePatch, run.assets?.fonts ?? []);
const assets = Object.fromEntries(
  uploads.map((upload) => [upload.assetId, { src: `/assets/${upload.assetId}/${upload.filename}`, width: null, height: null }]),
);
const theme = mergeThemePatch(defaultTheme(), patch.fonts === undefined ? {} : { fonts: patch.fonts });
const resolved = resolveTheme(theme);
const dir = join(work, "unifiersofjapan");
mkdirSync(dir, { recursive: true });
await bakeSite(
  {
    siteName: "unifiersofjapan",
    baseUrl: "https://preview.local",
    breakpoints: run.breakpoints ?? undefined,
    pages: [{ id: "p", path: "/", title: "unifiersofjapan", tree: editorDocumentToNodeTree(run.mapped.document) }],
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
const browser = await chromium.launch();
try {
  for (const viewport of viewports) {
    const shots: Record<string, Buffer> = {};
    const probes: Record<string, Probe> = {};
    for (const [side, target] of [
      ["original", SOURCE_URL],
      ["import", `${server.url}/index.html`],
    ] as const) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settle(page);
      shots[side] = await page.screenshot({ fullPage: true });
      probes[side] = (await page.evaluate(TEXT_AND_IMAGES)) as Probe;
      writeFileSync(join(work, `${viewport.name}-${side}.png`), shots[side] as Buffer);
      await context.close();
    }
    const before = PNG.sync.read(shots["original"] as Buffer);
    const after = PNG.sync.read(shots["import"] as Buffer);
    console.log(`\n=== ${viewport.name} · ${before.width}x${before.height} -> ${after.width}x${after.height} ===`);
    console.log("  Bänder (200 px), die stärksten zuerst:");
    for (const line of bandReport(before, after)) console.log(line);
    console.log("  Textboxen (Quelle -> Import), Abweichung > 2 px:");
    const rows = compareBoxes(probes["original"] as Probe, probes["import"] as Probe);
    for (const line of rows.length === 0 ? ["    keine"] : rows) console.log(line);
    const sourceImages = (probes["original"] as Probe).images;
    const importImages = (probes["import"] as Probe).images;
    console.log(`  Bilder: Quelle ${sourceImages.length}, Import ${importImages.length}`);
    const imageRows: string[] = [];
    for (let index = 0; index < Math.max(sourceImages.length, importImages.length); index += 1) {
      const left = sourceImages[index];
      const right = importImages[index];
      if (left === undefined || right === undefined) {
        imageRows.push(`    Bild ${index}: fehlt auf einer Seite (${left?.src ?? "-"} / ${right?.src ?? "-"})`);
        continue;
      }
      if (Math.abs(left.top - right.top) > 2 || Math.abs(left.height - right.height) > 2) {
        imageRows.push(
          `    Bild ${index}: ${left.top} h${left.height} -> ${right.top} h${right.height} (dTop ${(right.top - left.top).toFixed(1)}, dH ${(right.height - left.height).toFixed(1)}) ${left.src} / ${right.src}`,
        );
      }
    }
    for (const line of imageRows.length === 0 ? ["    keine Abweichung > 2 px"] : imageRows.slice(0, 20)) console.log(line);
  }
} finally {
  await browser.close();
  await server.close();
}
