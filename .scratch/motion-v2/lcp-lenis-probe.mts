// Messskript (nicht Teil der Suite): LCP einer gebackenen Seite mit nur einem
// CSS-Einlauf, Slow 4G + 4x CPU, Median aus N Läufen.
//   pnpm exec tsx .scratch/motion-v2/lcp-lenis-probe.mts <label>
// Backt die Fixture aus bake-css-entry.test.ts (Seite "nur-css") und gibt
// Skript-Tags, LCP-Läufe und den Median aus.
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, existsSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";
import { bundledSections } from "@senify/registry";
import type { GoldenNode, Node, NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { bakeSite } from "@senify/renderer";

const label = process.argv[2] ?? "probe";
const RUNS = 9;

let counter = 0;
function place(golden: GoldenNode, nodes: Record<string, Node>, parentId: string): string {
  const id = `ce${counter++}`;
  const parent = nodes[parentId];
  if (!parent) throw new Error(`Missing parent ${parentId}`);
  parent.children = [...(parent.children ?? []), id];
  nodes[id] = { id, type: golden.type, variant: golden.variant, props: { ...golden.props } };
  for (const child of golden.children ?? []) place(child, nodes, id);
  return id;
}
function tree(sections: { type: string; motion?: Node["motion"] }[]): NodeTree {
  const nodes: Record<string, Node> = { root: { id: "root", type: "page", props: {} } };
  for (const section of sections) {
    const definition = bundledSections.find((entry) => entry.type === section.type);
    if (!definition) throw new Error(`Unknown section ${section.type}`);
    const id = place(definition.golden.tree, nodes, "root");
    const node = nodes[id];
    if (node && section.motion) node.motion = section.motion;
  }
  return { rootNodeId: "root", nodes };
}

const resolved = resolveTheme(defaultTheme());
const outRoot = mkdtempSync(join(tmpdir(), "lcp-probe-"));
const baked = await bakeSite(
  {
    siteName: "Musterstudio",
    baseUrl: "https://beispiel.de",
    pages: [
      {
        id: "p-only",
        path: "/nur-css",
        title: "Nur CSS",
        tree: tree([{ type: "hero", motion: { preset: "fade-up", intensity: 6 } }, { type: "stats" }]),
      },
    ],
    themeCss: emitCss(resolved),
    motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
    profile: "standard",
  },
  { outDir: join(outRoot, "dist") },
);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".json": "application/json",
};
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(baked.outDir, rel);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;

const html = readFileSync(join(baked.outDir, "nur-css", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script[^>]*>/g)].map((m) => m[0]);
console.log(`[${label}] script tags: ${JSON.stringify(scripts)}`);

const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const lcps: number[] = [];
for (let run = 0; run < RUNS; run += 1) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __cands: string[] };
    w.__lcp = 0;
    w.__cands = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { startTime: number; size: number; element?: Element }[]) {
        w.__lcp = entry.startTime;
        w.__cands.push(`${Math.round(entry.startTime)}ms ${entry.element?.tagName ?? "?"} size=${entry.size}`);
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto(`http://127.0.0.1:${port}/nur-css/`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const lenisActive = await page.evaluate(
    () => typeof (window as unknown as { Lenis?: unknown }).Lenis !== "undefined",
  );
  const lcp = await page.evaluate(() => (window as unknown as { __lcp: number }).__lcp);
  lcps.push(Math.round(lcp));
  if (run === 0) {
    const detail = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return { load: Math.round(nav.loadEventStart), cands: (window as unknown as { __cands: string[] }).__cands };
    });
    console.log(`[${label}] window.Lenis geladen: ${lenisActive}; load-Event bei ${detail.load}ms; LCP-Kandidaten: ${JSON.stringify(detail.cands)}`);
  }
  await context.close();
}
await browser.close();
server.close();
rmSync(outRoot, { recursive: true, force: true });
const sorted = [...lcps].sort((a, b) => a - b);
console.log(`[${label}] LCP-Läufe (ms): ${lcps.join(", ")}  Median: ${sorted[Math.floor(sorted.length / 2)]}`);
