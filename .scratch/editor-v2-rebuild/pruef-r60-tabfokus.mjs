// Runde 60, Aufgabe 26 (Rest): der Fokus auf einem Panel-Tab ist jetzt an einem
// eigenen 2px-Ring in Lime erkennbar (vorher fasste `outline: none` ihn mit der
// Auswahl zusammen). Dieses Skript macht den Unterschied sichtbar und messbar:
// Screenshot der Matrix-Zeile "Panel-Tab" plus die berechneten Werte von Ruhe,
// Fokus und Auswahl.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const preview = resolve(".scratch", "editor-v2-rebuild", "ui-preview", "index.html");
const out = join(".scratch", "refs", "nick", "ui");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const tab = await ctx.newPage();
await tab.goto(pathToFileURL(preview).href, { waitUntil: "load" });
await tab.waitForTimeout(400);

const zeile = tab.locator("#matrix-ziel tbody tr", { hasText: "Panel-Tab" }).first();
await zeile.scrollIntoViewIfNeeded();
await zeile.screenshot({ path: join(out, "r60-tabfokus-zeile.png") });

const messung = await tab.evaluate(() => {
  const zeile = [...document.querySelectorAll("#matrix-ziel tbody tr")].find(
    (tr) => tr.querySelector(".mx__name")?.textContent === "Panel-Tab",
  );
  const wert = (state) => {
    const zelle = zeile?.querySelector(`.mx__cell[data-state="${state}"]`);
    const btn = zelle?.querySelector(".ed-tab");
    if (!btn) return null;
    const s = getComputedStyle(btn);
    return { outline: s.outline, boxShadow: s.boxShadow, color: s.color };
  };
  return { ruhe: wert("ruhe"), fokus: wert("fokus"), ausgewaehlt: wert("ausgewaehlt") };
});

await browser.close();
const bericht = { messung, gleichFokusAuswahl: JSON.stringify(messung.fokus) === JSON.stringify(messung.ausgewaehlt) };
writeFileSync(join(out, "nachweis-r60-tabfokus.json"), JSON.stringify(bericht, null, 2));
console.log(JSON.stringify(bericht, null, 2));
