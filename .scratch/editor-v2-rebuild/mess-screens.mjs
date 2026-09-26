/* Messlauf: Zustände, Farben, Maße, Überläufe — für die Bildprüfung.
   Aufruf: node .scratch/editor-v2-rebuild/mess-screens.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;
const out = resolve(".scratch/editor-v2-rebuild/aufnahmen");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);

const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(200); };
const shot = async (n) => { await page.screenshot({ path: join(out, n + ".png") }); return "shot: " + n; };

const log = [];

/* --- Inspektor-Reiter erneut, mit richtigem Selektor --- */
await go("#/editor");
for (const [name, tab] of [
  ["32-insp-stil", "Style"],
  ["33-insp-interaktion", "Interactions"],
  ["34-insp-erweitert", "Advanced"],
]) {
  const ok = await page.evaluate((t) => {
    const b = [...document.querySelectorAll('[data-eact="insp-tab"]')].find((x) => (x.textContent || "").trim() === t);
    if (b) { b.click(); return true; }
    return false;
  }, tab);
  log.push(`reiter ${tab}: ${ok ? "geklickt" : "NICHT GEFUNDEN"}`);
  await page.waitForTimeout(250);
}
log.push(await shot("32-insp-erweitert"));
await page.evaluate(() => { const b = [...document.querySelectorAll('[data-eact="insp-tab"]')].find((x) => (x.textContent || "").trim() === "Style"); if (b) b.click(); });
await page.waitForTimeout(250);
log.push(await shot("33-insp-stil"));

/* Reiter-Namen auslesen */
log.push("inspektor-reiter: " + JSON.stringify(await page.evaluate(() =>
  [...document.querySelectorAll('[data-eact="insp-tab"]')].map((b) => b.textContent.trim()))));
log.push("weitere reiter: " + JSON.stringify(await page.evaluate(() =>
  [...document.querySelectorAll(".ed-tab")].map((b) => b.textContent.trim()))));

/* --- Zustand Hover sichtbar --- */
await page.evaluate(() => { const b = document.querySelector('[data-eact="state"][data-state="hover"]'); if (b) b.click(); });
await page.waitForTimeout(250);
log.push(await shot("34-editor-zustand-hover"));
await page.evaluate(() => { const b = document.querySelector('[data-eact="state"][data-state="base"]'); if (b) b.click(); });
await page.waitForTimeout(150);

/* --- Komponenten-Reiter im Ebenen-Panel --- */
await page.evaluate(() => { const b = document.querySelector('[data-eact="tab-components"]'); if (b) b.click(); });
await page.waitForTimeout(250);
log.push(await shot("35-editor-komponenten"));
await page.evaluate(() => { const b = document.querySelector('[data-eact="tab-pages"]'); if (b) b.click(); });
await page.waitForTimeout(250);
log.push(await shot("36-editor-seiten-tab"));
await page.evaluate(() => { const b = [...document.querySelectorAll(".ed-tab")].find((x) => (x.textContent || "").trim() === "Ebenen"); if (b) b.click(); });
await page.waitForTimeout(200);

/* --- Gerät: Solo Mobil --- */
await page.evaluate(() => { const b = document.querySelector('[data-eact="device"][data-device="mobile"]'); if (b) b.click(); });
await page.waitForTimeout(250);
log.push(await shot("37-editor-geraet-mobil"));
await page.evaluate(() => { const b = document.querySelector('[data-eact="device"][data-device="desktop"]'); if (b) b.click(); });
await page.waitForTimeout(200);

/* --- Maße und Farben --- */
const probe = await page.evaluate(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const info = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const c = cs(el);
    return {
      sel, rect: rect(el),
      bg: c.backgroundColor, color: c.color, border: c.borderTopWidth + " " + c.borderTopColor,
      radius: c.borderTopLeftRadius, font: c.fontSize + "/" + c.fontWeight + " " + c.fontFamily.split(",")[0],
      pad: c.padding,
    };
  };
  const nav = document.querySelector(".nav");
  const navScroll = nav ? { client: nav.clientHeight, scroll: nav.scrollHeight, canScroll: nav.scrollHeight > nav.clientHeight } : null;
  return {
    nav: { rect: rect(nav), scroll: navScroll },
    navActive: (() => { const a = document.querySelector(".nav .is-active, .nav [aria-current], .nav .active"); return a ? { rect: rect(a), text: a.textContent.trim().slice(0, 30) } : null; })(),
    samples: [
      info(".btn--primary"),
      info(".btn--secondary"),
      info(".chip"),
      info("input[type=text], .field input, .p-input"),
      info(".panel"),
    ].filter((s) => !s.missing),
    customProps: (() => {
      const root = getComputedStyle(document.documentElement);
      const names = ["--ui-surface-canvas", "--ui-surface-panel", "--ui-surface-inset", "--ui-ink", "--ui-line", "--ui-hue-lime", "--ui-surface-signal-soft", "--ui-surface-emphasis"];
      const o = {};
      names.forEach((n) => { const v = root.getPropertyValue(n).trim(); if (v) o[n] = v; });
      return o;
    })(),
  };
});

