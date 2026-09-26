/* Befundprüfung: belegt oder widerlegt die Behauptungen aus der Bildprüfung.
   Aufruf: node .scratch/editor-v2-rebuild/pruef-befunde.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);

const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(220); };
const setMode = async (m) => { await page.evaluate((x) => document.documentElement.setAttribute("data-mode", x), m); await page.waitForTimeout(120); };

const out = {};

/* ---------- 1. Schalten die Inspektor-Reiter den Inhalt um? ---------- */
await go("#/editor");
out.inspektorReiter = await page.evaluate(async () => {
  const tabs = [...document.querySelectorAll('[data-eact="insp-tab"]')];
  const panel = document.querySelector(".ed-inspector, .insp, aside.ed-panel, .ed-insp");
  const body = panel || document.body;
  const sig = () => {
    // Signatur des Inspektor-Inhalts: Abschnittstitel + erste Feldbeschriftungen
    const secs = [...body.querySelectorAll(".panel-section__head .t, .panel-section h4")].map((e) => e.textContent.trim());
    const labels = [...body.querySelectorAll(".p-field, .p-row")].slice(0, 30).map((e) => (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40));
    return { secs, first: labels.slice(0, 6), text: (body.textContent || "").replace(/\s+/g, " ").trim().length };
  };
  const res = [];
  for (const t of tabs) {
    t.click();
    await new Promise((r) => setTimeout(r, 90));
    const s = sig();
    res.push({ tab: t.textContent.trim(), aktiv: t.getAttribute("aria-selected"), secs: s.secs, first: s.first, laenge: s.text });
  }
  return res;
});

/* ---------- 2. Signalfarben: gibt es einen bunten Zustand außer Limette/Amber/Rot? ---------- */
const chromatic = async (label) => await page.evaluate(() => {
  const hue = (rgb) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(rgb);
    if (!m) return null;
    const [r, g, b] = [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    const a = m[4] === undefined ? 1 : +m[4];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (a < 0.5 || d < 0.06) return null;           // grau / transparent
    let h;
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = Math.round(h * 60); if (h < 0) h += 360;
    return { h, s: +(d / (1 - Math.abs(max + min - 1)) || 0).toFixed(2), rgb };
  };
  const found = new Map();
  document.querySelectorAll("body *").forEach((el) => {
    if (el.children.length) return;               // nur Blätter: Textträger
    const c = getComputedStyle(el);
    const t = (el.textContent || "").trim();
    if (!t || t.length > 42) return;
    const h = hue(c.color);
    if (!h) return;
    // Limette ~ 70-90, Amber ~ 30-45, Rot ~ 5-25 zulassen, alles andere melden
    const erlaubt = (h.h >= 60 && h.h <= 100) || (h.h >= 20 && h.h <= 50) || h.h <= 15 || h.h >= 340;
    if (erlaubt) return;
    const key = t.slice(0, 24) + "|" + c.color;
    if (!found.has(key)) found.set(key, { text: t.slice(0, 42), color: c.color, hue: h.h, sat: h.s, cls: (el.className || "").toString().slice(0, 40) });
  });
  return [...found.values()].slice(0, 14);
});

out.bunteTexteHell = {};
for (const [n, h] of [["start", "#/"], ["referenzen", "#/references"], ["referenz-detail", "#/references/syntiq"], ["design", "#/design"], ["pruefen", "#/review"]]) {
  await go(h);
  out.bunteTexteHell[n] = await chromatic(n);
}

