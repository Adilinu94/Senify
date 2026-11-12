// Befund 7: Effektive Icon-Farbe /price — Original (<use>+Maske) vs Build (inline-Pfade).
import { writeFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = "https://chocolate-attributes-385353.framer.app";
const BUILD = resolve("C:/Users/adini/.senify/previews/H-OXzxq_XvLirh");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2",
};
function serve(root: string): Promise<{ server: ReturnType<typeof createServer>; url: string }> {
  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
      let f = normalize(join(root, p));
      if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
      if (p.endsWith("/") || !extname(f)) f = join(f, "index.html");
      const d = await readFile(f);
      res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
      res.end(d);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => {
    const a = server.address(); if (a === null || typeof a === "string") throw new Error("port");
    ok({ server, url: `http://127.0.0.1:${a.port}` });
  }));
}

// Findet die Check-Icons der Preis-Featurelisten und misst ihre Render-Farbe.
const SCRIPT = () => {
  const out: unknown[] = [];
  // Alle svg-Elemente, die wie ein Icon aussehen (klein, quadratisch) und Pfade/use enthalten.
  const svgs = [...document.querySelectorAll("svg")];
  for (const svg of svgs) {
    const r = svg.getBoundingClientRect();
    if (r.width < 8 || r.width > 40 || r.height < 8 || r.height > 40) continue;
    const cs = getComputedStyle(svg);
    // Effektive Farbe: entweder maskiertes Eltern-div (background) oder svg-fill/stroke.
    let host: Element = svg;
    let hostCs = cs;
    let masked = false;
    let cur: Element | null = svg;
    while (cur && cur !== document.body) {
      const c = getComputedStyle(cur);
      if ((c.maskImage && c.maskImage !== "none") || (c.webkitMaskImage && c.webkitMaskImage !== "none")) {
        host = cur; hostCs = c; masked = true; break;
      }
      cur = cur.parentElement;
    }
    const paths = [...svg.querySelectorAll("path")];
    const pathInfo = paths.slice(0, 3).map((p) => {
      const pc = getComputedStyle(p);
      return { fill: pc.fill, fillOpacity: pc.fillOpacity, stroke: pc.stroke, strokeWidth: pc.strokeWidth };
    });
    const use = svg.querySelector("use");
    out.push({
      node: svg.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      visible: r.width > 0 && cs.visibility !== "hidden" && cs.display !== "none",
      masked,
      hostBackground: hostCs.backgroundColor,
      hostMask: (hostCs.maskImage || hostCs.webkitMaskImage || "").slice(0, 60),
      svgColor: cs.color,
      useHref: use?.getAttribute("href") ?? null,
      paths: pathInfo,
    });
    if (out.length >= 50) break;
  }
  return out;
};

const { server, url } = await serve(BUILD);
const browser = await chromium.launch({ headless: true });
const ergebnis: Record<string, unknown> = {};
try {
  for (const [label, base] of [["original", ORIGIN], ["build", url]] as const) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${base}/price`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await sleep(50); }
      window.scrollTo(0, 0); await sleep(300);
    });
    await page.waitForTimeout(1200);
    ergebnis[label] = await page.evaluate(SCRIPT);
    await page.close();
  }
} finally { await browser.close(); server.close(); }
writeFileSync(resolve(".scratch/choc-icon-color.json"), JSON.stringify(ergebnis, null, 2));
for (const label of ["original", "build"]) {
  const arr = ergebnis[label] as Array<Record<string, unknown>>;
  console.log(`\n=== ${label}: ${arr.length} Icons ===`);
  console.log("maskiert:", arr.filter((i) => i.masked).length);
  // Zeige die ersten 3 mit y>600 (Featurelisten, nicht Header-Logo)
  const feat = arr.filter((i) => (i.y as number) > 400);
  console.log(JSON.stringify(feat.slice(0, 3), null, 1));
}