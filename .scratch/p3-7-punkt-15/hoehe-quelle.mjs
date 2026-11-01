// Befund zu P3-7 Punkt 15: Die Seitenhoehe der QUELLE haengt vom Scrollzustand
// ab. Diese Probe misst sie vor dem Scrollen, nach dem Durchscrollen und nach
// der Rueckkehr nach oben — und dieselbe Zahl am gebackenen Import.
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
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".mp4": "video/mp4",
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
      done({ url: `http://127.0.0.1:${port}`, close: () => new Promise((end) => server.close(() => end())) });
    }),
  );
}

const HEIGHT = `(() => ({
  body: document.body.scrollHeight,
  root: document.documentElement.scrollHeight,
  viewport: window.innerHeight,
  scrollY: window.scrollY,
}))()`;

const SCROLL = (y) => `(async () => {
  window.scrollTo(0, ${y});
  await new Promise((done) => setTimeout(done, 700));
  return { scrollY: window.scrollY, body: document.body.scrollHeight, root: document.documentElement.scrollHeight };
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
    await page.waitForTimeout(1200);
    console.log(`\n=== ${side} ===`);
    console.log(`  nach dem Laden: ${JSON.stringify(await page.evaluate(HEIGHT))}`);
    const positions = [];
    for (let y = 0; y < 9000; y += 675) positions.push(await page.evaluate(SCROLL(y)));
    for (const row of positions) console.log(`  scroll ${row.scrollY}: body ${row.body} / root ${row.root}`);
    console.log(`  zurueck oben: ${JSON.stringify(await page.evaluate(SCROLL(0)))}`);
    await page.waitForTimeout(800);
    console.log(`  nach 800 ms oben: ${JSON.stringify(await page.evaluate(HEIGHT))}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
