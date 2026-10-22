// Was sind die WAAPI-Einträge wirklich? Typ, Name, Dauer, Playstate, Ziel.
// Erst danach ist entscheidbar, ob ein Sample eine Einblendung ist oder eine
// CSS-Transition, die zufällig noch läuft.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { listenReachable } from "@senify/core/net";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function serve(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    let body: Buffer;
    try {
      body = readFileSync(file);
    } catch {
      response.writeHead(404).end();
      return;
    }
    const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
    response.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" }).end(body);
  });
  return new Promise((done) =>
    listenReachable(server, 0, "127.0.0.1").then(() => {
      const port = (server.address() as { port: number }).port;
      done({ url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((end) => server.close(() => end())) });
    }),
  );
}

const fixtures = [
  "framer-stupendous-football-158496",
  "framer-easier-train-154753",
  "framer-fluffy-rectangle-418998",
];

const { chromium } = await import("playwright");

for (const name of fixtures) {
  const root = resolve(".", "packages", "framer-import", "test", "fixtures", name);
  const server = await serve(root);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${server.url}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const entries = (await page.evaluate(`(() => {
      const out = [];
      const sel = (el) => {
        if (!el || !el.tagName) return String(el);
        if (el.id) return '#' + el.id;
        const cls = typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
          : '';
        return el.tagName.toLowerCase() + cls;
      };
      for (const a of (document.getAnimations ? document.getAnimations() : []).slice(0, 80)) {
        const eff = a.effect;
        const t = eff && eff.getTiming ? eff.getTiming() : {};
        out.push({
          type: a.constructor.name,
          name: a.animationName || a.transitionProperty || a.id || null,
          target: eff && eff.target ? sel(eff.target) : null,
          playState: a.playState,
          duration: t.duration,
          iterations: t.iterations === Infinity ? 'Infinity' : t.iterations,
          timeline: a.timeline ? a.timeline.constructor.name : null,
          keyframes: eff && eff.getKeyframes ? eff.getKeyframes().slice(0, 3).map((k) => Object.keys(k).filter((x) => !['offset','computedOffset','easing','composite'].includes(x)).join(',')).join(' | ') : null,
        });
      }
      return out;
    })()`)) as Array<Record<string, unknown>>;
    const summary: Record<string, number> = {};
    for (const e of entries) {
      const key = `${e["type"]}/${e["playState"]}/${e["timeline"]}`;
      summary[key] = (summary[key] ?? 0) + 1;
    }
    console.log(JSON.stringify({ fixture: name, total: entries.length, summary, sample: entries.slice(0, 6) }, null, 1));
  } catch (error) {
    console.log(JSON.stringify({ fixture: name, error: error instanceof Error ? error.message : String(error) }));
  } finally {
    await browser.close();
    await server.close();
  }
}
