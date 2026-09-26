/* Abnahme Bühne: Einpassung, Marker, Größenwechsel.
   Aufruf: node .scratch/editor-v2-rebuild/pruef-buehne.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;
const out = resolve(".scratch/editor-v2-rebuild/aufnahmen-buehne");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];

const geometry = async (page) => page.evaluate(() => {
  const stage = document.querySelector(".ed-stage .canvas");
  const sr = stage.getBoundingClientRect();
  const frames = [...document.querySelectorAll("[data-frame]")].map((f) => {
    const r = f.getBoundingClientRect();
    return { id: f.dataset.frame, x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) };
  });
  const outside = frames.filter((f) => f.x < sr.x - 0.5 || f.right > sr.right + 0.5);
  const zoom = document.querySelector(".ed-zoom")?.textContent.trim();
  const label = document.querySelector(".frame-wrap > .frame-label");
  return {
    stage: { x: Math.round(sr.x), right: Math.round(sr.right), w: Math.round(sr.width) },
    frames,
    ausserhalb: outside.map((f) => f.id),
    zoom,
    labelUeberRahmen: label ? Math.round(document.querySelector(`[data-frame="${label.closest("[data-frame]").dataset.frame}"]`).getBoundingClientRect().x - label.getBoundingClientRect().x) : null,
  };
});

/* --- 1440 --- */
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => errors.push("1440: " + e.message));
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(300);
await page.evaluate(() => { location.hash = "#/editor"; });
await page.waitForTimeout(700);
const g1440 = await geometry(page);
await page.screenshot({ path: join(out, "b01-buehne-1440.png") });

/* Auswahl + Marker */
await page.click('.tree-row[data-id="n9"] .label');
await page.waitForTimeout(400);
await page.screenshot({ path: join(out, "b02-auswahl-1440.png") });
const marker = await page.evaluate(() => {
  const sel = document.querySelector(".selection");
  const treeSel = document.querySelector('.tree-row[aria-selected="true"]')?.dataset.id;
  const content = document.querySelector('[data-frame="desktop"] [data-frame-content]');
  const t = content.querySelector(`[data-node="${treeSel}"]`);
  if (!sel || !t) return null;
  const a = sel.getBoundingClientRect(), b = t.getBoundingClientRect();
  return {
    knoten: treeSel,
    abweichung: { links: Math.round(a.left - b.left), oben: Math.round(a.top - b.top), breite: Math.round(a.width - b.width), hoehe: Math.round(a.height - b.height) },
    badge: (() => { const el = sel.querySelector(".selection__badge"); if (!el) return null; const r = el.getBoundingClientRect(); return { text: el.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), links: Math.round(r.left), rechts: Math.round(r.right) }; })(),
    rahmen: (() => { const r = document.querySelector('[data-frame="desktop"]').getBoundingClientRect(); return { links: Math.round(r.left), rechts: Math.round(r.right) }; })(),
    aktionsknopf: (() => { const el = sel.querySelector(".action-bar button"); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
  };
});
await page.screenshot({ path: join(out, "b03-auswahl-nahe.png"), clip: { x: 264, y: 130, width: 420, height: 260 } });

/* --- Manueller Zoom bleibt beim Größenwechsel erhalten --- */
await page.evaluate(() => { document.querySelector('[data-eact="zoom-menu"]')?.click(); });
await page.waitForTimeout(250);
await page.evaluate(() => { const r = [...document.querySelectorAll(".menu__row, button")].find((e) => /50 %/.test(e.textContent || "")); if (r) r.click(); });
await page.waitForTimeout(400);
const zoom50 = await page.evaluate(() => document.querySelector(".ed-zoom")?.textContent.trim());
await page.setViewportSize({ width: 1200, height: 860 });
await page.waitForTimeout(500);
const zoomNachResize = await page.evaluate(() => document.querySelector(".ed-zoom")?.textContent.trim());
const g1200manuell = await geometry(page);

/* --- Zurück auf Einpassen: passt es sich an 1200 an? --- */
await page.evaluate(() => { document.querySelector('[data-eact="zoom-menu"]')?.click(); });
await page.waitForTimeout(250);
await page.evaluate(() => { const r = [...document.querySelectorAll(".menu__row, button")].find((e) => /An Fenster anpassen/.test(e.textContent || "")); if (r) r.click(); });
await page.waitForTimeout(500);
const g1200fit = await geometry(page);
await page.screenshot({ path: join(out, "b04-buehne-1200.png") });

/* --- 1024 --- */
await page.setViewportSize({ width: 1024, height: 800 });
await page.waitForTimeout(700);
const g1024 = await geometry(page);
await page.screenshot({ path: join(out, "b05-buehne-1024.png") });

/* --- Solo Mobil --- */
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(600);
await page.evaluate(() => { document.querySelector('[data-eact="solo"]')?.click(); });
await page.waitForTimeout(400);
await page.evaluate(() => { const b = document.querySelector('[data-eact="device"][data-device="mobile"]'); if (b) b.click(); });
await page.waitForTimeout(500);
const gSolo = await geometry(page);
await page.screenshot({ path: join(out, "b06-solo-mobil.png") });

/* --- Hover-Marker --- */
await page.evaluate(() => { const b = document.querySelector('[data-eact="solo"]'); if (b) b.click(); });
await page.waitForTimeout(500);
const hov = await page.evaluate(() => {
  const content = document.querySelector('[data-frame="desktop"] [data-frame-content]');
  const t = content.querySelector('[data-node="n4"]');
  if (t) t.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  const hover = document.querySelector("[data-hover]");
  if (!hover || !t) return null;
  const a = hover.getBoundingClientRect(), b = t.getBoundingClientRect();
  return { abweichung: { links: Math.round(a.left - b.left), oben: Math.round(a.top - b.top), breite: Math.round(a.width - b.width) } };
});

/* --- Zustand/sonstige Läufe unverändert --- */
await page.evaluate(() => { document.querySelector('[data-eact="publish"]')?.click(); });
await page.waitForTimeout(400);
const dialogOffen = await page.evaluate(() => !!document.querySelector(".dialog, [role=dialog]"));
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

await browser.close();
console.log(JSON.stringify({ g1440, marker, zoom50, zoomNachResize, g1200manuell, g1200fit, g1024, gSolo, hov, dialogOffen, errors }, null, 2));
