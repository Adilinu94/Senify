// Liefert der Browser INHALT, den das SSR nicht hat? Bekanntes Beispiel:
// die fünf Bewertungssterne (viewBox 0 0 256 256) fehlen im Server-HTML.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { listenReachable } from "@senify/core/net";
import { captureHtml } from "../../packages/framer-import/src/capture-html.ts";
import { captureBrowser } from "@senify/framer-import";

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

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

const fixtures = ["framer-stupendous-football-158496", "framer-easier-train-154753", "framer-fluffy-rectangle-418998"];

for (const name of fixtures) {
  const root = resolve(".", "packages", "framer-import", "test", "fixtures", name);
  const server = await serve(root);
  try {
    const ssr = await (await fetch(`${server.url}/index.html`)).text();
    const browser = await captureBrowser({ url: `${server.url}/index.html`, settleMs: 800 });
    // Dasselbe Dokument nochmal statisch, damit beide Wege vergleichbar sind.
    const staticDoc = captureHtml({ html: ssr, url: `${server.url}/index.html`, pagePath: "/" });
    const nodes = (doc: { pages: Array<{ root: { children: unknown[] } }> }): number => {
      let total = 0;
      const visit = (node: { children: unknown[] }): void => {
        total += 1;
        for (const child of node.children as { children: unknown[] }[]) visit(child);
      };
      visit(doc.pages[0]!.root);
      return total;
    };
    const textOf = (doc: { pages: Array<{ root: { children: unknown[] } }> }): number => {
      let length = 0;
      const visit = (node: { children: unknown[]; text?: { content: string } | null }): void => {
        length += node.text?.content.length ?? 0;
        for (const child of node.children as { children: unknown[]; text?: { content: string } | null }[]) visit(child);
      };
      visit(doc.pages[0]!.root);
      return length;
    };
    console.log(JSON.stringify({
      fixture: name,
      sterneImSsr: count(ssr, 'viewBox="0 0 256 256"'),
      knotsStatic: nodes(staticDoc),
      knotsBrowser: nodes(browser.document),
      textStatic: textOf(staticDoc),
      textBrowser: textOf(browser.document),
      ssrBytes: ssr.length,
    }));
  } catch (error) {
    console.log(JSON.stringify({ fixture: name, error: error instanceof Error ? error.message : String(error) }));
  } finally {
    await server.close();
  }
}
