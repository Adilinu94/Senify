// Befund zu P3-7 Punkt 15: Warum bricht "AZUCHI CASTLE …" anders um? Box,
// Schrift und Kette der Überschrift und des Absatzes daneben.
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

const PROBE = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const findByText = (needle) => {
    for (const element of document.querySelectorAll("*")) {
      let own = "";
      for (const child of element.childNodes) if (child.nodeType === 3) own += child.textContent;
      if (own.trim().replace(/\\s+/g, " ").includes(needle)) return element;
    }
    return null;
  };
  const chain = (element) => {
    const rows = [];
    let node = element;
    for (let depth = 0; depth < 6 && node !== null && node !== document.documentElement; depth += 1) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      rows.push({
        depth,
        tag: node.tagName,
        name: (node.getAttribute("data-framer-name") || node.className || "").toString().slice(0, 36),
        top: round(rect.top + scrollY),
        left: round(rect.left),
        width: round(rect.width),
        height: round(rect.height),
        display: style.display,
        maxWidth: style.maxWidth,
        padding: style.padding,
        gap: style.gap,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontFamily: style.fontFamily.slice(0, 36),
        textTransform: style.textTransform,
        textAlign: style.textAlign,
        flex: style.flex,
      });
      node = node.parentElement;
    }
    return rows;
  };
  return {
    heading: chain(findByText("Azuchi Castle served")),
    paragraph: chain(findByText("This is an incredibly strategic move")),
  };
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
    const probe = await page.evaluate(PROBE);
    console.log(`\n=== ${side} Ueberschrift ===`);
    for (const row of probe.heading) {
      console.log(
        `  ${row.depth} ${row.tag} "${row.name}" ${row.left},${row.top} ${row.width}x${row.height} ${row.display} max ${row.maxWidth} pad ${row.padding} gap ${row.gap} ${row.fontSize}/${row.lineHeight} ${row.fontFamily} ${row.textTransform} ${row.textAlign} flex ${row.flex}`,
      );
    }
    console.log(`=== ${side} Absatz ===`);
    for (const row of probe.paragraph) {
      console.log(
        `  ${row.depth} ${row.tag} "${row.name}" ${row.left},${row.top} ${row.width}x${row.height} ${row.display} max ${row.maxWidth} pad ${row.padding} gap ${row.gap} ${row.fontSize}/${row.lineHeight} ${row.fontFamily} ${row.textTransform} ${row.textAlign} flex ${row.flex}`,
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
