// Befund zu P3-7 Punkt 15: der Hero-Bereich. Welche Elemente stehen in den
// ersten 900 px, welche Schrift rechnet der Browser, und gibt es Video, Canvas
// oder SVG? Quelle und Import, gleiche Frage, zwei Antworten.
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

const HERO = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const texts = [];
  for (const element of document.querySelectorAll("*")) {
    let own = "";
    for (const child of element.childNodes) if (child.nodeType === 3) own += child.textContent;
    own = own.trim().replace(/\\s+/g, " ");
    if (own.length < 2 || own.length > 60) continue;
    const rect = element.getBoundingClientRect();
    if (rect.height < 1 || rect.width < 1) continue;
    if (rect.top + scrollY > 1200) continue;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    texts.push({
      text: own.slice(0, 40),
      tag: element.tagName,
      top: round(rect.top + scrollY),
      height: round(rect.height),
      width: round(rect.width),
      font: style.fontFamily.slice(0, 60),
      size: style.fontSize,
      weight: style.fontWeight,
      stretch: style.fontStretch,
      transform: style.textTransform,
      spacing: style.letterSpacing,
      color: style.color,
      opacity: style.opacity,
    });
  }
  const media = [];
  for (const element of document.querySelectorAll("video, canvas, svg, iframe")) {
    const rect = element.getBoundingClientRect();
    if (rect.height < 40 || rect.width < 40) continue;
    if (rect.top + scrollY > 2000) continue;
    media.push({
      tag: element.tagName,
      top: round(rect.top + scrollY),
      height: round(rect.height),
      width: round(rect.width),
      src: (element.currentSrc || element.src || element.getAttribute("poster") || "").split("/").pop().slice(0, 80),
      time: element.tagName === "VIDEO" ? round(element.currentTime * 100) / 100 : null,
      duration: element.tagName === "VIDEO" ? round(element.duration * 100) / 100 : null,
      paused: element.tagName === "VIDEO" ? element.paused : null,
      text: element.tagName === "svg" ? element.textContent.trim().slice(0, 40) : "",
    });
  }
  const fonts = [];
  document.fonts.forEach((face) => fonts.push({ family: face.family, weight: face.weight, style: face.style, status: face.status }));
  return { texts, media, fonts };
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
    const probe = await page.evaluate(HERO);
    console.log(`\n=== ${side} ===`);
    console.log("  Texte (top < 1200):");
    for (const row of probe.texts) {
      console.log(
        `    "${row.text}" ${row.tag} top ${row.top} h${row.height} w${row.width} · ${row.font} ${row.size}/${row.weight} stretch ${row.stretch} ${row.transform} ls ${row.spacing} ${row.color} op ${row.opacity}`,
      );
    }
    console.log("  Medien:");
    for (const row of probe.media) {
      console.log(`    ${row.tag} top ${row.top} ${row.width}x${row.height} ${row.src} ${row.time ?? ""}${row.duration !== null ? "/" + row.duration : ""} ${row.paused !== null ? (row.paused ? "pausiert" : "laeuft") : ""} ${row.text}`);
    }
    console.log(`  Schriften (${probe.fonts.length}): ${[...new Set(probe.fonts.map((f) => f.family))].join(" · ")}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
