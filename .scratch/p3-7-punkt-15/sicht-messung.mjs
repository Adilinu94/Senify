// Messweg zu P3-7 Punkt 15: Sichtfenster je Scrollposition statt `fullPage`.
//
// Der `fullPage`-Screenshot nimmt die Quelle bei scrollY = 0 auf; jede
// scroll-gekoppelte Gestaltung steht dann im Startzustand, waehrend der Import
// seinen Ruhezustand zeigt. Diese Probe scrollt beide Seiten schrittweise und
// vergleicht das Sichtfenster an derselben Position — das ist, was ein Mensch
// beim Scrollen sieht.
//
// Usage: node .scratch/p3-7-punkt-15/sicht-messung.mjs [breite] [hoehe]
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const SOURCE = "https://unifiersofjapan.framer.website/";
const ROOT = resolve(".scratch/p3-7-punkt-15/bilder/unifiersofjapan");
const WIDTH = Number(process.argv[2] ?? 1440);
const HEIGHT = Number(process.argv[3] ?? 900);
const STEP = Math.floor(HEIGHT * 0.75);
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
    response
      .writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" })
      .end(body);
  });
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() ?? {}).port;
      done({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((end) => server.close(() => end())),
      });
    }),
  );
}

// Warten, bis die Seite "steht": Schriften geladen, keine halbtransparenten
// Elemente mehr im Sichtfenster, dazu etwas Zeit fuer CSS-Uebergaenge.
const WAIT_STEADY = `(async () => {
  const globals = globalThis;
  const wait = (ms) => new Promise((resolve) => { globals.setTimeout(() => resolve(), ms); });
  await wait(500);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const elements = globals.document.querySelectorAll("*");
    let open = false;
    for (let index = 0; index < elements.length; index += 1) {
      const style = globals.getComputedStyle(elements[index]);
      if (Number.parseFloat(style.opacity) < 0.99) { open = true; break; }
    }
    if (!open) break;
    await wait(200);
  }
  await globals.document.fonts.ready;
  await wait(300);
})()`;

const SCROLL_TO = (y) => `(() => {
  const globals = globalThis;
  globals.window.scrollTo(0, ${y});
  return { scrollY: globals.window.scrollY, height: globals.document.body.scrollHeight };
})()`;

const diffViewport = (before, after) => {
  const width = Math.min(before.width, after.width);
  const height = Math.min(before.height, after.height);
  const left = new PNG({ width, height });
  PNG.bitblt(before, left, 0, 0, width, height, 0, 0);
  const right = new PNG({ width, height });
  PNG.bitblt(after, right, 0, 0, width, height, 0, 0);
  const out = new PNG({ width, height });
  const changed = pixelmatch(left.data, right.data, out.data, width, height, { threshold: 0.1 });
  return { changed, percent: (changed / (width * height)) * 100 };
};

const server = await serve(ROOT);
const browser = await chromium.launch();
try {
  const shots = { quelle: [], import: [] };
  for (const [side, target] of [
    ["quelle", SOURCE],
    ["import", `${server.url}/index.html`],
  ]) {
    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const start = await page.evaluate(SCROLL_TO(0));
    await page.evaluate(WAIT_STEADY);
    for (let y = 0; y < start.height; y += STEP) {
      const at = await page.evaluate(SCROLL_TO(y));
      await page.evaluate(WAIT_STEADY);
      shots[side].push({ requested: y, actual: at.scrollY, png: await page.screenshot({ type: "png" }) });
    }
    console.log(`${side}: ${start.height} px hoch, ${shots[side].length} Sichtfenster`);
    await context.close();
  }
  const count = Math.min(shots.quelle.length, shots.import.length);
  let changed = 0;
  let area = 0;
  for (let index = 0; index < count; index += 1) {
    const left = PNG.sync.read(shots.quelle[index].png);
    const right = PNG.sync.read(shots.import[index].png);
    const result = diffViewport(left, right);
    changed += result.changed;
    area += Math.min(left.width, right.width) * Math.min(left.height, right.height);
    console.log(
      `  y ${String(shots.quelle[index].actual).padStart(5)}  ${result.percent.toFixed(1).padStart(5)}%  (${result.changed} px)`,
    );
  }
  console.log(`\nGesamt ueber ${count} Sichtfenster: ${((changed / area) * 100).toFixed(2)}%`);
} finally {
  await browser.close();
  await server.close();
}
