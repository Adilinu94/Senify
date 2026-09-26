/* Marker-Geometrie: wird doppelt skaliert?
   Aufruf: node .scratch/editor-v2-rebuild/mess-marker.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = "#/editor"; });
await page.waitForTimeout(500);

const res = await page.evaluate(() => {
  const out = {};
  const wrap = document.querySelector('[data-frame="desktop"]');
  const content = wrap.querySelector("[data-frame-content]");
  const sel = document.querySelector(".ed-stage .selection");
  const node = document.querySelector('[data-node][data-sel-node], .ed-stage .selection') && document.querySelectorAll("[data-node]")[0];
  const selNodeId = document.querySelector(".ed-status .sel")?.textContent?.trim();
  out.status = selNodeId;
  const cs = getComputedStyle(content);
  out.contentTransform = cs.transform;
  out.contentRect = (() => { const r = content.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })();

  /* Zielknoten über die Auswahl-Kennung im Baum finden */
  const treeSel = document.querySelector('.tree-row[aria-selected="true"]');
  out.treeSel = treeSel ? treeSel.dataset.id : null;
  const t = out.treeSel ? content.querySelector(`[data-node="${out.treeSel}"]`) : null;
  if (t) {
    const tr = t.getBoundingClientRect();
    const fr = content.getBoundingClientRect();
    out.zielKnoten = { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.width), h: Math.round(tr.height) };
    out.erwartetImUeberlager = { x: Math.round(tr.x - fr.x), y: Math.round(tr.y - fr.y), w: Math.round(tr.width), h: Math.round(tr.height) };
  }
  if (sel) {
    const r = sel.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    out.auswahl = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    out.auswahlRelativZumRahmen = { x: Math.round(r.x - wr.x), y: Math.round(r.y - wr.y) };
    out.chrome = {
      badge: (() => { const b = sel.querySelector(".selection__badge"); if (!b) return null; const br = b.getBoundingClientRect(); const bc = getComputedStyle(b); return { w: Math.round(br.width), h: Math.round(br.height), font: bc.fontSize, top: bc.top }; })(),
      knopf: (() => { const b = sel.querySelector(".action-bar button"); if (!b) return null; const br = b.getBoundingClientRect(); return { w: Math.round(br.width), h: Math.round(br.height) }; })(),
      plus: (() => { const b = sel.querySelector(".plus-handle"); if (!b) return null; const br = b.getBoundingClientRect(); return { w: Math.round(br.width), h: Math.round(br.height) }; })(),
      griff: (() => { const b = sel.querySelector(".handle--nw"); if (!b) return null; const br = b.getBoundingClientRect(); return { w: Math.round(br.width), h: Math.round(br.height) }; })(),
    };
  }
  return out;
});

await browser.close();
console.log(JSON.stringify(res, null, 2));
