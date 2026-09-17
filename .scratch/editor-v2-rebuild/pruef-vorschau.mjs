// Belegpflicht Runde 80: Vorschau im Browser pruefen (Aufgabe 31).
// Prueft je Breite: Konsolenfehler, fehlgeschlagene Anfragen, fremde Anfragen, Ueberlauf.
// Legt Screenshots in .scratch/refs/nick/ui/ ab und schreibt einen Bericht als JSON.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const preview = resolve(".scratch", "editor-v2-rebuild", "ui-preview", "index.html");
const out = join(".scratch", "refs", "nick", "ui");
mkdirSync(out, { recursive: true });

const viewports = [
  { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
  { name: "schmal", width: 480, height: 900 },
];

const browser = await chromium.launch({ headless: true });
const report = {};

for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const tab = await ctx.newPage();
  const konsole = [];
  const anfragen = [];

  tab.on("console", (m) => {
    if (m.type() === "error") konsole.push(m.text());
  });
  tab.on("pageerror", (e) => konsole.push(`PAGEERROR ${e.message}`));
  tab.on("requestfailed", (r) => anfragen.push(`FAIL ${r.url()} ${r.failure()?.errorText ?? ""}`));
  tab.on("response", (r) => {
    if (r.status() >= 400) anfragen.push(`HTTP ${r.status()} ${r.url()}`);
  });
  tab.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith("file:") && !url.startsWith("data:") && !url.startsWith("blob:")) {
      anfragen.push(`FREMD ${url}`);
    }
  });

  await tab.goto(pathToFileURL(preview).href, { waitUntil: "load" });
  await tab.waitForTimeout(400);

  await tab.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 250));
  });
  await tab.waitForTimeout(200);

  const mess = await tab.evaluate(() => {
    const wurzel = document.documentElement;
    const inRollenbereich = (el) => {
      let knoten = el.parentElement;
      while (knoten && knoten !== document.body) {
        const sicht = getComputedStyle(knoten);
        if (["auto", "scroll", "hidden", "clip"].includes(sicht.overflowX)) return true;
        knoten = knoten.parentElement;
      }
      return false;
    };
    const zuBreit = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > window.innerWidth + 1 && !inRollenbereich(el);
      })
      .slice(0, 8)
      .map((el) => `${el.tagName}.${typeof el.className === "string" ? el.className : ""}`);
    const buehne = document.querySelector(".app__stage");
    return {
      ueberlaufPx: wurzel.scrollWidth - wurzel.clientWidth,
      zuBreit,
      kontrast: wurzel.getAttribute("data-kontrast-geprueft"),
      kontrastZeilen: document.querySelectorAll("#kontrast-koerper tr").length,
      abschnitte: document.querySelectorAll("main .pv-sec").length,
      ueberschriften: [...document.querySelectorAll("main h2")].map((h) => h.textContent),
      buehneScrollt: buehne ? buehne.scrollWidth >= 0 : null,
      bloecke: {
        rasterSvg: !!document.querySelector('.ed-gridoverlay path[vector-effect="non-scaling-stroke"]'),
        medienflaechen: document.querySelectorAll(".ed-media__area").length,
        typo: !!document.getElementById("typo"),
        mehrfachZeilen: document.querySelectorAll(".ed-multi__row").length,
        aussenband: document.querySelectorAll(".ed-band--margin").length,
        innenband: document.querySelectorAll(".ed-band--padding").length,
        elementmenue: !!document.getElementById("elemmenu"),
        geraetestationen: document.querySelectorAll("#geraet .ed-seg__item").length,
        stilhinweis: !!document.getElementById("stiltext"),
        einrastwert: document.getElementById("einrastwert")?.textContent ?? null,
        rasterbereit: document.getElementById("raster")?.getAttribute("data-raster-bereit") ?? null,
        medienWerkzeuge: document.querySelectorAll(".ed-media__tool").length,
      },
    };
  });

  await tab.screenshot({ path: join(out, `vorschau-${vp.name}.png`) });
  await tab.screenshot({ path: join(out, `vorschau-${vp.name}-voll.png`), fullPage: true });

  for (const [id, datei] of [
    ["#rahmen", "vorschau-abschnitt6-rahmen"],
    ["#felder2", "vorschau-abschnitt7-felder2"],
  ]) {
    const bereich = tab.locator(id);
    if (await bereich.count()) {
      await bereich.screenshot({ path: join(out, `${datei}-${vp.name}.png`) });
    }
  }

  report[vp.name] = { ...mess, konsole, anfragen };
  await ctx.close();
}

await browser.close();
writeFileSync(join(out, "pruefung-runde80.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