/* ---------- 3. Radius-Zensus: wie viele Sprachen? ---------- */
const zensus = async (label) => {
  await go("#/editor");
  return await page.evaluate(() => {
    const map = new Map();
    document.querySelectorAll("body *").forEach((el) => {
      const r = getComputedStyle(el).borderTopLeftRadius;
      if (!r || r === "0px") return;
      const r2 = getComputedStyle(el).borderBottomLeftRadius;
      if (r !== r2) return;                       // ungleiche Radien überspringen
      const cls = (el.className || el.tagName).toString().split(/\s+/).slice(0, 2).join(".");
      const key = r.padEnd(9) + "  " + cls.slice(0, 46);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, 26);
  });
};
out.radiusEditor = await zensus();
await go("#/");
out.radiusShell = await zensus();

/* ---------- 4. Dunkelmodus: Selects, color-scheme, Bühne ---------- */
await setMode("dark");
await go("#/editor");
out.dunkel = await page.evaluate(() => {
  const c = (el) => el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, scheme: getComputedStyle(el).colorScheme, border: getComputedStyle(el).borderTopColor } : null;
  const sels = [...document.querySelectorAll("select")].slice(0, 4);
  const inputs = [...document.querySelectorAll("input[type=text], input")].slice(0, 4);
  const frame = document.querySelector("[data-frame], .frame, .site-frame");
  const site = frame ? frame.querySelector(".site, .doc, .page") : null;
  return {
    htmlScheme: getComputedStyle(document.documentElement).colorScheme,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    select: sels.map((el) => ({ v: (el.value || "").slice(0, 12), ...c(el) })),
    input: inputs.map((el) => ({ v: (el.value || "").slice(0, 12), ...c(el) })),
    alleAnzeigen: c([...document.querySelectorAll("*")].find((e) => !e.children.length && (e.textContent || "").trim() === "Alle anzeigen")),
    buehne: c(document.querySelector(".ed-canvas, .canvas, .ed-stage")),
    rahmenInhalt: c(site || frame),
  };
});

/* ---------- 5. Schleier des Dialogs ---------- */
await setMode("light");
await go("#/editor");
await page.evaluate(() => document.querySelector('[data-act="publish-flow"], [data-eact="publish"]')?.click());
await page.waitForTimeout(300);
out.schleier = await page.evaluate(() => {
  const el = [...document.querySelectorAll("body *")].find((e) => {
    const c = getComputedStyle(e);
    return /rgba\(0, 0, 0/.test(c.backgroundColor) && e.getBoundingClientRect().width > 1200;
  });
  if (!el) return { gefunden: false };
  const c = getComputedStyle(el);
  return { gefunden: true, cls: (el.className || "").toString().slice(0, 40), bg: c.backgroundColor, backdrop: c.backdropFilter };
});
await page.keyboard.press("Escape").catch(() => {});

/* ---------- 6. Primärknöpfe je Ansicht (wie viele laute Knöpfe?) ---------- */
const primaryCount = async (h) => {
  await go(h);
  return await page.evaluate(() => {
    const istPrimaer = (el) => {
      const c = getComputedStyle(el);
      const b = c.backgroundColor;
      return /rgb\((\d+), (\d+), (\d+)\)/.test(b) && (() => { const m = b.match(/\d+/g).map(Number); return m[0] < 60 && m[1] < 60 && m[2] < 60; })();
    };
    const kn = [...document.querySelectorAll("button, a.btn, .btn")].filter((e) => e.offsetParent !== null && istPrimaer(e));
    return kn.map((e) => (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 26));
  });
};
out.primaere = {};
for (const [n, h] of [["start", "#/"], ["seiten", "#/pages"], ["editor", "#/editor"], ["pruefen", "#/review"], ["referenzen", "#/references"]]) {
  out.primaere[n] = await primaryCount(h);
}

/* ---------- 7. Tabellen: bricht eine Zelle um? ---------- */
out.tabellen = {};
for (const [n, h] of [["seiten", "#/pages"], ["cms-blog", "#/cms/blog"], ["releases", "#/releases"]]) {
  await go(h);
  out.tabellen[n] = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("table tbody tr")].slice(0, 4);
    return rows.map((r) => [...r.children].map((td) => {
      const c = getComputedStyle(td);
      return {
        t: (td.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30),
        h: Math.round(td.getBoundingClientRect().height),
        w: Math.round(td.getBoundingClientRect().width),
        umbruch: td.getBoundingClientRect().height > 34,
        ws: c.whiteSpace,
      };
    }));
  });
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
console.log("\n=== FEHLER ===\n" + JSON.stringify(errors, null, 2));
