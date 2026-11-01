import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(".scratch/p3-7-punkt-15/bilder/unifiersofjapan");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = createServer((request, response) => {
  let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = resolve(ROOT, `.${path}`);
  if (!file.startsWith(ROOT + sep)) return response.writeHead(403).end();
  try { response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" }).end(readFileSync(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const out = await page.evaluate(`(() => {
  const pick = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      node: element.getAttribute("data-node-id"),
      classes: element.className,
      rect: [rect.left, rect.top, rect.width, rect.height].map((value) => Math.round(value * 10) / 10),
      width: style.width, maxWidth: style.maxWidth, flex: style.flex, margin: style.margin, padding: style.padding,
      display: style.display, justify: style.justifyContent, boxSizing: style.boxSizing, zoom: style.zoom,
      transform: style.transform, inline: element.getAttribute("style"),
    };
  };
  const node = document.querySelector('[data-node-id="fi681"]');
  const parent = node.parentElement;
  return {
    node: pick(node),
    parent: pick(parent),
    parentChildren: [...parent.children].map(pick),
    wrap: [node.parentElement.parentElement, node.parentElement.parentElement.parentElement].map(pick),
  };
})()`);
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
