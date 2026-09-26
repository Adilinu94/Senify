/* Dritte Befundprüfung: Baumreiter, Schalenreiter, Kontextmenü, Toast.
   Aufruf: node .scratch/editor-v2-rebuild/pruef-befunde3.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);
const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(220); };
const out = {};

/* 1. Baumreiter: Ebenen / Seiten / Komponenten */
await go("#/editor");
out.baumReiter = await page.evaluate(async () => {
  const panel = document.querySelector(".ed-explorer");
  const sig = () => (panel ? panel.textContent.replace(/\s+/g, " ").trim().slice(0, 90) : null);
  const res = [];
  for (const sel of ['[data-eact="tab-pages"]', '[data-eact="tab-components"]']) {
    const b = document.querySelector(sel);
    const vorher = sig();
    if (b) b.click();
    await new Promise((r) => setTimeout(r, 90));
    res.push({ knopf: sel, vorher, nachher: sig(), gleich: vorher === sig() });
  }
  return res;
});

/* 2. Schalenreiter in den Einstellungen */
await go("#/settings");
out.schalenReiter = await page.evaluate(async () => {
  const btns = [...document.querySelectorAll("button")].filter((b) => /^(Site|Theme|Domains|Agent & MCP|Sicherung)$/.test((b.textContent || "").trim()));
  const sig = () => {
    const main = document.querySelector(".work, main, .shell, .content");
    return main ? main.textContent.replace(/\s+/g, " ").trim().slice(0, 80) : document.body.textContent.replace(/\s+/g, " ").trim().slice(0, 80);
  };
  const res = [];
  for (const b of btns) {
    const vorher = sig();
    b.click();
    await new Promise((r) => setTimeout(r, 90));
    res.push({ tab: b.textContent.trim(), gleich: vorher === sig(), jetzt: sig() });
  }
  return { gefunden: btns.length, res, aktiv: [...document.querySelectorAll("[aria-selected='true'], .is-active")].map((e) => (e.textContent || "").trim().slice(0, 18)) };
});

/* 3. Kontextmenü: Geometrie und Beschriftungen */
await go("#/editor");
await page.evaluate(() => {
  const row = [...document.querySelectorAll(".tree-row")][3];
  if (!row) return;
  const r = row.getBoundingClientRect();
  row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: r.x + 40, clientY: r.y + 10 }));
});
await page.waitForTimeout(250);
out.kontextmenue = await page.evaluate(() => {
  const menu = document.querySelector(".menu, [role=menu]");
  if (!menu) return { gefunden: false };
  const r = menu.getBoundingClientRect();
  const c = getComputedStyle(menu);
  const rows = [...menu.children].map((e) => {
    const rr = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { tag: e.tagName, cls: (e.className || "").toString().slice(0, 20), text: (e.textContent || "").trim().slice(0, 24), w: Math.round(rr.width), h: Math.round(rr.height), display: cs.display, overflow: cs.overflow };
  });
  return {
    gefunden: true, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    overflow: c.overflow, maxH: c.maxHeight, radius: c.borderTopLeftRadius, anzahl: rows.length, rows,
    viewport: { w: innerWidth, h: innerHeight },
  };
});

/* 4. Toast: Position gegen die Statusleiste */
await go("#/editor");
await page.evaluate(() => document.querySelector('[data-eact="toast-note"], [data-act="toast-note"]')?.click());
await page.waitForTimeout(300);
out.toast = await page.evaluate(() => {
  const t = document.querySelector(".toast");
  const s = document.querySelector(".ed-status, footer, .status");
  const r = t ? t.getBoundingClientRect() : null;
  const rs = s ? s.getBoundingClientRect() : null;
  return {
    toast: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), radius: getComputedStyle(t).borderTopLeftRadius, bottom: Math.round(r.bottom) } : null,
    status: rs ? { y: Math.round(rs.y), h: Math.round(rs.height) } : null,
    ueberlappt: r && rs ? r.bottom > rs.y : null,
    fensterHoehe: innerHeight,
  };
});

/* 5. Bühne im Dunkeln: liegt heller Site-Text auf dunklem Grund? */
await go("#/editor");
await page.evaluate(() => document.documentElement.setAttribute("data-mode", "dark"));
await page.waitForTimeout(250);
out.buehneDunkel = await page.evaluate(() => {
  const frame = document.querySelector("[data-frame]");
  const seite = frame ? frame.querySelector(".site, .site__page, .page, .doc") : null;
  const h1 = frame ? frame.querySelector("h1, .site__h1, [class*=title]") : null;
  const misch = (a, b) => {
    const p = (s) => (s.match(/\d+(\.\d+)?/g) || []).map(Number);
    const A = p(a), B = p(b);
    if (A.length < 3 || B.length < 3) return null;
    const al = A.length > 3 ? A[3] : 1;
    return A.slice(0, 3).map((x, i) => Math.round(x * al + B[i] * (1 - al)));
  };
  const c = (el) => el ? getComputedStyle(el) : null;
  const kb = misch(c(seite)?.backgroundColor || "rgba(0,0,0,0)", c(document.querySelector(".ed-canvas, .canvas, .ed-stage"))?.backgroundColor || "rgb(0,0,0)");
  return {
    seiteBg: c(seite)?.backgroundColor || null,
    h1Color: h1 ? c(h1).color : null,
    h1Text: h1 ? h1.textContent.trim().slice(0, 30) : null,
    seiteBgGemischt: kb,
    modus: document.documentElement.getAttribute("data-mode"),
  };
});
await page.evaluate(() => document.documentElement.setAttribute("data-mode", "light"));

/* 6. Inspektor: Maße der Eigenschaftszeile */
await go("#/editor");
out.eigenschaftszeile = await page.evaluate(() => {
  const f = document.querySelector(".p-field");
  const l = document.querySelector(".p-field label, .p-field .l");
  const row = document.querySelector(".p-row");
  if (!f) return null;
  const c = (e) => e ? getComputedStyle(e) : null;
  return {
    feld: { w: Math.round(f.getBoundingClientRect().width), h: Math.round(f.getBoundingClientRect().height) },
    labelHoehe: l ? Math.round(l.getBoundingClientRect().height) : null,
    labelSchrift: l ? c(l).fontSize + " " + c(l).color : null,
    reiheGap: row ? c(row).gap : null,
    eingabeHoehe: (() => { const e = f.querySelector("select, input"); return e ? Math.round(e.getBoundingClientRect().height) : null; })(),
    inspektorBreite: (() => { const i = document.querySelector(".ed-inspector, .ed-insp"); return i ? Math.round(i.getBoundingClientRect().width) : null; })(),
  };
});

await browser.close();
console.log(JSON.stringify(out, null, 2));
