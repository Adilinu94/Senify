/* Detailvergrößerungen verdächtiger Stellen.
   Aufruf: node .scratch/editor-v2-rebuild/detail-aufnahmen.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;
const out = resolve(".scratch/editor-v2-rebuild/aufnahmen");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);

const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(250); };
const dark = async (on) => {
  await go("#/design");
  await page.evaluate((m) => { document.querySelector(`[data-act="mode"][data-mode="${m}"]`)?.click(); }, on ? "dark" : "light");
  await page.waitForTimeout(200);
};

const JOB = [
  // [Name, Route, Clip{ x,y,width,height }]
  ["d01-seiten-badge", "#/pages", { x: 700, y: 190, width: 420, height: 160 }],
  ["d02-medien-karten", "#/media", { x: 400, y: 330, width: 1010, height: 110 }],
  ["d03-cms-collections", "#/cms", { x: 400, y: 140, width: 1010, height: 160 }],
  ["d04-nav-unten", "#/settings", { x: 0, y: 690, width: 360, height: 210 }],
  ["d05-editor-marker", "#/editor", { x: 260, y: 200, width: 340, height: 120 }],
  ["d06-editor-kante-links", "#/editor", { x: 180, y: 80, width: 320, height: 440 }],
  ["d07-editor-kante-rechts", "#/editor", { x: 980, y: 80, width: 200, height: 440 }],
  ["d08-tree-zeile-hell", "#/editor", { x: 0, y: 215, width: 262, height: 70 }],
  ["d09-dialog-schritte", "#/editor", { x: 440, y: 222, width: 420, height: 125 }],
  ["d10-pruefen-diff", "#/review", { x: 400, y: 250, width: 500, height: 180 }],
  ["d11-releases-datum", "#/releases", { x: 400, y: 150, width: 1010, height: 260 }],
  ["d12-start-karte", "#/start", { x: 400, y: 140, width: 1010, height: 320 }],
  ["d13-auftraege-rechts", "#/jobs", { x: 1100, y: 195, width: 300, height: 330 }],
  ["d14-redesign-karten", "#/redesign", { x: 400, y: 185, width: 1010, height: 325 }],
  ["d15-einstellungen-profil", "#/settings", { x: 400, y: 340, width: 1010, height: 270 }],
  ["d16-referenz-tabs", "#/references/ref1", { x: 400, y: 450, width: 500, height: 300 }],
];

for (const [name, hash, clip] of JOB) {
  await dark(false);
  await go(hash);
  await page.screenshot({ path: join(out, name + ".png"), clip });
  console.log("crop: " + name);
}

/* Dunkelmodus: Felder, Baum-Auswahl, Zustandsreiter */
await dark(true);
await go("#/editor");
await page.screenshot({ path: join(out, "d20-dunkel-felder.png"), clip: { x: 1090, y: 275, width: 350, height: 265 } });
await page.screenshot({ path: join(out, "d21-dunkel-tree.png"), clip: { x: 0, y: 80, width: 262, height: 470 } });
await page.screenshot({ path: join(out, "d22-dunkel-reiter.png"), clip: { x: 1090, y: 80, width: 350, height: 200 } });
await go("#/");
await page.screenshot({ path: join(out, "d23-dunkel-start-oben.png"), clip: { x: 360, y: 0, width: 1080, height: 300 } });
await go("#/releases");
await page.screenshot({ path: join(out, "d24-dunkel-releases.png"), clip: { x: 360, y: 100, width: 1080, height: 380 } });
console.log("crop: dunkel");

await browser.close();
