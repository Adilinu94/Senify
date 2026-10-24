// Tragen die WAAPI-Ziele einen Schlüssel, den der IR kennt? Gemessen werden
// data-framer-appear-id, data-framer-name und data-framer-component-type.
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
    await page.waitForTimeout(2500);
    const result = (await page.evaluate(`(() => {
      const rows = [];
      for (const a of (document.getAnimations ? document.getAnimations() : [])) {
        const el = a.effect && a.effect.target;
        if (!el) continue;
        rows.push({
          appearId: el.getAttribute('data-framer-appear-id'),
          name: el.getAttribute('data-framer-name'),
          componentType: el.getAttribute('data-framer-component-type'),
          animationName: a.animationName || null,
          transitionProperty: a.transitionProperty || null,
          id: el.id || null,
        });
      }
      return rows;
    })()`)) as Array<Record<string, unknown>>;
    const withAppear = result.filter((r) => r["appearId"] !== null).length;
    const withName = result.filter((r) => r["name"] !== null).length;
    const animated = new Set(result.map((r) => `${r["appearId"]}|${r["name"]}|${r["id"]}`));
    console.log(JSON.stringify({
      fixture: name,
      entries: result.length,
      uniqueElements: animated.size,
      withAppearId: withAppear,
      withFramerName: withName,
      distinctAppearIds: new Set(result.map((r) => r["appearId"]).filter(Boolean)).size,
      sample: result.slice(0, 4),
    }, null, 1));
  } finally {
    await browser.close();
    await server.close();
  }
}
