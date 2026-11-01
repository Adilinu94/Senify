// Ursache 4: Ist das Korn mitten auf der Seite sichtbar? Zwei Sichten bei
// scrollY = 3000, je Seite ein Bildschirmfoto (nicht fullPage).
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
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

const server = await serve(ROOT);
const browser = await chromium.launch();
try {
  for (const [side, url] of [
    ["quelle", SOURCE],
    ["import", `${server.url}/index.html`],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 3000));
    await page.waitForTimeout(1200);
    const shot = await page.screenshot();
    writeFileSync(resolve(`.scratch/p3-7-punkt-15/bilder/mitte-${side}.png`), shot);
    console.log(side, "gespeichert");
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
