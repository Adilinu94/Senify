/* Rauchtest: alle Routen, beide Modi. Sucht JS-Fehler und leere Flächen.
   Aufruf: node .scratch/editor-v2-rebuild/pruef-rauchtest.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;
const ROUTES = [
  "#/", "#/pages", "#/editor", "#/cms", "#/cms/blog", "#/media", "#/references",
  "#/review", "#/releases", "#/jobs", "#/settings", "#/design",
];

const browser = await chromium.launch();
let fehler = 0;

for (const mode of ["light", "dark"]) {
  for (const hash of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const meldungen = [];
    page.on("console", (m) => { if (m.type() === "error") meldungen.push(m.text().slice(0, 90)); });
    page.on("pageerror", (e) => meldungen.push("pageerror: " + String(e).slice(0, 90)));
    await page.goto(target, { waitUntil: "load" });
    await page.evaluate((m) => window.SENIFY_APP.setMode(m), mode);
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(350);
    const inhalt = await page.evaluate(() => {
      const app = document.getElementById("app");
      return { zeichen: (app.textContent || "").trim().length, kinder: app.children.length };
    });
    const leer = inhalt.zeichen < 40 || inhalt.kinder === 0;
    if (meldungen.length || leer) fehler += 1;
    console.log(
      `${(mode + " " + hash).padEnd(16)} ${leer ? "LEER  " : "ok    "} ` +
      `${String(inhalt.zeichen).padStart(5)} Zeichen · ${inhalt.kinder} Kinder` +
      (meldungen.length ? ` · ${meldungen.length} Meldung(en): ${meldungen[0]}` : ""),
    );
    await page.close();
  }
}

await browser.close();
console.log(fehler === 0 ? "\nAlle Routen in beiden Modi fehlerfrei." : `\n${fehler} Auffälligkeit(en).`);
process.exit(fehler === 0 ? 0 : 1);
