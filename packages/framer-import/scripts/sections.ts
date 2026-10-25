// The section measurement (the diagnosis of the STRUCTURE tree).
//
// The release shows the original page (the runtime payload carries it), but
// the editor's tree is still the approximation — and on some pages it is
// 20-37 % off. This script finds WHERE: it bakes the structure (without the
// payload carrier) and compares the page section by section — the children of
// the page's main container, with their height and a text fingerprint.
//
// The output is the difference per section, biggest first. It is how the
// invisible texts of `notes.framer.website` were found: the headings had a
// height of 0, because Framer measures the words (`font-size: 0`) and the
// import took the measuring zero as the size.
//
// Usage:
//   pnpm exec tsx packages/framer-import/scripts/sections.ts
//   pnpm exec tsx packages/framer-import/scripts/sections.ts https://a.example/
//
// It writes to `_messung/` (ignored by git).

import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { editorDocumentToNodeTree, fontFilesOf } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, mergeThemePatch, resolveTheme } from "@senify/tokens";
import { runImport } from "../src/index.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".mjs": "text/javascript",
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

const url = process.argv[2] ?? "https://notes.framer.website/";
const work = resolve("_messung/sections");
mkdirSync(work, { recursive: true });

let counter = 0;
const uploads: { assetId: string; filename: string; data: Buffer }[] = [];
const uploader = async ({ filename, data }: { filename: string; mime: string; data: Buffer; alt: string | null }) => {
  counter += 1;
  const assetId = `up-${counter}`;
  uploads.push({ assetId, filename, data });
  return { assetId, url: `/assets/${assetId}/${filename}`, deduped: false };
};

const run = await runImport({ source: { kind: "url", url }, mode: "fidelity", uploader });

// The structure variant: the carrier of the runtime payload is removed, so
// the bake shows the tree the editor works on.
const document = { ...run.mapped.document, nodes: { ...run.mapped.document.nodes } };
const root = document.nodes[document.rootNodeId];
if (root !== undefined) {
  root.children = (root.children ?? []).filter((id) => {
    const node = document.nodes[id];
    if (node === undefined || node.primitive !== "payload") return true;
    delete document.nodes[id];
    return false;
  });
}

const patch = fontFilesOf(run.mapped.themePatch, run.assets?.fonts ?? []);
const assets = Object.fromEntries(
  uploads.map((upload) => [
    upload.assetId,
    { src: `/assets/${upload.assetId}/${upload.filename}`, width: null, height: null },
  ]),
);
const theme = mergeThemePatch(defaultTheme(), patch.fonts === undefined ? {} : { fonts: patch.fonts });
const resolved = resolveTheme(theme);
const dir = join(work, "site");
mkdirSync(dir, { recursive: true });
await bakeSite(
  {
    siteName: "Struktur",
    baseUrl: "https://preview.local",
    breakpoints: run.breakpoints ?? undefined,
    pages: [{ id: "p", path: "/", title: "Struktur", tree: editorDocumentToNodeTree(document) }],
    themeCss: emitCss(resolved),
    styleRules: run.mapped.rules,
    assets,
    motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
    aeo: false,
  },
  { outDir: dir, selfContained: false },
);
for (const upload of uploads) {
  const assetDir = join(dir, "assets", upload.assetId);
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, upload.filename), upload.data);
}

function serve(rootDir: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(rootDir, `.${path}`);
    if (!file.startsWith(rootDir + sep) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" })
      .end(readFileSync(file));
  });
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      done({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((end) => server.close(() => end())) });
    }),
  );
}

const server = await serve(dir);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});

const MEASURE = `(() => {
  const g = globalThis;
  const main = g.document.querySelector('#main') || g.document.body;
  const describe = (node, depth) => {
    if (depth > 3) return null;
    const rect = node.getBoundingClientRect();
    const text = (node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30);
    return {
      depth,
      tag: node.tagName.toLowerCase(),
      cls: (node.className && typeof node.className === 'string' ? node.className : '').split(' ').filter(Boolean).slice(0, 2).join('.'),
      y: Math.round(rect.top + g.scrollY),
      h: Math.round(rect.height),
      text,
      children: Array.from(node.children).slice(0, 12).map((child) => describe(child, depth + 1)).filter(Boolean),
    };
  };
  return { shape: Array.from(main.children).map((child) => describe(child, 0)), height: g.document.body.scrollHeight };
})()`;

async function measure(target: string): Promise<{ shape: unknown[]; height: number }> {
  const page = await context.newPage();
  await page.goto(target, { waitUntil: "load", timeout: 60_000 });
  await page.evaluate(`(async () => {
    const g = globalThis;
    const wait = (ms) => new Promise((r) => { g.setTimeout(() => r(), ms); });
    const step = Math.max(200, Math.floor(g.window.innerHeight * 0.8));
    for (let y = 0; y < g.document.body.scrollHeight; y += step) { g.window.scrollTo(0, y); await wait(200); }
    g.window.scrollTo(0, 0);
    await wait(700);
  })()`);
  await page.waitForTimeout(1500);
  const result = (await page.evaluate(MEASURE)) as { shape: unknown[]; height: number };
  await page.close();
  return result;
}

const before = await measure(url);
const after = await measure(`${server.url}/index.html`);

type Shape = { depth: number; tag: string; cls: string; y: number; h: number; text: string; children: Shape[] };

const print = (nodes: Shape[], indent: string): void => {
  for (const node of nodes) {
    console.log(
      `${indent}${node.tag}.${node.cls} y=${node.y} h=${node.h} "${node.text}"`,
    );
    print(node.children, `${indent}  `);
  }
};

console.log("=== Quelle ===");
print(before.shape as Shape[], "  ");
console.log(`Hoehe: ${before.height} px`);
console.log("");
console.log("=== Import ===");
print(after.shape as Shape[], "  ");
console.log(`Hoehe: ${after.height} px`);

await browser.close();
await server.close();


