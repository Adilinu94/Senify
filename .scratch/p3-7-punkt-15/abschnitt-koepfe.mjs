// Befund zu P3-7 Punkt 15: die Abschnitts-Überschriften "strategy", "moments",
// "explore" — sind sie ebenfalls Fit-Texte, und welche Schrift rechnen sie?
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const elements = globals.document.querySelectorAll("*");
    let open = false;
    for (let index = 0; index < elements.length; index += 1) {
      if (Number.parseFloat(globals.getComputedStyle(elements[index]).opacity) < 0.99) {
        open = true;
        break;
      }
    }
    if (!open) break;
    await wait(220);
  }
  await globalThis.document.fonts.ready;
  await wait(400);
})()`;

const HEADINGS = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const findOwn = (text) => {
    for (const element of document.querySelectorAll("*")) {
      let own = "";
      for (const child of element.childNodes) if (child.nodeType === 3) own += child.textContent;
      if (own.trim().replace(/\\s+/g, " ") === text) return element;
    }
    return null;
  };
  const rows = [];
  for (const word of ["strategy", "moments", "explore"]) {
    const element = findOwn(word);
    if (element === null) {
      rows.push({ word, missing: true });
      continue;
    }
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const fit = element.closest("foreignObject");
    const svg = element.closest("svg");
    rows.push({
      word,
      tag: element.tagName,
      top: round(rect.top + scrollY),
      left: round(rect.left),
      width: round(rect.width),
      height: round(rect.height),
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontFamily: style.fontFamily.slice(0, 40),
      textTransform: style.textTransform,
      letterSpacing: style.letterSpacing,
      fitText: fit !== null,
      svgBox: svg === null ? null : { width: round(svg.getBoundingClientRect().width), height: round(svg.getBoundingClientRect().height), viewBox: svg.getAttribute("viewBox") },
      inline: (element.getAttribute("style") || "").slice(0, 300),
      parent: element.parentElement === null ? null : {
        tag: element.parentElement.tagName,
        width: round(element.parentElement.getBoundingClientRect().width),
        height: round(element.parentElement.getBoundingClientRect().height),
        display: getComputedStyle(element.parentElement).display,
        inline: (element.parentElement.getAttribute("style") || "").slice(0, 200),
      },
    });
  }
  return rows;
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
    await page.evaluate(SETTLE);
    const rows = await page.evaluate(HEADINGS);
    console.log(`\n=== ${side} ===`);
    for (const row of rows) console.log("  " + JSON.stringify(row));
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
