// Was steht im Band? Liste aller Elemente, die das Band schneiden,
// mit Tag, Box, Transform, Hintergrund und SVG-Inhalt - Quelle gegen Import.
// Band über BAND_FROM / BAND_TO setzen (Standard 3900..4500).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
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

async function settle(page) {
  await page.evaluate(`(async () => {
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
  })()`);
}

const LIST = `(band) => {
  const round = (value) => Math.round(value * 10) / 10;
  const rows = [];
  for (const element of document.querySelectorAll("body *")) {
    const rect = element.getBoundingClientRect();
    const top = rect.top + scrollY;
    if (top + rect.height < band.from || top > band.to) continue;
    if (rect.width * rect.height < 200) continue;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    rows.push({
      tag: element.tagName.toLowerCase(),
      name: element.getAttribute("data-framer-name"),
      cls: (element.getAttribute("class") || "").split(" ").filter((token) => token && !token.startsWith("framer-")).slice(0, 3).join(" "),
      x: round(rect.left),
      top: round(top),
      h: round(rect.height),
      w: round(rect.width),
      bg: style.backgroundImage === "none" ? "" : style.backgroundImage.slice(0, 60),
      bgc: style.backgroundColor,
      transform: style.transform === "none" ? "" : style.transform.slice(0, 45),
      radius: style.borderRadius,
      clip: style.clipPath === "none" ? "" : style.clipPath.slice(0, 40),
      mask: style.maskImage === "none" ? "" : style.maskImage.slice(0, 40),
      children: element.childElementCount,
      svgInfo: element.tagName.toLowerCase() === "svg" ? element.innerHTML.length : 0,
    });
  }
  const badge = [];
  for (const element of document.querySelectorAll("svg text, svg textPath, svg use")) {
    badge.push(element.outerHTML.slice(0, 140));
  }
  return { rows, badge };
}`;

const server = await serve(ROOT);
const browser = await chromium.launch();
try {
  for (const [side, url] of [
    ["QUELLE", SOURCE],
    ["IMPORT", `${server.url}/index.html`],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await settle(page);
    const band = {
      from: Number(process.env.BAND_FROM ?? 3900),
      to: Number(process.env.BAND_TO ?? 4500),
    };
    const detail = await page.evaluate(`(${LIST})(${JSON.stringify(band)})`);
    console.log(`\n===== ${side} · Band ${band.from}..${band.to} · ${detail.rows.length} Elemente =====`);
    const sorted = detail.rows.sort((a, b) => a.top - b.top || a.x - b.x);
    for (const row of sorted.slice(0, 80)) {
      console.log(
        `  ${row.tag.padEnd(6)} ${String(row.name ?? "").padEnd(14)} x ${String(row.x).padStart(7)} top ${String(row.top).padStart(8)} ${String(row.w).padStart(6)}x${String(row.h).padStart(6)} ch ${String(row.children).padStart(2)} ${row.bgc} ${row.transform} ${row.bg} ${row.radius} ${row.clip} ${row.mask} ${row.svgInfo ? "svg:" + row.svgInfo : ""}`,
      );
    }
    console.log(`  SVG-Text/Use (${detail.badge.length}):`);
    for (const line of detail.badge.slice(0, 20)) console.log(`    ${line}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
