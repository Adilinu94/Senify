// Wo bleiben „nobu“/„naga“ (die mobilen Hero-Namen) im Import?
// Die Probe sucht beide Seiten bei 390 px nach Elementen mit diesem Text und
// protokolliert Box, Sichtbarkeit und die ersten Vorfahren.
//
// Usage: node .scratch/p3-7-punkt-15/nobu-probe.mjs

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(".scratch/p3-7-punkt-15/bilder/unifiersofjapan");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer((request, response) => {
  let path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = resolve(ROOT, `.${path}`);
  if (!file.startsWith(ROOT + sep)) return response.writeHead(403).end();
  try {
    response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" }).end(readFileSync(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;

const PROBE = `(() => {
  const round = (value) => Math.round(value * 10) / 10;
  const out = [];
  for (const element of document.querySelectorAll("*")) {
    const own = [...element.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent).join("").trim();
    if (own !== "nobu" && own !== "naga" && own !== "nobunaga") continue;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const chain = [];
    let parent = element.parentElement;
    for (let depth = 0; parent && depth < 6; depth += 1, parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      chain.push(\`\${parent.tagName.toLowerCase()}\${parent.getAttribute("data-node-id") ? "[" + parent.getAttribute("data-node-id") + "]" : ""} disp=\${parentStyle.display} vis=\${parentStyle.visibility} op=\${parentStyle.opacity} \${round(parent.getBoundingClientRect().width)}x\${round(parent.getBoundingClientRect().height)}\`);
    }
    out.push({ own, tag: element.tagName, rect: [rect.left, rect.top + scrollY, rect.width, rect.height].map(round), display: style.display, visibility: style.visibility, opacity: style.opacity, font: style.fontFamily + " " + style.fontSize, chain });
  }
  return { height: document.body.scrollHeight, out };
})()`;

const browser = await chromium.launch();
for (const [side, target] of [["quelle", "https://unifiersofjapan.framer.website/"], ["import", `http://127.0.0.1:${port}/index.html`]]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.evaluate(`(async () => { const step = 600; for (let y = 0; y < document.body.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300)); })()`);
  const probe = await page.evaluate(PROBE);
  console.log(`\n### ${side} @ 390, Höhe ${probe.height}`);
  console.log(probe.out.length === 0 ? "  kein Element mit nobu/naga/nobunaga" : "");
  for (const entry of probe.out) {
    console.log(`  <${entry.tag}> "${entry.own}" box ${entry.rect.join(",")} display=${entry.display} vis=${entry.visibility} op=${entry.opacity} font=${entry.font}`);
    for (const line of entry.chain) console.log(`     ${line}`);
  }
  await context.close();
}
await browser.close();
server.close();
