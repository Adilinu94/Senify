// Überschneidung: Welche appearIds kennt das SSR-Appear-JSON, welche sieht der
// Browser als laufende Animation? Nur die Differenz ist neuer Inhalt.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { listenReachable } from "@senify/core/net";
import { captureHtml } from "../../packages/framer-import/src/capture-html.ts";

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
    const ssr = await (await fetch(`${server.url}/index.html`)).text();
    const staticDoc = captureHtml({ html: ssr, url: `${server.url}/index.html`, pagePath: "/" });

    // appearIds im SSR-HTML
    const appearIdsSsr = new Set<string>();
    for (const match of ssr.matchAll(/data-framer-appear-id="([^"]+)"/g)) appearIdsSsr.add(match[1] as string);

    // appearIds in der IR-Motion (die das Appear-JSON erzeugt hat)
    const motionIdsIr = new Set(staticDoc.motion.map((s) => s.nodeKey));

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${server.url}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const browserIds = (await page.evaluate(`(() => {
      const ids = new Set();
      for (const a of (document.getAnimations ? document.getAnimations() : [])) {
        const el = a.effect && a.effect.target;
        if (!el) continue;
        const id = el.getAttribute('data-framer-appear-id');
        if (id) ids.add(id);
      }
      return [...ids];
    })()`)) as string[];

    const browserSet = new Set(browserIds);
    const onlyBrowser = [...browserSet].filter((id) => !appearIdsSsr.has(id));
    const both = [...browserSet].filter((id) => appearIdsSsr.has(id));
    console.log(JSON.stringify({
      fixture: name,
      ssrAppearIds: appearIdsSsr.size,
      irMotionSamples: staticDoc.motion.length,
      irMotionDistinctNodes: motionIdsIr.size,
      browserAnimatedIds: browserSet.size,
      inBoth: both.length,
      onlyBrowser: onlyBrowser.length,
      onlyBrowserSample: onlyBrowser.slice(0, 8),
    }));
    await page.close();
  } catch (error) {
    console.log(JSON.stringify({ fixture: name, error: error instanceof Error ? error.message : String(error) }));
  } finally {
    await browser.close();
    await server.close();
  }
}
