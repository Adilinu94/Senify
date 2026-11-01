// Prueft nach der Ursache-2-Korrektur, ob das Wort „strategy" im Import wieder
// Farbe hat: importiert `unifiersofjapan`, backt eine Seite und liest die
// Regel des Textknotens, der das Wort traegt.
//
// Usage: pnpm exec tsx .scratch/p3-7-punkt-15/pruefe-fuellung.ts

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { editorDocumentToNodeTree, fontFilesOf } from "@senify/engine";
import { bakeSite } from "@senify/renderer";
import { defaultTheme, emitCss, mergeThemePatch, resolveTheme } from "@senify/tokens";
import { runImport } from "../../packages/framer-import/src/index.ts";

const SOURCE_URL = "https://unifiersofjapan.framer.website/";

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
const dir = resolve(".scratch/p3-7-punkt-15/bilder/pruefung-fuellung");
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

const html = readFileSync(join(dir, "index.html"), "utf8");
const index = html.indexOf(">strategy<");
const tagStart = html.lastIndexOf("<", index);
const nodeId = /data-node-id="([^"]+)"/.exec(html.slice(html.lastIndexOf("<div", tagStart)))?.[1];
console.log("Wort-Traeger:", nodeId);

const cssFiles = [...html.matchAll(/href="([^"]+\.css)"/g)].map((match) => match[1]);
const css = cssFiles.map((file) => readFileSync(join(dir, file.replace(/^\//, "")), "utf8")).join("\n");
const rule = new RegExp(`\\[data-node-id="${nodeId}"\\]\\s*\\{([^}]*)\\}`, "s").exec(css)?.[1] ?? "(keine Regel)";
const color = /(?:^|[;\s])color:\s*([^;]+);/.exec(rule)?.[1] ?? "(keine Farbe)";
console.log("color:", color.trim());

const server = await (async () => {
  const { createServer } = await import("node:http");
  const mime: Record<string, string> = {
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
  const instance = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    try {
      const body = readFileSync(join(dir, path));
      response.writeHead(200, { "content-type": mime[extname(path).toLowerCase()] ?? "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => instance.listen(0, "127.0.0.1", () => done()));
  return { instance, url: `http://127.0.0.1:${(instance.address() as { port: number }).port}` };
})();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${server.url}/`, { waitUntil: "networkidle" });
  await page.evaluate(`(async () => {
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await wait(60);
    }
    window.scrollTo(0, 0);
    await wait(200);
  })()`);
  const sicht = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.trim() !== "strategy") continue;
      const element = node.parentElement;
      if (element === null) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { color: style.color, opacity: style.opacity, width: rect.width, height: rect.height };
    }
    return null;
  });
  console.log("gemessen:", JSON.stringify(sicht));
} finally {
  await browser.close();
  await new Promise<void>((done) => server.instance.close(() => done()));
}
