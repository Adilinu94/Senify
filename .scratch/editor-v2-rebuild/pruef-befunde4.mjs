/* Vierte Messung: Kontextmenü sauber, Bühne im Dunkeln als Bild, Schalenreiter mit echter Signatur.
   Aufruf: node .scratch/editor-v2-rebuild/pruef-befunde4.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;
const out = resolve(".scratch/editor-v2-rebuild/aufnahmen");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);
const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(220); };
const res = {};

/* 1. Kontextmenü auf einer Baumzeile */
await go("#/editor");
await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".tree-row")];
  const row = rows.find((r) => /h1|hero-title/.test(r.textContent)) || rows[3];
  const r = row.getBoundingClientRect();
  row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: Math.round(r.x + 60), clientY: Math.round(r.y + 12) }));
});
await page.waitForTimeout(300);
res.kontextmenue = await page.evaluate(() => {
  const sichtbar = [...document.querySelectorAll("body *")].filter((e) => {
    const c = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return c.position === "fixed" && r.width > 40 && r.height > 40 && c.visibility !== "hidden" && c.display !== "none";
  });
  return sichtbar.map((e) => {
    const r = e.getBoundingClientRect();
    const c = getComputedStyle(e);
    return {
      cls: (e.className || "").toString().slice(0, 30),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      overflow: c.overflow, radius: c.borderTopLeftRadius,
      text: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      kinder: [...e.children].slice(0, 3).map((k) => ({ cls: (k.className || "").toString().slice(0, 20), w: Math.round(k.getBoundingClientRect().width), text: (k.textContent || "").trim().slice(0, 14) })),
    };
  });
});
await page.screenshot({ path: join(out, "60-kontextmenue-iso.png") });
await page.keyboard.press("Escape").catch(() => {});

/* 2. Kontextmenü auf der Bühne (Quelltext-Pfad) */
await page.evaluate(() => {
  const el = document.querySelector("[data-node]");
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: Math.round(r.x + 4), clientY: Math.round(r.y + 4) }));
});
await page.waitForTimeout(300);
res.kontextmenueBuehne = await page.evaluate(() => {
  const e = [...document.querySelectorAll("body *")].find((x) => getComputedStyle(x).position === "fixed" && /menu/i.test(x.className || "") );
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { cls: (e.className || "").toString().slice(0, 30), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], radius: getComputedStyle(e).borderTopLeftRadius, text: e.textContent.replace(/\s+/g, " ").trim().slice(0, 70) };
});
await page.screenshot({ path: join(out, "61-kontextmenue-buehne.png") });
await page.keyboard.press("Escape").catch(() => {});

/* 3. Bühne im Dunkelmodus als Bild */
await go("#/editor");
await page.evaluate(() => document.documentElement.setAttribute("data-mode", "dark"));
await page.waitForTimeout(350);
const frame = await page.$("[data-frame]");
if (frame) await frame.screenshot({ path: join(out, "62-rahmen-dunkel.png") });
res.buehne = await page.evaluate(() => {
  const f = document.querySelector("[data-frame]");
  if (!f) return null;
  const h1 = f.querySelector("h1");
  const seite = f.querySelector(".site__page, .site, .page, .doc, section");
  const c = (e) => e ? getComputedStyle(e) : null;
  const kette = [];
  let e = h1;
  while (e && e !== document.body) { kette.push({ el: e.tagName + "." + (e.className || "").toString().slice(0, 24), bg: c(e).backgroundColor, color: c(e).color }); e = e.parentElement; }
  return { h1: h1 ? h1.textContent.trim().slice(0, 24) : null, kette: kette.slice(0, 8) };
});
await page.evaluate(() => document.documentElement.setAttribute("data-mode", "light"));

/* 4. Schalenreiter mit belastbarer Signatur */
await go("#/settings");
res.schalenReiter = await page.evaluate(async () => {
  const btns = [...document.querySelectorAll("button")].filter((b) => /^(Site|Theme|Domains|Agent & MCP|Sicherung)$/.test((b.textContent || "").trim()));
  const panel = () => {
    // Der Kartenblock unter der Reiterleiste
    const tab = document.querySelector(".tabbar, .tabs");
    const karte = document.querySelector(".card");
    return karte ? karte.textContent.replace(/\s+/g, " ").trim().slice(0, 100) : null;
  };
  const liste = [];
  for (const b of btns) {
    b.click();
    await new Promise((r) => setTimeout(r, 80));
    liste.push({ tab: b.textContent.trim(), karte: panel(), laenge: document.body.textContent.replace(/\s+/g, " ").length, aktiv: [...document.querySelectorAll(".tab[aria-selected=true], .tab.is-active, [aria-selected=true]")].map((e) => e.textContent.trim().slice(0, 12)) });
  }
  return liste;
});

/* 5. Editor: Zustandswahl und Gerätewahl als Bild */
await go("#/editor");
const insp = await page.$(".ed-inspector, .ed-insp");
if (insp) await insp.screenshot({ path: join(out, "63-inspektor-kopf.png") });
const bar = await page.$(".ed-toolbar, .ed-tools, .ed-bar");
if (bar) await bar.screenshot({ path: join(out, "64-werkzeugleiste.png") });

await browser.close();
console.log(JSON.stringify(res, null, 2));
