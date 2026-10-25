// Welche Elemente meldet der Sensor? Erst die Liste ansehen, dann filtern.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { listenReachable } from "@senify/core/net";

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };

function serve(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    let body: Buffer;
    try { body = readFileSync(file); } catch { response.writeHead(404).end(); return; }
    const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
    response.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" }).end(body);
  });
  return new Promise((done) => listenReachable(server, 0, "127.0.0.1").then(() => {
    const port = (server.address() as { port: number }).port;
    done({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((end) => server.close(() => end())) });
  }));
}

const fixtures = ["framer-stupendous-football-158496", "framer-easier-train-154753", "framer-fluffy-rectangle-418998"];
const { chromium } = await import("playwright");

for (const name of fixtures) {
  const root = resolve(".", "packages", "framer-import", "test", "fixtures", name);
  const server = await serve(root);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${server.url}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const sample = `(() => {
      const rows = [];
      for (const el of document.querySelectorAll('#main *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(el);
        rows.push({
          tag: el.tagName.toLowerCase(),
          name: el.getAttribute('data-framer-name'),
          pos: cs.position,
          transform: cs.transform === 'none' ? null : cs.transform.slice(0, 40),
          top: Math.round(r.top),
        });
        if (rows.length >= 400) break;
      }
      return rows;
    })()`;
    const before = (await page.evaluate(sample)) as Array<Record<string, unknown>>;
    await page.evaluate(async () => {
      const h = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += h) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    await page.waitForTimeout(600);
    const after = (await page.evaluate(sample)) as Array<Record<string, unknown>>;
    const afterByKey = new Map(after.map((r, i) => [`${i}`, r]));
    const scrolled = (await page.evaluate("window.scrollY")) as number;
    const rows: Array<{ index: number; name: unknown; pos: unknown; transform: unknown; deviation: number }> = [];
    before.forEach((b, i) => {
      const a = afterByKey.get(`${i}`);
      if (!a) return;
      const deviation = (Number(b["top"]) - Number(a["top"])) - scrolled;
      if (Math.abs(deviation) > 8) {
        rows.push({ index: i, name: b["name"], pos: b["pos"], transform: a["transform"], deviation: Math.round(deviation) });
      }
    });
    const byPos: Record<string, number> = {};
    for (const r of rows) byPos[String(r.pos)] = (byPos[String(r.pos)] ?? 0) + 1;
    console.log(JSON.stringify({ fixture: name, scrolled, hits: rows.length, byPos, sample: rows.slice(0, 5) }, null, 1));
    await page.close();
  } finally {
    await browser.close();
    await server.close();
  }
}
