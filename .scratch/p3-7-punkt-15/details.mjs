// Detailmessung zu den Auffälligkeiten aus der Bandmessung: die großen
// Displaytexte und die leeren Karten. Liefert je Auffälligkeit Box,
// Schriftmaße und die Positionskette der Elternteile - Quelle gegen Import.
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
  })()`);
}

const DETAILS = `(targets) => {
  const round = (value) => Math.round(value * 10) / 10;
  const describe = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName,
      name: element.getAttribute("data-framer-name"),
      cls: (element.getAttribute("class") || "").split(" ").filter((token) => token && !token.startsWith("framer-")).slice(0, 2).join(" "),
      top: round(rect.top + scrollY),
      height: round(rect.height),
      width: round(rect.width),
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontFamily: style.fontFamily.split(",")[0],
      position: style.position,
      transform: style.transform === "none" ? "none" : style.transform.slice(0, 60),
      overflow: style.overflow,
      display: style.display,
    };
  };
  const results = {};
  for (const target of targets) {
    const found = [];
    for (const element of document.querySelectorAll("*")) {
      let text = "";
      for (const child of element.childNodes) {
        if (child.nodeType === 3) text += child.textContent;
      }
      if (text.trim().toLowerCase() !== target.toLowerCase()) continue;
      const chain = [];
      let current = element;
      for (let depth = 0; depth < 6 && current !== null; depth += 1) {
        chain.push(describe(current));
        current = current.parentElement;
      }
      found.push(chain);
    }
    results[target] = found;
  }
  const images = [];
  for (const image of document.querySelectorAll("img")) {
    const rect = image.getBoundingClientRect();
    images.push({
      src: (image.getAttribute("src") || "").slice(0, 110),
      current: (image.currentSrc || "").slice(0, 110),
      natural: image.naturalWidth + "x" + image.naturalHeight,
      complete: image.complete,
      top: round(rect.top + scrollY),
      height: round(rect.height),
      width: round(rect.width),
    });
  }
  const backgrounds = [];
  for (const element of document.querySelectorAll("*")) {
    const style = getComputedStyle(element);
    if (!style.backgroundImage || style.backgroundImage === "none") continue;
    if (!style.backgroundImage.includes("url(")) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) continue;
    backgrounds.push({
      value: style.backgroundImage.slice(0, 130),
      top: round(rect.top + scrollY),
      height: round(rect.height),
      width: round(rect.width),
    });
  }
  return { height: document.body.scrollHeight, results, images, backgrounds };
}`;

const targets = ["oda", "nobunaga", "strategy", "moments", "explore", "SITE OF THE MONTH ✦"];
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
    const detail = await page.evaluate(`(${DETAILS})(${JSON.stringify(targets)})`);
    console.log(`\n===== ${side} · Höhe ${detail.height} =====`);
    for (const target of targets) {
      const matches = detail.results[target];
      console.log(`\n  "${target}" · ${matches.length} Treffer`);
      for (const chain of matches.slice(0, 3)) {
        for (const element of chain) {
          console.log(
            `    ${element.tag.padEnd(6)} ${String(element.name ?? "-").padEnd(16)} top ${String(element.top).padStart(8)} h ${String(element.height).padStart(7)} w ${String(element.width).padStart(6)}  fs ${element.fontSize.padEnd(8)} lh ${element.lineHeight.padEnd(8)} ${element.position} ${element.transform === "none" ? "" : element.transform}`,
          );
        }
        console.log("    ---");
      }
    }
    console.log(`\n  Bilder (${detail.images.length}):`);
    detail.images.forEach((image, index) => {
      console.log(
        `    ${String(index).padStart(2)} top ${String(image.top).padStart(8)} h ${String(image.height).padStart(6)} w ${String(image.width).padStart(6)} nat ${image.natural.padEnd(11)} ok ${image.complete ? "j" : "n"} ${image.src}`,
      );
    });
    console.log(`\n  Hintergrundbilder (${detail.backgrounds.length}):`);
    for (const background of detail.backgrounds.slice(0, 25)) {
      console.log(`    top ${String(background.top).padStart(8)} h ${String(background.height).padStart(6)} w ${String(background.width).padStart(6)} ${background.value}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
