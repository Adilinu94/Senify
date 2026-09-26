/* Lineal und Raster bei Einpass-Zoom.
   Aufruf: node .scratch/editor-v2-rebuild/mess-lineal.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;
const out = resolve(".scratch/editor-v2-rebuild/aufnahmen-buehne");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(300);
await page.evaluate(() => { location.hash = "#/editor"; });
await page.waitForTimeout(600);

for (const [name, label] of [["raster", "Raster"], ["lineal", "Lineal"]]) {
  await page.evaluate((l) => { const b = [...document.querySelectorAll(".ed-tool, button")].find((x) => (x.textContent || "").trim() === l); if (b) b.click(); }, label);
  await page.waitForTimeout(300);
}

const res = await page.evaluate(() => {
  /* Der Rahmen-Zoom wird gemessen, nicht angenommen: das Raster liegt IM
     skalierten Rahmen, seine background-size wird also erneut skaliert. */
  const z = (() => {
    const m = getComputedStyle(document.querySelector('[data-frame="desktop"] [data-frame-content]')).transform.match(/matrix\(([\d.]+)/);
    return m ? parseFloat(m[1]) : 1;
  })();
  const meas = (el, name) => {
    if (!el) return { name, fehlt: true };
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return { name, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), font: c.fontSize, display: c.display };
  };
  const ruler = document.querySelector('[data-frame="desktop"] .ruler');
  const span = ruler ? ruler.querySelector("span") : null;
  const sc = span ? getComputedStyle(span) : null;
  const grid = document.querySelector('[data-frame="desktop"] .grid-overlay');
  const gc = grid ? getComputedStyle(grid) : null;
  return {
    zoom: document.querySelector(".ed-zoom")?.textContent.trim(),
    istAn: { raster: !!document.querySelector(".grid-on"), lineal: !!document.querySelector(".ruler-on") },
    zoomFaktor: z,
    lineal: meas(ruler, "ruler (Bildschirmmaß)"),
    linealSchrift: sc ? { font: sc.fontSize, imBildGemessen: +(parseFloat(sc.fontSize)).toFixed(2) } : null,
    linealBeschriftung: span ? { text: span.textContent.trim(), x: Math.round(span.getBoundingClientRect().x), breiteImBild: Math.round(span.getBoundingClientRect().width) } : null,
    raster: gc ? { dokumentSchritt: gc.backgroundSize, schrittImBild: +((parseFloat(gc.backgroundSize) * z).toFixed(2)) } : null,
    rasterSchrittToken: gc ? gc.backgroundImage.slice(0, 40) : null,
  };
});

await page.screenshot({ path: join(out, "b07-lineal-raster.png") });
await page.screenshot({ path: join(out, "b08-lineal-nahe.png"), clip: { x: 264, y: 80, width: 460, height: 180 } });
await browser.close();
console.log(JSON.stringify(res, null, 2));
