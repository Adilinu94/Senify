// Ursache 4: Wie viel der Seitenabweichung stammt von der Papiertextur?
// Dieselbe Messung wie messung.ts (fullPage, 1440x900), zweimal: mit und ohne
// das Textur-Element (opacity 0 auf beiden Seiten). Die Differenz der beiden
// Zahlen ist der Anteil der Textur.
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const SOURCE = "https://unifiersofjapan.framer.website/";
const ROOT = resolve(".scratch/p3-7-punkt-15/bilder/unifiersofjapan");
const NEEDLE = "rR6HYXBrMmX4cRpXfXUOvpvpB0";
const BAND = 200;
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
const HIDE_TEXTURE = `(needle) => {
  let count = 0;
  for (const element of document.querySelectorAll("*")) {
    if (!getComputedStyle(element).backgroundImage.includes(needle)) continue;
    element.style.setProperty("opacity", "0", "important");
    count += 1;
  }
  return count;
}`;

function report(before, after) {
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const frame = (image) => {
    if (image.width === width && image.height === height) return image;
    const out = new PNG({ width, height });
    PNG.bitblt(image, out, 0, 0, image.width, image.height, 0, 0);
    return out;
  };
  const a = frame(before);
  const b = frame(after);
  const rows = [];
  for (let from = 0; from < height; from += BAND) {
    const bandHeight = Math.min(BAND, height - from);
    const crop = new PNG({ width, height: bandHeight });
    PNG.bitblt(a, crop, 0, from, width, bandHeight, 0, 0);
    const other = new PNG({ width, height: bandHeight });
    PNG.bitblt(b, other, 0, from, width, bandHeight, 0, 0);
    const diff = new PNG({ width, height: bandHeight });
    const changed = pixelmatch(crop.data, other.data, diff.data, width, bandHeight, { threshold: 0.1 });
    rows.push({ from, to: from + bandHeight, changed, percent: (changed / (width * bandHeight)) * 100 });
  }
  const total = rows.reduce((sum, row) => sum + row.changed, 0);
  const worst = [...rows].sort((left, right) => right.percent - left.percent).slice(0, 5);
  return {
    total: (total / (width * height)) * 100,
    worst: worst.map((row) => `y ${row.from}..${row.to} ${row.percent.toFixed(1)}%`),
  };
}

const server = await serve(ROOT);
const browser = await chromium.launch();
try {
  for (const mode of ["mit Textur", "ohne Textur"]) {
    const shots = {};
    for (const [side, url] of [
      ["quelle", SOURCE],
      ["import", `${server.url}/index.html`],
    ]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.evaluate(SETTLE);
      if (mode === "ohne Textur") {
        const count = await page.evaluate(`(${HIDE_TEXTURE})(${JSON.stringify(NEEDLE)})`);
        console.log(`  ${side}: ${count} Textur-Element(e) versteckt`);
        await page.waitForTimeout(300);
      }
      shots[side] = await page.screenshot({ fullPage: true });
      writeFileSync(resolve(`.scratch/p3-7-punkt-15/bilder/textur-${mode === "ohne Textur" ? "ohne" : "mit"}-${side}.png`), shots[side]);
      await context.close();
    }
    const before = PNG.sync.read(shots.quelle);
    const after = PNG.sync.read(shots.import);
    const result = report(before, after);
    console.log(`\n=== ${mode} · ${before.width}x${before.height} -> ${after.width}x${after.height} · gesamt ${result.total.toFixed(2)} % ===`);
    console.log(`  stärkste Bänder: ${result.worst.join(" · ")}`);
  }
} finally {
  await browser.close();
  await server.close();
}
