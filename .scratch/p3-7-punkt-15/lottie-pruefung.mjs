// Belegt, was in den leeren Karten des Bands 3950..4450 steckt: Lottie-Markup
// oder nichts? Zaehlt die Marker in Quelle, Import und im rohen Server-HTML.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";

const SOURCE = "https://unifiersofjapan.framer.website/";
const ROOT = resolve(".scratch/p3-7-punkt-15/bilder/unifiersofjapan");
const SSR = readFileSync(resolve(".scratch/p3-7-punkt-15/quelle.html"), "utf8");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".mp4": "video/mp4", ".gif": "image/gif", ".avif": "image/avif" };

function serve(root) {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep)) return void response.writeHead(403).end();
    let body;
    try { body = readFileSync(file); } catch { return void response.writeHead(404).end(); }
    response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" }).end(body);
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((end) => server.close(() => end())) })));
}

const PROBE = `() => {
  const markers = {
    lottieElement: document.querySelectorAll("*").length,
    lottieClass: document.querySelectorAll('[class*="lottie"], [class*="__lottie"]').length,
    lottieTag: document.querySelectorAll("lottie-player, lottie-div").length,
    mask: document.querySelectorAll("[mask], mask").length,
    animatedSvg: 0,
    emptyPlaceholder: 0,
  };
  for (const svg of document.querySelectorAll("svg")) {
    if (svg.innerHTML.includes("__lottie")) markers.animatedSvg += 1;
  }
  for (const div of document.querySelectorAll("div")) {
    const style = div.getAttribute("style") || "";
    if (div.childElementCount === 0 && /height:\\s*100%/.test(style) && /width:\\s*100%/.test(style)) markers.emptyPlaceholder += 1;
  }
  const cards = [];
  for (const element of document.querySelectorAll("div")) {
    const rect = element.getBoundingClientRect();
    const top = rect.top + scrollY;
    if (top < 3950 || top > 4450) continue;
    if (rect.width < 250 || rect.height < 250) continue;
    const html = element.innerHTML;
    cards.push({
      name: element.getAttribute("data-framer-name"),
      top: Math.round(top * 10) / 10,
      w: Math.round(rect.width * 10) / 10,
      h: Math.round(rect.height * 10) / 10,
      svgs: element.querySelectorAll("svg").length,
      lottie: html.includes("__lottie"),
      mask: html.includes("mask"),
      empty: element.querySelectorAll("div[style]").length,
      firstChildren: Array.from(element.children).slice(0, 3).map((child) => child.tagName + ":" + (child.getAttribute("style") || "").slice(0, 60)),
    });
  }
  return { markers, cards };
}`;

const browser = await chromium.launch();
const server = await serve(ROOT);
try {
  for (const [side, url] of [["QUELLE", SOURCE], ["IMPORT", `${server.url}/index.html`]]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await wait(120); }
      scrollTo(0, 0); await wait(600); await document.fonts.ready; await wait(400);
    })()`);
    const detail = await page.evaluate(`(${PROBE})()`);
    console.log(`\n===== ${side} =====`);
    console.log(detail.markers);
    console.log(`Karten im Band: ${detail.cards.length}`);
    for (const card of detail.cards) console.log(`  top ${card.top} ${card.w}x${card.h} svg ${card.svgs} lottie ${card.lottie} mask ${card.mask} leer ${card.empty} ${card.firstChildren.join(" | ")}`);
    await context.close();
  }
  console.log("\n===== ROHES SERVER-HTML =====");
  for (const marker of ["__lottie", "lottie", "mask=", "SITE OF THE MONTH", "textPath"]) {
    console.log(`  ${marker}: ${(SSR.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length}`);
  }
} finally {
  await browser.close();
  await server.close();
}
