// Befund zu P3-7 Punkt 15: Woher kommt das uppercase in der Quelle, und warum
// fehlt es im Import? Markup und Variablen der "oda"/"nobunaga"-Kette.
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

const CHAIN = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const findOwn = (text) => {
    for (const element of document.querySelectorAll("*")) {
      let own = "";
      for (const child of element.childNodes) if (child.nodeType === 3) own += child.textContent;
      if (own.trim().replace(/\\s+/g, " ") === text) return element;
    }
    return null;
  };
  const describe = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName,
      own: (element.textContent || "").trim().slice(0, 30),
      html: element.outerHTML.replace(/></g, ">\\n<").slice(0, 1600),
      top: round(rect.top + scrollY),
      left: round(rect.left),
      width: round(rect.width),
      height: round(rect.height),
      transform: style.transform,
      textTransform: style.textTransform,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      letterSpacing: style.letterSpacing,
      variables: {
        textTransform: style.getPropertyValue("--framer-text-transform").trim(),
        fontFamily: style.getPropertyValue("--framer-font-family").trim().slice(0, 50),
        fontSize: style.getPropertyValue("--framer-font-size").trim(),
        letterSpacing: style.getPropertyValue("--framer-letter-spacing").trim(),
      },
    };
  };
  const rows = [];
  for (const word of ["oda", "nobunaga"]) {
    let node = findOwn(word);
    for (let depth = 0; depth < 6 && node !== null; depth += 1) {
      rows.push({ word, depth, ...describe(node) });
      node = node.parentElement;
    }
  }
  return rows;
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
    await page.evaluate(SETTLE);
    const rows = await page.evaluate(CHAIN);
    console.log(`\n######## ${side} ########`);
    for (const row of rows) {
      console.log(`\n[${row.word} tiefe ${row.depth}] ${row.tag} top ${row.top} ${row.left},${row.width}x${row.height}`);
      console.log(`  transform ${row.transform} · text-transform ${row.textTransform} · ${row.fontFamily} ${row.fontSize} ls ${row.letterSpacing}`);
      console.log(`  variablen ${JSON.stringify(row.variables)}`);
      console.log(row.html.split("\n").map((line) => "  " + line).join("\n"));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
