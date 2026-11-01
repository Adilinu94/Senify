// Befund zu P3-7 Punkt 15: der rund 100 px hohe Kopfversatz und das Band
// y1000..1400. Dieselbe Seite zweimal, Sichtfenster-Fotos an mehreren
// Scrollständen plus die Geometrie der Kopf- und Hero-Kette. Kein Vergleich
// über die ganze Seite, nur Sicht und Zahlen.
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";

const SOURCE = "https://unifiersofjapan.framer.website/";
const ROOT = resolve(".scratch/p3-7-punkt-15/bilder/unifiersofjapan");
const WORK = resolve(".scratch/p3-7-punkt-15/bilder/kopf");
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

// Kopfkette und Hero: von jedem Zielelement zehn Vorfahren mit Position,
// Transformation und Box. Dazu alle Bilder der ersten 2200 px.
const PROBE = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const chain = (element) => {
    const rows = [];
    let node = element;
    for (let depth = 0; depth < 10 && node !== null && node !== document.documentElement; depth += 1) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      rows.push({
        tag: node.tagName,
        name: (node.getAttribute("data-framer-name") || node.getAttribute("class") || "").slice(0, 48),
        position: style.position,
        transform: style.transform === "none" ? "" : style.transform,
        top: round(rect.top + scrollY),
        height: round(rect.height),
        overflow: style.overflow,
        zIndex: style.zIndex,
      });
      node = node.parentElement;
    }
    return rows;
  };
  const wanted = ["oda", "menu", "about", "studio", "moments", "strategy", "explore", "01 / 05"];
  const found = [];
  for (const element of document.querySelectorAll("*")) {
    let own = "";
    for (const child of element.childNodes) if (child.nodeType === 3) own += child.textContent;
    own = own.trim().replace(/\\s+/g, " ");
    if (!wanted.includes(own)) continue;
    const rect = element.getBoundingClientRect();
    found.push({ text: own, top: round(rect.top + scrollY), height: round(rect.height), width: round(rect.width), depth: chain(element).length, chain: chain(element) });
    if (found.length > 60) break;
  }
  const images = [];
  for (const image of document.querySelectorAll("img")) {
    const rect = image.getBoundingClientRect();
    if (rect.height < 1) continue;
    const style = getComputedStyle(image);
    images.push({
      src: (image.currentSrc || image.src || "").split("/").pop().slice(0, 70),
      top: round(rect.top + scrollY),
      height: round(rect.height),
      width: round(rect.width),
      fit: style.objectFit,
      place: style.objectPosition,
      parent: (image.parentElement?.getAttribute("data-framer-name") || image.parentElement?.className || "").slice(0, 40),
      parentHeight: image.parentElement === null ? 0 : round(image.parentElement.getBoundingClientRect().height),
    });
    if (images.length > 40) break;
  }
  return { height: document.body.scrollHeight, texts: found, images };
})()`;

mkdirSync(WORK, { recursive: true });
const server = await serve(ROOT);
const browser = await chromium.launch();
try {
  for (const [side, placeholder] of [
    ["quelle", SOURCE],
    ["import", `${server.url}/index.html`],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(placeholder, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(SETTLE);
    const probe = await page.evaluate(PROBE);
    writeFileSync(join(WORK, `${side}.json`), JSON.stringify(probe, null, 2));
    for (const y of [0, 600, 1000, 1400, 3000, 7000]) {
      await page.evaluate((target) => window.scrollTo(0, target), y);
      await page.waitForTimeout(700);
      const shot = await page.screenshot();
      writeFileSync(join(WORK, `${side}-${y}.png`), shot);
    }
    await context.close();
    console.log(`${side}: ${probe.height} px, ${probe.texts.length} Textziele, ${probe.images.length} Bilder`);
  }
} finally {
  await browser.close();
  await server.close();
}
