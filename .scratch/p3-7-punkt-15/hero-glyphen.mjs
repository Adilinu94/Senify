// Befund zu P3-7 Punkt 15: der Hero im Ausschnitt. Drei Fragen:
// (1) Zeichnet der Browser auf beiden Seiten Anton? (2) Wie sieht "oda" und
// "nobunaga" im Ausschnitt aus? (3) Was steht im Hero sonst — Canvas, SVG, Bild?
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";

const SOURCE = "https://unifiersofjapan.framer.website/";
const ROOT = resolve(".scratch/p3-7-punkt-15/bilder/unifiersofjapan");
const WORK = resolve(".scratch/p3-7-punkt-15/bilder/hero");
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

const FACTS = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const findOwn = (text) => {
    for (const element of document.querySelectorAll("*")) {
      let own = "";
      for (const child of element.childNodes) if (child.nodeType === 3) own += child.textContent;
      if (own.trim().replace(/\\s+/g, " ") === text) return element;
    }
    return null;
  };
  const box = (element) => {
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return { top: round(rect.top + scrollY), left: round(rect.left), width: round(rect.width), height: round(rect.height) };
  };
  const oda = findOwn("oda");
  const nobunaga = findOwn("nobunaga");
  const hero = oda === null ? null : oda.closest("section") ?? oda.parentElement?.parentElement?.parentElement ?? null;
  const drawables = [];
  if (hero !== null) {
    for (const element of hero.querySelectorAll("canvas, svg, img, video")) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) continue;
      drawables.push({
        tag: element.tagName,
        top: round(rect.top + scrollY),
        left: round(rect.left),
        width: round(rect.width),
        height: round(rect.height),
        text: element.tagName === "svg" ? element.textContent.trim().slice(0, 30) : "",
        share: element.tagName === "canvas" ? (() => { try { const context = element.getContext("2d"); if (context === null) return "kein 2d"; const data = context.getImageData(0, 0, Math.min(64, element.width), Math.min(64, element.height)).data; let sum = 0; for (let index = 3; index < data.length; index += 4) sum += data[index]; return Math.round(sum / (data.length / 4)); } catch (error) { return String(error).slice(0, 40); } })() : "",
      });
    }
  }
  const faces = [];
  document.fonts.forEach((face) => faces.push({ family: face.family, weight: face.weight, status: face.status }));
  return {
    oda: box(oda),
    nobunaga: box(nobunaga),
    hero: hero === null ? null : { tag: hero.tagName, name: hero.getAttribute("data-framer-name") || hero.className.slice(0, 40), box: box(hero) },
    drawables,
    anton: { check: document.fonts.check('16px Anton'), checkUppercase: document.fonts.check('16px Anton', 'ODA') },
    faces: faces.filter((face) => face.family.includes("Anton") || face.family.includes("Nikkei")),
  };
})()`;

mkdirSync(WORK, { recursive: true });
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
    await page.evaluate(SETTLE);
    const facts = await page.evaluate(FACTS);
    writeFileSync(join(WORK, `${side}.json`), JSON.stringify(facts, null, 2));
    console.log(`\n=== ${side} ===`);
    console.log(`  oda ${JSON.stringify(facts.oda)}`);
    console.log(`  nobunaga ${JSON.stringify(facts.nobunaga)}`);
    console.log(`  hero ${JSON.stringify(facts.hero)}`);
    console.log(`  Anton check ${JSON.stringify(facts.anton)}`);
    console.log(`  Schriften ${JSON.stringify(facts.faces)}`);
    console.log("  Zeichenflächen:");
    for (const row of facts.drawables) console.log(`    ${row.tag} ${row.left},${row.top} ${row.width}x${row.height} ${row.share} ${row.text}`);
    if (facts.oda !== null) {
      const clip = { x: Math.max(0, facts.oda.left - 30), y: Math.max(0, facts.oda.top - 30), width: Math.min(1440, facts.oda.width + 60), height: Math.min(900, facts.oda.height + 60) };
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      writeFileSync(join(WORK, `${side}-oda.png`), await page.screenshot({ clip }));
      const clip2 = { x: Math.max(0, facts.nobunaga === null ? 0 : facts.nobunaga.left), y: 460, width: 1440, height: 440 };
      writeFileSync(join(WORK, `${side}-nobunaga.png`), await page.screenshot({ clip: clip2 }));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
