// Schlussbeleg zur Einbindung (Gesamtpruefung, Editor-Oberflaeche).
//
// Prueft am Sollbild der Aufgaben 26/28/29 (`.scratch/editor-v2-rebuild/ui-preview/index.html`)
// ohne laufenden Dienst: greifen Schrift, Symbole und Farben, und gibt es
// Konsolenfehler? Ergebnis: `.scratch/refs/nick/ui/einbindung-abschluss.json`
// und `einbindung-abschluss-1440.png`.
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const preview = resolve(".scratch", "editor-v2-rebuild", "ui-preview", "index.html");
const out = join(".scratch", "refs", "nick", "ui");

const probe = (url) =>
  fetch(url, { signal: AbortSignal.timeout(3000) })
    .then((r) => ({ url, status: r.status }))
    .catch((e) => ({ url, error: String(e?.cause?.code ?? e.message) }));

const dienste = {
  editor: await probe("http://127.0.0.1:4322/"),
  engine: await probe("http://127.0.0.1:4321/"),
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

await tab.goto(pathToFileURL(preview).href, { waitUntil: "load" });
await tab.evaluate(async () => { await document.fonts.ready; });
await tab.waitForTimeout(400);

const mess = await tab.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const token = (name) => root.getPropertyValue(name).trim();
  const rgba = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).backgroundColor : null;
  };
  const icones = [...document.querySelectorAll(".ic")];
  const zeichnung = icones.filter((el) => {
    const s = getComputedStyle(el);
    const m = s.webkitMaskImage || s.maskImage || s.getPropertyValue("--m");
    const r = el.getBoundingClientRect();
    return String(m).includes("data:image/svg+xml") && r.width > 0 && r.height > 0;
  });
  return {
    // Schrift
    bodyFont: getComputedStyle(document.body).fontFamily,
    interCheck: document.fonts.check('400 13px "Inter"'),
    interDisplayCheck: document.fonts.check('600 15px "Inter Display"'),
    geladeneSchnitte: [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`).sort(),
    // Symbole
    symboleGesamt: icones.length,
    symboleMitZeichnung: zeichnung.length,
    // Farben: Token der einen Quelle gegen tokens.ts
    tokSurfacePanel: token("--ed-surface-panel"),
    tokSurfaceCanvas: token("--ed-surface-canvas"),
    tokSignalAccent: token("--ed-signal-accent"),
    tokInkMuted: token("--ed-ink-muted"),
    tokenAnzahl: root.length,
    // Farben: wirklich gemalt? #083247 = rgb(8, 50, 71); Lime #cbff97 = rgb(203, 255, 151)
    statusbarFarbe: rgba(".app__status"),
    accentknopfFarbe: rgba(".ed-btn--accent"),
    // Aufgabe 29: Trennkanten der Panels vorhanden
    trennkanten: document.querySelectorAll(".app__split").length,
    ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

await tab.screenshot({ path: join(out, "einbindung-abschluss-1440.png") });
await browser.close();

const bericht = { dienste, mess, konsole, anfragen, fehler: konsole.length + anfragen.length };
writeFileSync(join(out, "einbindung-abschluss.json"), JSON.stringify(bericht, null, 2));
console.log(JSON.stringify(bericht, null, 2));
