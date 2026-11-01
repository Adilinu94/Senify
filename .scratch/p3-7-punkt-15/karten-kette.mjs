// Warum sind die Moment-Karten bei 900 px im Import 334 statt 478 px hoch?
// Die Probe vergleicht die Rasterkette und die Spaltenbreiten beider Seiten.
//
// Usage: node .scratch/p3-7-punkt-15/karten-layout.mjs [breite]

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const width = Number(process.argv[2] ?? 900);
const SOURCE = "https://unifiersofjapan.framer.website/";
const ROOT = resolve(".scratch/p3-7-punkt-15/bilder/unifiersofjapan");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };

function serve(root) {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" }).end(readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => done({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((end) => server.close(() => end())) })),
  );
}

const PROBE = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: round(rect.left), y: round(rect.top + scrollY), w: round(rect.width), h: round(rect.height) };
  };
  const describe = (element) => {
    const style = getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      node: element.getAttribute("data-node-id"),
      name: element.getAttribute("data-framer-name"),
      classes: typeof element.className === "string" ? element.className : "",
      box: box(element),
      display: style.display,
      direction: style.flexDirection,
      wrap: style.flexWrap,
      flex: style.flex,
      minWidth: style.minWidth,
      width: style.width,
      gap: style.gap,
      padding: style.padding,
      position: style.position,
      overflow: style.overflow,
      transform: style.transform,
    };
  };
  const image = [...document.querySelectorAll("img")].find((item) => item.src.includes("ToIABJlTDHbYIzGvxQH24rwmYIU"));
  if (!image) return { error: "Kartenbild nicht gefunden" };
  const chain = [];
  let element = image.parentElement;
  for (let depth = 0; element && depth < 18; depth += 1, element = element.parentElement) {
    const entry = describe(element);
    entry.parentBox = element.parentElement ? box(element.parentElement) : null;
    entry.siblings = element.parentElement
      ? [...element.parentElement.children].map((child) => ({ ...describe(child), isSelf: child === element }))
      : [];
    chain.push(entry);
  }
  const images = [...document.querySelectorAll("img")]
    .map((item) => ({ ...box(item), src: (item.currentSrc || item.src).split("/").pop().slice(0, 34) }))
    .filter((item) => item.h > 100)
    .sort((a, b) => a.y - b.y);
  return { width: innerWidth, height: document.body.scrollHeight, chain, images };
})()`;

const server = await serve(ROOT);
const browser = await chromium.launch();
for (const [side, target] of [["quelle", SOURCE], ["import", `${server.url}/index.html`]]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.evaluate(`(async () => { const step = Math.max(240, Math.floor(innerHeight * 0.8)); for (let y = 0; y < document.body.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400)); })()`);
  const probe = await page.evaluate(PROBE);
  console.log(`\n### ${side} @ ${width}`);
  if (probe.error) console.log(probe.error);
  else {
    console.log(`Dokumenthöhe ${probe.height}`);
    for (const entry of probe.chain) {
      const label = entry.node ? `${entry.tag}[${entry.node}]` : `${entry.tag}${entry.name ? `(${entry.name})` : ""}`;
      console.log(`\n  ${label} ${entry.classes.slice(0, 90)}`);
      console.log(`    box x${entry.box.x} y${entry.box.y} ${entry.box.w}x${entry.box.h}`);
      console.log(`    display=${entry.display} ${entry.direction} wrap=${entry.wrap} flex=${entry.flex} minW=${entry.minWidth} w=${entry.width}`);
      console.log(`    gap=${entry.gap} pad=${entry.padding} ${entry.position} overflow=${entry.overflow} transform=${entry.transform}`);
      console.log(`    Elternteil: x${entry.parentBox?.x} ${entry.parentBox?.w}x${entry.parentBox?.h}`);
      for (const sibling of entry.siblings) {
        console.log(`    ${sibling.isSelf ? ">" : " "} ${sibling.tag}${sibling.node ? `[${sibling.node}]` : ""}${sibling.name ? `(${sibling.name})` : ""} x${sibling.box.x} y${sibling.box.y} ${sibling.box.w}x${sibling.box.h} flex=${sibling.flex} minW=${sibling.minWidth}`);
      }
    }
    console.log("\n  Bilder:");
    for (const image of probe.images) console.log(`    x${image.x} y${image.y} ${image.w}x${image.h} ${image.src}`);
  }
  await context.close();
}
await browser.close();
await server.close();
