// Der eine Fall, den nur der Browser kann: Inhalt, den erst JavaScript füllt.
// Nachgebaut nach dem gemessenen Befund an der Earn-Seite (fünf leere
// display:contents-Platzhalter, die eine Code-Komponente erst im Browser füllt).
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { listenReachable } from "@senify/core/net";
import { captureHtml } from "../../packages/framer-import/src/capture-html.ts";
import { captureBrowser, runImport } from "@senify/framer-import";

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>JS-Inhalt</title></head>
<body><div id="main" data-framer-hydrate-v2>
  <div data-framer-name="Bewertung" id="rating">
    <div class="slot" data-slot="1" style="display:contents"></div>
    <div class="slot" data-slot="2" style="display:contents"></div>
    <div class="slot" data-slot="3" style="display:contents"></div>
  </div>
  <p>Fester Text</p>
</div>
<script>
  for (const slot of document.querySelectorAll('.slot')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 256 256');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M128 0 L158 90 L256 90 Z');
    svg.appendChild(path);
    slot.appendChild(svg);
  }
</script></body></html>`;

const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
});
await new Promise<void>((done) => listenReachable(server, 0, "127.0.0.1").then(() => done()));
const port = (server.address() as { port: number }).port;
const url = `http://127.0.0.1:${port}/`;

try {
  const html = await (await fetch(url)).text();
  const staticDoc = captureHtml({ html, url, pagePath: "/" });
  const stats = (doc: { pages: Array<{ root: unknown }> }): { nodes: number; svg: number; text: string } => {
    let nodes = 0;
    let svg = 0;
    let text = "";
    const visit = (node: { children: unknown[]; kind: string; text?: { content: string } | null; svg: unknown }): void => {
      nodes += 1;
      if (node.kind === "svg" || node.svg !== null) svg += 1;
      text += node.text?.content ?? "";
      for (const child of node.children as typeof node[]) visit(child);
    };
    visit(doc.pages[0]!.root as never);
    return { nodes, svg, text };
  };
  const browser = await captureBrowser({ url, settleMs: 200 });

  console.log(JSON.stringify({
    statisch: stats(staticDoc),
    browser: stats(browser.document),
    irMotionStatisch: staticDoc.motion.length,
    irMotionBrowser: browser.document.motion.length,
  }, null, 1));
} finally {
  await new Promise<void>((done) => server.close(() => done()));
}
