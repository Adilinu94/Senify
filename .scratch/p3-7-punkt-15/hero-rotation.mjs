// Woher kommt die 30-Grad-Drehung des Kimono-SVGs, und warum fehlt sie im
// Import? Gleiches SVG (viewBox 991x1148) auf beiden Seiten, acht Vorfahren
// mit Klassen, Inline-Style und gerechneter Transform.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const SOURCE = "https://unifiersofjapan.framer.website/";
const ROOT = resolve(".scratch/p3-7-punkt-15/bilder/unifiersofjapan");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".gif": "image/gif",
};

function serve(root) {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    let body;
    try {
      body = readFileSync(file);
    } catch {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" }).end(body);
  });
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      done({ url: `http://127.0.0.1:${port}`, close: () => new Promise((end) => server.close(() => end())) });
    }),
  );
}

const CHAIN = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const target = document.querySelector('svg[viewBox="0 0 991 1148"]');
  if (target === null) return ["kein SVG mit viewBox 0 0 991 1148"];
  const out = [];
  let node = target;
  for (let depth = 0; depth < 9 && node !== null; depth += 1) {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    out.push({
      depth,
      tag: node.tagName.toLowerCase(),
      classes: [...node.classList].join(" "),
      inline: (node.getAttribute("style") ?? "").slice(0, 220),
      computedTransform: style.transform,
      box: round(rect.width) + "x" + round(rect.height) + " @ " + round(rect.top + scrollY) + "," + round(rect.left),
    });
    node = node.parentElement;
  }
  return out;
})()`;

const server = await serve(ROOT);
const browser = await chromium.launch();
try {
  for (const [side, target] of [
    ["quelle", SOURCE],
    ["import", `${server.url}/index.html`],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3000);
    console.log(`\n######## ${side} ########`);
    for (const row of await page.evaluate(CHAIN)) {
      console.log(`[${row.depth}] ${row.tag} · ${row.box} · transform ${row.computedTransform}`);
      console.log(`    klassen "${row.classes}"`);
      console.log(`    inline "${row.inline}"`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
