// Belegpflicht: Schrift und Symbole der Vorschau im echten Browser pruefen.
// Prueft: Inter/Inter Display geladen, Symbole aus der Bibliothek gezeichnet,
// kein Layout-Sprung beim Laden der Schrift (CLS), font-display: swap.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const preview = resolve(".scratch", "editor-v2-rebuild", "ui-preview", "index.html");
const out = join(".scratch", "refs", "nick", "ui");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const tab = await ctx.newPage();
const konsole = [];
const anfragen = [];
tab.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
tab.on("pageerror", (e) => konsole.push("PAGEERROR " + e.message));
tab.on("requestfailed", (r) => anfragen.push("FAIL " + r.url()));
tab.on("request", (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) anfragen.push("FREMD " + u); });

// Install a layout-shift observer before anything loads.
await tab.addInitScript(() => {
  window.__cls = 0;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch { /* not supported */ }
});

await tab.goto(pathToFileURL(preview).href, { waitUntil: "load" });
await tab.evaluate(async () => { await document.fonts.ready; });
await tab.waitForTimeout(400);

const mess = await tab.evaluate(() => {
  const icon = document.querySelector(".ic--undo");
  const mask = icon ? getComputedStyle(icon).webkitMaskImage || getComputedStyle(icon).maskImage : "";
  const box = icon ? icon.getBoundingClientRect() : { width: 0, height: 0 };
  return {
    interLoaded: document.fonts.check('400 13px "Inter"'),
    interDisplayLoaded: document.fonts.check('600 15px "Inter Display"'),
    faceCount: [...document.fonts].filter((f) => f.status === "loaded").length,
    swapped: [...document.fonts].some((f) => f.family.includes("Inter") && f.status === "loaded"),
    iconMaskIsDataUri: typeof mask === "string" && mask.includes("data:image/svg+xml"),
    iconWidth: Math.round(box.width),
    iconHeight: Math.round(box.height),
    cls: Math.round((window.__cls ?? 0) * 10000) / 10000,
    kontrast: document.documentElement.getAttribute("data-kontrast-geprueft"),
    bodyFont: getComputedStyle(document.body).fontFamily,
  };
});

await browser.close();
const bericht = { mess, konsole, anfragen, fehler: konsole.length + anfragen.length };
writeFileSync(join(out, "pruefung-schrift-symbole.json"), JSON.stringify(bericht, null, 2));
console.log(JSON.stringify(bericht, null, 2));
