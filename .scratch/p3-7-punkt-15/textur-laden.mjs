// Ursache 4: Die Textur aendert in der Quelle 1,38 % der Pixel, im Import
// 0,03 %. Diese Probe sucht den Grund: laedt das Bild, welche Groesse hat es,
// und was zeichnet der Browser tatsaechlich?
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const SOURCE = "https://unifiersofjapan.framer.website/";
const ROOT = resolve(".scratch/p3-7-punkt-15/bilder/unifiersofjapan");
const NEEDLE = "rR6HYXBrMmX4cRpXfXUOvpvpB0";
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

const PROBE = `async (needle) => {
  const round = (value) => Math.round(value * 10) / 10;
  let texture = null;
  for (const element of document.querySelectorAll("*")) {
    if (!getComputedStyle(element).backgroundImage.includes(needle)) continue;
    texture = element;
    break;
  }
  if (texture === null) return { error: "keine Textur" };
  const style = getComputedStyle(texture);
  const url = (style.backgroundImage.match(/url\\("?([^")]+)"?\\)/) || [])[1];
  let response = null;
  try {
    const answer = await fetch(url);
    response = { status: answer.status, type: answer.headers.get("content-type"), length: answer.headers.get("content-length") };
  } catch (error) {
    response = { error: String(error) };
  }
  const image = new Image();
  const loaded = await new Promise((done) => {
    image.onload = () => done(true);
    image.onerror = () => done(false);
    image.src = url;
  });
  const rect = texture.getBoundingClientRect();
  const resources = performance.getEntriesByType("resource").filter((entry) => entry.name.includes(needle));
  return {
    url,
    response,
    loaded,
    natural: image.naturalWidth + "x" + image.naturalHeight,
    resources: resources.map((entry) => ({ name: entry.name.slice(-60), size: entry.transferSize, duration: Math.round(entry.duration) })),
    box: { top: round(rect.top + scrollY), height: round(rect.height), width: round(rect.width) },
    background: {
      image: style.backgroundImage.slice(0, 90),
      position: style.backgroundPosition,
      size: style.backgroundSize,
      repeat: style.backgroundRepeat,
      origin: style.backgroundOrigin,
      clip: style.backgroundClip,
      attachment: style.backgroundAttachment,
      blend: style.backgroundBlendMode,
    },
    visibility: {
      opacity: style.opacity,
      visibility: style.visibility,
      display: style.display,
      zIndex: style.zIndex,
      mixBlendMode: style.mixBlendMode,
      filter: style.filter,
    },
  };
}`;

const local = resolve(ROOT, "assets/up-13/rR6HYXBrMmX4cRpXfXUOvpvpB0.png");
console.log("lokale Texturdatei:", statSync(local).size, "Bytes");

const server = await serve(ROOT);
const browser = await chromium.launch();
try {
  for (const [side, url] of [
    ["QUELLE", SOURCE],
    ["IMPORT", `${server.url}/index.html`],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("requestfailed", (request) => {
      if (request.url().includes(NEEDLE)) console.log(`  ! Request fehlgeschlagen: ${request.failure()?.errorText}`);
    });
    page.on("response", (response) => {
      if (response.url().includes(NEEDLE)) console.log(`  → ${response.status()} ${response.headers()["content-type"]} ${response.url().slice(-50)}`);
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch((error) => console.log("  goto:", String(error).slice(0, 80)));
    await page.waitForTimeout(1500);
    const result = await page.evaluate(`(${PROBE})(${JSON.stringify(NEEDLE)})`);
    console.log(`\n===== ${side} =====`);
    console.log(JSON.stringify(result, null, 2));
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
