/* Aufnahme aller Screens des Prototyps für die Bildprüfung.
   Aufruf: node .scratch/editor-v2-rebuild/aufnahme-alle-screens.mjs
   Ausgabe: .scratch/editor-v2-rebuild/aufnahmen/<nr>-<name>.png */

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
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);

const go = async (hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(220);
};
const shoot = async (name) => {
  await page.screenshot({ path: join(out, name + ".png") });
  console.log("shot: " + name);
};

const ROUTES = [
  ["01-start", "#/"],
  ["02-seiten", "#/pages"],
  ["03-editor", "#/editor"],
  ["04-cms", "#/cms"],
  ["05-cms-blog", "#/cms/blog"],
  ["06-cms-eintrag", "#/cms/blog/e1"],
  ["07-medien", "#/media"],
  ["08-referenzen", "#/references"],
  ["09-referenz-detail", "#/references/ref1"],
  ["10-redesign", "#/redesign"],
  ["11-pruefen", "#/review"],
  ["12-releases", "#/releases"],
  ["13-auftraege", "#/jobs"],
  ["14-einstellungen", "#/settings"],
  ["15-designsystem", "#/design"],
];

for (const [name, hash] of ROUTES) {
  await go(hash);
  await shoot(name);
}

/* Zustände im Editor */
await go("#/editor");
await shoot("16-editor-grundzustand");

/* Auswahl über den Baum */
await page.click('.tree-row[data-id="n9"] .label').catch(() => {});
await page.waitForTimeout(200);
await shoot("17-editor-auswahl-section");

/* Agenten-Leiste */
await page.click('[data-eact="agent"]').catch(() => {});
await page.waitForTimeout(250);
await shoot("18-editor-agent");
await page.click('[data-eact="agent-close"]').catch(() => {});
await page.waitForTimeout(150);

/* Verlauf */
await page.click('[data-eact="history"]').catch(() => {});
await page.waitForTimeout(250);
await shoot("19-editor-verlauf");
await page.click('[data-eact="history-close"]').catch(() => {});
await page.waitForTimeout(150);

/* Veröffentlichen */
await page.click('[data-eact="publish"]').catch(() => {});
await page.waitForTimeout(300);
await shoot("20-editor-veroeffentlichen");
await page.keyboard.press("Escape");
await page.waitForTimeout(150);

/* Spotlight leer */
await page.keyboard.press("Control+k");
await page.waitForTimeout(250);
await page.fill("#spot-input", "xyz").catch(() => {});
await page.waitForTimeout(250);
await shoot("21-spotlight-leer");
await page.keyboard.press("Escape");
await page.waitForTimeout(150);

/* Inspektor-Reiter */
await go("#/editor");
for (const [tab, name] of [["style", "22-editor-stil"], ["interactions", "23-editor-interaktion"], ["advanced", "24-editor-erweitert"]]) {
  await page.click(`[data-eact="itab"][data-tab="${tab}"]`).catch(() => {});
  await page.waitForTimeout(220);
  await shoot(name);
}

/* Dunkler Modus: Start, Editor, Design */
for (const [name, hash] of [["25-dunkel-start", "#/"], ["26-dunkel-editor", "#/editor"], ["27-dunkel-design", "#/design"]]) {
  await go("#/design");
  await page.click('[data-act="mode"][data-mode="dark"]').catch(() => {});
  await page.waitForTimeout(150);
  await go(hash);
  await shoot(name);
}
await go("#/design");
await page.click('[data-act="mode"][data-mode="light"]').catch(() => {});
await page.waitForTimeout(150);

/* Schmale Fenster */
const mid = await browser.newPage({ viewport: { width: 1024, height: 800 } });
await mid.goto(target);
await mid.waitForTimeout(300);
await mid.evaluate(() => { location.hash = "#/editor"; });
await mid.waitForTimeout(300);
await mid.screenshot({ path: join(out, "28-editor-1024.png") });
await mid.evaluate(() => { location.hash = "#/"; });
await mid.waitForTimeout(250);
await mid.screenshot({ path: join(out, "29-start-1024.png") });
await mid.close();

const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mob.goto(target);
await mob.waitForTimeout(300);
await mob.screenshot({ path: join(out, "30-mobil-start.png") });
await mob.evaluate(() => { location.hash = "#/releases"; });
await mob.waitForTimeout(250);
await mob.screenshot({ path: join(out, "31-mobil-releases.png") });
await mob.close();

await browser.close();
console.log(JSON.stringify({ errors }, null, 2));
