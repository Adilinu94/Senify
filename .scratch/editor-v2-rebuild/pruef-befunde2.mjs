/* Zweite Befundprüfung: Zeilenumbrüche, Textfarben, Schleier, Baumspalten, Bühne im Dunkeln.
   Aufruf: node .scratch/editor-v2-rebuild/pruef-befunde2.mjs */

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

/* 1. Wie viele Zeilen belegt eine Tabellenzelle? */
const zeilen = async (hash) => {
  await go(hash);
  return await page.evaluate(() => {
    const zaehle = (el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return [...r.getClientRects()].filter((x) => x.height > 4).length;
    };
    return [...document.querySelectorAll("table tbody tr")].slice(0, 4).map((tr) =>
      [...tr.children].map((td) => ({ t: (td.textContent || "").trim().replace(/\s+/g, " ").slice(0, 26), zeilen: zaehle(td), w: Math.round(td.getBoundingClientRect().width) })));
  });
};
out.zeilen = { seiten: await zeilen("#/pages"), "cms-blog": await zeilen("#/cms/blog"), releases: await zeilen("#/releases") };

/* 2. Textfarben der verdächtigen Stellen */
await go("#/references");
out.farbeKarte = await page.evaluate(() => {
  const suche = (t) => [...document.querySelectorAll("body *")].find((e) => !e.children.length && (e.textContent || "").trim().startsWith(t));
  const p = (e) => e ? { text: e.textContent.trim().slice(0, 40), color: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor, el: e.tagName + "." + (e.className || "") } : null;
  return { untertitel: p(suche("SaaS & Tech · Swiss Grid")), link: p(suche("syntiq.example")) };
});
await go("#/design");
out.farbeDesign = await page.evaluate(() => {
  const suche = (t) => [...document.querySelectorAll("body *")].find((e) => (e.textContent || "").trim().startsWith(t) && e.children.length <= 2);
  const e = suche("Die Vorschau nutzt");
  const a = e ? [...e.querySelectorAll("*")].filter((x) => x.tagName === "CODE" || x.tagName === "A" || x.tagName === "STRONG").slice(0, 4).map((x) => ({ tag: x.tagName, text: x.textContent.slice(0, 16), color: getComputedStyle(x).color, decoration: getComputedStyle(x).textDecorationLine })) : [];
  return { absatzGefunden: !!e, auszeichnungen: a };
});

/* 3. Schleier: Deckkraft */
await go("#/editor");
await page.evaluate(() => document.querySelector('[data-act="publish-flow"], [data-eact="publish"]')?.click());
await page.waitForTimeout(300);
out.schleier = await page.evaluate(() => {
  const kandidaten = [...document.querySelectorAll("body *")].filter((e) => {
    const c = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return r.width > 1200 && r.height > 700 && c.position === "fixed" && c.backgroundColor !== "rgba(0, 0, 0, 0)";
  });
  return kandidaten.map((e) => ({ cls: (e.className || "").toString().slice(0, 40), bg: getComputedStyle(e).backgroundColor, z: getComputedStyle(e).zIndex }));
});
await page.keyboard.press("Escape").catch(() => {});

/* 4. Baum: Spaltenbreiten der Zeile */
await go("#/editor");
out.baum = await page.evaluate(() => {
  const row = document.querySelector(".tree-row");
  if (!row) return null;
  const teile = [...row.children].map((c) => {
    const r = c.getBoundingClientRect();
    const c2 = getComputedStyle(c);
    return { tag: c.tagName, cls: (c.className || "").toString().slice(0, 24), x: Math.round(r.x), w: Math.round(r.width), text: (c.textContent || "").trim().slice(0, 24), ws: c2.whiteSpace, ov: c2.overflow, clip: c2.textOverflow };
  });
  const r0 = row.getBoundingClientRect();
  return { zeile: { x: Math.round(r0.x), w: Math.round(r0.width) }, teile };
});
out.baumSpalten = await page.evaluate(() => {
  const grid = getComputedStyle(document.querySelector(".tree-row"));
  return { display: grid.display, columns: grid.gridTemplateColumns, padding: grid.padding, gap: grid.gap };
});

/* 5. Bühne im Dunkelmodus: welche Fläche hat der Site-Inhalt? */
await page.evaluate(() => document.documentElement.setAttribute("data-mode", "light"));
await go("#/editor");
const buehneHell = await page.evaluate(() => {
  const s = [...document.querySelectorAll("[data-frame] *")].filter((e) => e.tagName === "SECTION" || /hero/i.test(e.className || "")).slice(0, 3);
  return s.map((e) => ({ el: e.tagName + "." + (e.className || "").toString().slice(0, 20), bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }));
});
await page.evaluate(() => document.documentElement.setAttribute("data-mode", "dark"));
await page.waitForTimeout(200);
const buehneDunkel = await page.evaluate(() => {
  const s = [...document.querySelectorAll("[data-frame] *")].filter((e) => e.tagName === "SECTION" || /hero/i.test(e.className || "")).slice(0, 3);
  const erste = document.querySelector("[data-frame]");
  return { rahmenBg: erste ? getComputedStyle(erste).backgroundColor : null, inhalte: s.map((e) => ({ el: e.tagName + "." + (e.className || "").toString().slice(0, 20), bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color })) };
});
await page.evaluate(() => document.documentElement.setAttribute("data-mode", "light"));
out.buehne = { hell: buehneHell, dunkel: buehneDunkel };

/* 6. Zustandswahl: gefüllt oder umrandet? Und die Gerätewahl? */
await go("#/editor");
out.wahlen = await page.evaluate(() => {
  const p = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return { sel, fehlt: true };
    const c = getComputedStyle(e);
    return { sel, text: (e.textContent || "").trim().slice(0, 14), bg: c.backgroundColor, color: c.color, border: c.borderTopWidth + " " + c.borderTopColor, radius: c.borderTopLeftRadius, weight: c.fontWeight };
  };
  return [p('.insp-device .seg button[aria-pressed="true"], .insp-device button.is-on, .insp-device button[aria-selected="true"]'),
          p('.insp-device .seg'),
          p('.insp-state button[aria-pressed="true"], .insp-state button.is-on, .insp-state button[aria-selected="true"]'),
          p('.ed-tab[aria-selected="true"]')];
});

/* 7. Schalten die Reiter der Programm-Schale um? */
await go("#/settings");
out.schalenReiter = await page.evaluate(async () => {
  const tabs = [...document.querySelectorAll('.tabs button, .tab, [data-tab]')].filter((b) => b.tagName === "BUTTON");
  const sig = () => (document.querySelector("main, .main, .shell-main") || document.body).textContent.replace(/\s+/g, " ").trim().slice(0, 60);
  const res = [];
  for (const t of tabs.slice(0, 6)) {
    const vorher = sig();
    t.click();
    await new Promise((r) => setTimeout(r, 60));
    res.push({ tab: t.textContent.trim().slice(0, 14), vorher, nachher: sig(), gleich: vorher === sig() });
  }
  return res;
});

await browser.close();
console.log(JSON.stringify(out, null, 2));
