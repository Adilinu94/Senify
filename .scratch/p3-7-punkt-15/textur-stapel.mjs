// Ursache 4: Die Textur wird im Import nicht gezeichnet (0,03 % Pixel), in der
// Quelle schon (1,38 %). Diese Probe sucht den Grund: Deckkraft/Sichtbarkeit
// der Ahnen, Stapelkontext und was an einem Punkt obenauf liegt.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
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

const PROBE = `(needle) => {
  const round = (value) => Math.round(value * 10) / 10;
  let texture = null;
  for (const element of document.querySelectorAll("*")) {
    if (!getComputedStyle(element).backgroundImage.includes(needle)) continue;
    texture = element;
    break;
  }
  if (texture === null) return { error: "keine Textur" };
  const chain = [];
  let current = texture;
  for (let depth = 0; depth < 8 && current !== null; depth += 1) {
    const own = getComputedStyle(current);
    const box = current.getBoundingClientRect();
    chain.push({
      depth,
      tag: current.tagName,
      name: current.getAttribute("data-framer-name"),
      cls: (current.getAttribute("class") || "").split(" ").filter((token) => token && !token.startsWith("framer-")).slice(0, 1).join(" "),
      position: own.position,
      top: round(box.top + scrollY),
      size: round(box.width) + "x" + round(box.height),
      opacity: own.opacity,
      visibility: own.visibility,
      display: own.display,
      overflow: own.overflow,
      zIndex: own.zIndex,
      transform: own.transform === "none" ? "none" : own.transform.slice(0, 40),
      willChange: own.willChange,
      filter: own.filter,
      contain: own.contain,
      isolation: own.isolation,
      mixBlendMode: own.mixBlendMode,
      clipPath: own.clipPath,
      clip: own.clip,
      maskImage: own.maskImage === "none" ? "none" : own.maskImage.slice(0, 40),
      background: own.backgroundColor,
      appearId: current.getAttribute("data-framer-appear-id"),
      styleAttr: (current.getAttribute("style") || "").slice(0, 220),
    });
    current = current.parentElement;
  }
  const stack = [];
  for (const point of [[200, 200], [700, 400], [1200, 700]]) {
    const list = document.elementsFromPoint(point[0], point[1]).slice(0, 7).map((element) => {
      const own = getComputedStyle(element);
      return {
        tag: element.tagName,
        name: element.getAttribute("data-framer-name"),
        zIndex: own.zIndex,
        position: own.position,
        opacity: own.opacity,
        background: own.backgroundColor,
        isTexture: own.backgroundImage.includes(needle),
      };
    });
    stack.push({ point, list });
  }
  return { chain, stack };
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
    await page.waitForTimeout(2500);
    const result = await page.evaluate(`(${PROBE})(${JSON.stringify(NEEDLE)})`);
    console.log(`\n===== ${side} =====`);
    console.log("  Kette:");
    for (const link of result.chain) {
      console.log(
        `   ${link.depth} ${link.tag.padEnd(5)} ${String(link.name ?? "-").padEnd(16)} ${link.position.padEnd(8)} top ${String(link.top).padStart(8)} ${link.size.padStart(9)} op ${link.opacity.padEnd(5)} vis ${link.visibility.padEnd(7)} ov ${link.overflow.padEnd(8)} z ${String(link.zIndex).padStart(4)} ${link.transform !== "none" ? "T " + link.transform : ""} ${link.willChange !== "auto" ? "will " + link.willChange : ""} ${link.filter !== "none" ? "filter " + link.filter : ""} ${link.contain !== "none" ? "contain " + link.contain : ""} ${link.clipPath !== "none" ? "clipPath" : ""} ${link.appearId !== null ? "appearId " + link.appearId : ""} bg ${link.background}`,
      );
      if (link.styleAttr) console.log(`       style="${link.styleAttr}"`);
    }
    console.log("  Stapel an drei Punkten:");
    for (const entry of result.stack) {
      console.log(`   (${entry.point.join(",")}):`);
      for (const item of entry.list) {
        console.log(
          `     ${item.tag.padEnd(5)} ${String(item.name ?? "-").padEnd(14)} z ${String(item.zIndex).padStart(4)} ${item.position.padEnd(8)} op ${item.opacity.padEnd(5)} bg ${item.background}${item.isTexture ? "  <<< TEXTUR" : ""}`,
        );
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