/* Badge-Farben auf Seiten und Einträgen: ist Limette ein Zustand? */
const badges = {};
for (const [name, hash] of [["seiten", "#/pages"], ["cms-blog", "#/cms/blog"], ["releases", "#/releases"], ["auftraege", "#/jobs"]]) {
  await go(hash);
  badges[name] = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("*").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (!/^(Veröffentlicht|Entwurf|Aktiv|Fertig|Wartet|Fehlgeschlagen|Läuft|Offen|dynamisch|Empfohlen|EMPFOHLEN|Alt fehlt|Alt)$/.test(t)) return;
      if (el.children.length) return;
      const c = getComputedStyle(el);
      const p = getComputedStyle(el.parentElement);
      out.push({ text: t, own: c.backgroundColor, parent: p.backgroundColor, color: c.color, radius: c.borderTopLeftRadius, pad: c.padding });
    });
    return out;
  });
}

/* Prüfen-Seite: Diff-Zeilenfarben */
await go("#/review");
const diffColors = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("tr, .diff-row")];
  return rows.slice(0, 8).map((r) => ({ text: r.textContent.trim().replace(/\s+/g, " ").slice(0, 34), bg: getComputedStyle(r).backgroundColor }));
});

/* Dunkelmodus: sind Selektoren invertiert? */
await go("#/design");
await page.evaluate(() => { document.querySelector('[data-act="mode"][data-mode="dark"]')?.click(); });
await page.waitForTimeout(200);
await go("#/editor");
const dark = await page.evaluate(() => {
  const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null; const c = getComputedStyle(el); return { sel, bg: c.backgroundColor, color: c.color, border: c.borderTopColor }; };
  const selRow = document.querySelector('.tree-row[aria-selected="true"]');
  return {
    mode: document.documentElement.getAttribute("data-mode"),
    canvas: getComputedStyle(document.body).backgroundColor,
    treeRowSelected: selRow ? { bg: getComputedStyle(selRow).backgroundColor, color: getComputedStyle(selRow).color } : null,
    selects: [...document.querySelectorAll(".p-select select, select")].slice(0, 4).map((el) => ({ value: (el.value || "").slice(0, 14), bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color })),
    inputs: [...document.querySelectorAll(".p-input input")].slice(0, 4).map((el) => ({ value: (el.value || "").slice(0, 10), bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color })),
    panelBg: pick(".panel") || pick(".ed-panel") || pick("aside"),
    topbar: pick(".ed-top") || pick("header"),
  };
});
await page.evaluate(() => { document.querySelector('[data-act="mode"]')?.click(); });

/* Editor hell: Fokusring und Auswahlfarbe, Radius der Marker */
await page.evaluate(() => { document.documentElement.setAttribute("data-mode", "light"); });
await go("#/editor");
const light = await page.evaluate(() => {
  const sel = document.querySelector('.tree-row[aria-selected="true"]');
  const t = document.querySelector(".ed-tab[aria-selected='true'], .ed-tab[aria-current='true']");
  const marker = document.querySelector("[data-frame] .marker, .marker, .sel-box");
  const frame = document.querySelector("[data-frame]");
  const fr = frame?.getBoundingClientRect();
  const cw = document.querySelector(".ed-canvas, .canvas, .ed-stage");
  const cwr = cw?.getBoundingClientRect();
  return {
    treeRowSelected: sel ? { bg: getComputedStyle(sel).backgroundColor, color: getComputedStyle(sel).color, radius: getComputedStyle(sel).borderTopLeftRadius } : null,
    activeTab: t ? { text: t.textContent.trim().slice(0, 20), underline: getComputedStyle(t).borderBottomColor, borderW: getComputedStyle(t).borderBottomWidth } : null,
    marker: marker ? { cls: marker.className, bg: getComputedStyle(marker).backgroundColor, border: getComputedStyle(marker).borderColor, radius: getComputedStyle(marker).borderTopLeftRadius } : null,
    firstFrame: fr ? { x: Math.round(fr.x), w: Math.round(fr.width) } : null,
    canvasBox: cwr ? { x: Math.round(cwr.x), w: Math.round(cwr.width), scrollW: cw.scrollWidth, clientW: cw.clientWidth } : null,
  };
});

await browser.close();
console.log(log.join("\n"));
console.log("\n=== MAßE ===\n" + JSON.stringify(probe, null, 2));
console.log("\n=== BADGES ===\n" + JSON.stringify(badges, null, 2));
console.log("\n=== DIFF ===\n" + JSON.stringify(diffColors, null, 2));
console.log("\n=== DUNKEL ===\n" + JSON.stringify(dark, null, 2));
console.log("\n=== HELL ===\n" + JSON.stringify(light, null, 2));
console.log("\n=== FEHLER ===\n" + JSON.stringify(errors, null, 2));
