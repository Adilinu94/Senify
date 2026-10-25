// Messlauf: derselbe Mirror einmal statisch (fetch + captureHtml, der heutige
// Weg von runImport) und einmal über captureBrowser. Verglichen werden IR-Hash,
// Knotenzahl, Regeln, Funde und die Motion-Samples. Kein Test, nur eine Messung.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { listenReachable } from "@senify/core/net";
import { captureBrowser } from "@senify/framer-import";
import { captureHtml } from "../../packages/framer-import/src/capture-html.ts";

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

for (const name of fixtures) {
  const root = resolve(".", "packages", "framer-import", "test", "fixtures", name);
  const server = await serve(root);
  try {
    const html = await (await fetch(`${server.url}/index.html`)).text();
    const staticDoc = captureHtml({ html, url: `${server.url}/index.html`, pagePath: "/" });
    const browser = await captureBrowser({ url: `${server.url}/index.html`, settleMs: 400 });
    const out = {
      fixture: name,
      knots: [staticDoc.pages[0]?.root.children.length ?? 0, browser.document.pages[0]?.root.children.length ?? 0],
      motion: [staticDoc.motion.length, browser.document.motion.length],
      findings: [staticDoc.findings.length, browser.document.findings.length],
      breakpoints: [staticDoc.breakpoints.length, browser.document.breakpoints.length],
      kind: browser.document.source.kind,
      probe: browser.probe,
    };
    console.log(JSON.stringify(out));
  } catch (error) {
    console.log(JSON.stringify({ fixture: name, error: error instanceof Error ? error.message : String(error) }));
  } finally {
    await server.close();
  }
}
rmSync(mkdtempSync(join(tmpdir(), "unused-")), { recursive: true, force: true });
