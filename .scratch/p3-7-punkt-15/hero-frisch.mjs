// Befund zu P3-7 Punkt 15: sieht der Hero im Import schon beim FRISCHEN
// Laden falsch aus, oder erst nach dem Scroll-Durchlauf der Messung?
// Vier Bilder: Quelle und Import je frisch und nach dem Settle.
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
  ".avif": "image/avif",
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

const SETTLE = `(async () => {
  const globals = globalThis;
  const wait = (ms) => new Promise((resolve) => { globals.setTimeout(() => resolve(), ms); });
  const step = Math.max(200, Math.floor(globals.window.innerHeight * 0.8));
  for (let y = 0; y < globals.document.body.scrollHeight; y += step) {
    globals.window.scrollTo(0, y);
    await wait(240);
  }
  globals.window.scrollTo(0, 0);
  await wait(600);
  await globalThis.document.fonts.ready;
  await wait(400);
})()`;

// Die grossen SVG-Flächen im Hero mit ihrem Rechenweg (Transform-Kette).
const LAYERS = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const chain = (element) => {
    const parts = [];
    let node = element;
    for (let depth = 0; depth < 5 && node !== null; depth += 1) {
      const style = getComputedStyle(node);
      parts.push(node.tagName.toLowerCase() + "." + [...node.classList].filter((c) => !c.startsWith("framer-")).slice(0, 2).join(".") + " t:" + (style.transform === "none" ? "none" : style.transform.slice(0, 60)));
      node = node.parentElement;
    }
    return parts.join(" < ");
  };
  const out = [];
  for (const element of document.querySelectorAll("svg, canvas")) {
    const rect = element.getBoundingClientRect();
    if (rect.height < 200 || rect.width < 200) continue;
    if (rect.top + scrollY > 1600) continue;
    out.push({ tag: element.tagName, top: round(rect.top + scrollY), size: round(rect.width) + "x" + round(rect.height), chain: chain(element), text: element.tagName === "svg" ? element.textContent.trim().slice(0, 24) : "" });
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
    await page.screenshot({ path: `.scratch/p3-7-punkt-15/bilder/frisch-${side}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
    console.log(`\n######## ${side} · frisch ########`);
    for (const row of await page.evaluate(LAYERS)) console.log(`  ${row.tag} top ${row.top} ${row.size} "${row.text}"\n    ${row.chain}`);
    await page.evaluate(SETTLE);
    await page.screenshot({ path: `.scratch/p3-7-punkt-15/bilder/nachsettle-${side}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
    console.log(`\n######## ${side} · nach Settle ########`);
    for (const row of await page.evaluate(LAYERS)) console.log(`  ${row.tag} top ${row.top} ${row.size} "${row.text}"\n    ${row.chain}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
