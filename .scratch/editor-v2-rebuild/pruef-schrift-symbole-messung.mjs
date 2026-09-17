// Nachweis (Nachpruefung, Runde 60 des Auftrags): kommen die eingebettete Schrift
// und der Symbolsatz in der Vorschau wirklich an, und ist die laufende
// Editor-Oberflaeche erreichbar?
//
// Ergaenzt `pruef-vorschau-schrift-symbole.mjs` um die berechnete Schriftfamilie,
// die geladenen Schnitte und die Zaehlung "Symbol mit echter Zeichnung".
// Ergebnis: `.scratch/refs/nick/ui/nachweis-schrift-symbole.json` und
// `schrift-symbole-1440.png`.
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const preview = resolve(".scratch", "editor-v2-rebuild", "ui-preview", "index.html");
const out = join(".scratch", "refs", "nick", "ui");

function probe(url) {
  return fetch(url, { signal: AbortSignal.timeout(4000) })
    .then((r) => ({ url, status: r.status }))
    .catch((e) => ({ url, error: String(e?.cause?.code ?? e.message) }));
}

const dienste = {
  editor: await probe("http://127.0.0.1:4322/"),
  engine: await probe("http://127.0.0.1:4321/"),
  editorFontRoute: await probe("http://127.0.0.1:4322/editor-fonts/Inter-Regular.woff2"),
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const tab = await ctx.newPage();
const konsole = [];
const anfragen = [];
tab.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
tab.on("pageerror", (e) => konsole.push("PAGEERROR " + e.message));
tab.on("requestfailed", (r) => anfragen.push("FAIL " + r.url()));
tab.on("request", (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) anfragen.push("FREMD " + u); });
await tab.addInitScript(() => {
  window.__cls = 0;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  } catch { /* nicht unterstuetzt */ }
});
await tab.goto(pathToFileURL(preview).href, { waitUntil: "load" });
await tab.evaluate(async () => { await document.fonts.ready; });
await tab.waitForTimeout(400);

const vorschau = await tab.evaluate(() => {
  const fam = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontFamily : null; };
  const icones = [...document.querySelectorAll(".ic")];
  const zeichnung = icones.map((el) => {
    const s = getComputedStyle(el);
    const m = s.webkitMaskImage || s.maskImage || "";
    const r = el.getBoundingClientRect();
    return { cls: el.className, dataUri: m.includes("data:image/svg+xml"), w: Math.round(r.width), h: Math.round(r.height) };
  });
  return {
    bodyFont: fam("body"),
    displayFont: fam("h2") || fam("h1"),
    interCheck: document.fonts.check('400 16px "Inter"'),
    interDisplayCheck: document.fonts.check('600 16px "Inter Display"'),
    geladeneSchnitte: [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`).sort(),
    symboleGesamt: icones.length,
    symboleMitZeichnung: zeichnung.filter((i) => i.dataUri && i.w > 0 && i.h > 0).length,
    symboleImEingeklapptenBlock: [...document.querySelectorAll(".ic")]
      .filter((el) => el.getBoundingClientRect().width === 0)
      .map((el) => ({ cls: el.className, elternKlasse: el.parentElement?.className ?? null })),
    cls: Math.round((window.__cls ?? 0) * 10000) / 10000,
    kontrast: document.documentElement.getAttribute("data-kontrast-geprueft"),
    kontrastZeilen: document.querySelectorAll("#kontrast-koerper tr").length,
    ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

await tab.screenshot({ path: join(out, "schrift-symbole-1440.png") });
await browser.close();

const bericht = { dienste, vorschau, konsole, anfragen, fehler: konsole.length + anfragen.length };
writeFileSync(join(out, "nachweis-schrift-symbole.json"), JSON.stringify(bericht, null, 2));
console.log(JSON.stringify(bericht, null, 2));
