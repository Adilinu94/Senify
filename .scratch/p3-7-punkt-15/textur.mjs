// Ursache 4 (P3-7 Punkt 15): die Papiertextur liegt im Import bei top -1800,
// in der Quelle bei top -1062 (jeweils 5760x3600). Die CSS-Eigenschaft
// `background-position` ist es nicht: `details.mjs` hat die BOX gemessen.
// Diese Probe vergleicht das Textur-Element und seine Positionskette Quelle
// gegen Import, samt Rechenwerten des Hintergrunds.
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

const PROBE = `() => {
  const round = (value) => Math.round(value * 10) / 10;
  const needle = "rR6HYXBrMmX4cRpXfXUOvpvpB0";
  const found = [];
  for (const element of document.querySelectorAll("*")) {
    const style = getComputedStyle(element);
    if (!style.backgroundImage.includes(needle)) continue;
    const rect = element.getBoundingClientRect();
    const chain = [];
    let current = element;
    for (let depth = 0; depth < 9 && current !== null; depth += 1) {
      const own = getComputedStyle(current);
      const box = current.getBoundingClientRect();
      chain.push({
        tag: current.tagName,
        name: current.getAttribute("data-framer-name"),
        cls: (current.getAttribute("class") || "").split(" ").filter((token) => token && !token.startsWith("framer-")).slice(0, 2).join(" "),
        position: own.position,
        top: round(box.top + scrollY),
        height: round(box.height),
        width: round(box.width),
        inset: own.inset === "auto" ? "auto" : own.inset.slice(0, 80),
        bottom: own.bottom === "auto" ? "auto" : own.bottom,
        overflow: own.overflow,
        transform: own.transform === "none" ? "none" : own.transform.slice(0, 60),
        zIndex: own.zIndex,
        styleAttr: (current.getAttribute("style") || "").slice(0, 260),
      });
      current = current.parentElement;
    }
    found.push({
      top: round(rect.top + scrollY),
      left: round(rect.left),
      height: round(rect.height),
      width: round(rect.width),
      backgroundPosition: style.backgroundPosition,
      backgroundSize: style.backgroundSize,
      backgroundRepeat: style.backgroundRepeat,
      backgroundClip: style.backgroundClip,
      opacity: style.opacity,
      position: style.position,
      inset: style.inset === "auto" ? "auto" : style.inset,
      styleAttr: (element.getAttribute("style") || "").slice(0, 400),
      inlineBackground: element.style.background,
      inlineBackgroundSize: element.style.backgroundSize,
      inlineBackgroundRepeat: element.style.backgroundRepeat,
      chain,
    });
  }
  return { pageHeight: document.body.scrollHeight, found };
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
    const result = await page.evaluate(`(${PROBE})()`);
    console.log(`\n===== ${side} · Höhe ${result.pageHeight} · ${result.found.length} Textur-Element(e) =====`);
    for (const entry of result.found) {
      console.log(
        `\n  BOX top ${entry.top} left ${entry.left} ${entry.width} x ${entry.height} · position ${entry.position} · inset ${entry.inset} · opacity ${entry.opacity}`,
      );
      console.log(`  background-position "${entry.backgroundPosition}" · size "${entry.backgroundSize}" · repeat ${entry.backgroundRepeat} · clip ${entry.backgroundClip}`);
      console.log(`  Inline: background "${entry.inlineBackground}" · size "${entry.inlineBackgroundSize}" · repeat "${entry.inlineBackgroundRepeat}"`);
      console.log(`  style="${entry.styleAttr}"`);
      console.log("  Kette:");
      entry.chain.forEach((link, depth) => {
        console.log(
          `    ${String(depth).padStart(2)} ${link.tag.padEnd(5)} ${String(link.name ?? "-").padEnd(18)} ${link.position.padEnd(9)} top ${String(link.top).padStart(9)} h ${String(link.height).padStart(8)} w ${String(link.width).padStart(6)} z ${String(link.zIndex).padStart(4)} ${link.transform === "none" ? "" : link.transform}`,
        );
        if (link.styleAttr) console.log(`       style="${link.styleAttr}"`);
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
