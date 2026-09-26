/* Gegenprobe: Menü-Selektor, Rechtsklick, Reiter Content/Interactions.
   Aufruf: node .scratch/editor-v2-rebuild/pruef-menue-und-reiter.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = "#/editor"; });
await page.waitForTimeout(400);

const menus = (tag) => page.evaluate((t) => {
  const found = [...document.querySelectorAll(".menu, .ed-menu, [role='menu'], .popover, [class*='menu']")];
  return { wo: t, anzahl: found.length, klassen: found.slice(0, 3).map((e) => String(e.className).slice(0, 40)), text: found.slice(0, 1).map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 60)) };
}, tag);

const out = {};
out.vorher = await menus("vorher");

await page.evaluate(() => { document.querySelector('[data-eact="node-menu"]')?.click(); });
await page.waitForTimeout(350);
out.nachKnopf = await menus("nach node-menu-Klick");
await page.screenshot({ path: join(dir, "..", "aufnahmen", "50-insp-menue.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(250);

const row = await page.$('.tree-row[data-id="n9"]');
if (row) {
  const b = await row.boundingBox();
  await page.mouse.click(b.x + 40, b.y + 8, { button: "right" });
  await page.waitForTimeout(400);
  out.nachRechtsklickBaum = await menus("nach Rechtsklick Baum");
  await page.screenshot({ path: join(dir, "..", "aufnahmen", "51-rechtsklick-baum.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

/* Reiter Content und Interactions ansehen */
for (const [name, tab] of [["52-insp-content", "Content"], ["53-insp-interactions", "Interactions"]]) {
  await page.evaluate((t) => { const b = [...document.querySelectorAll('[data-eact="insp-tab"]')].find((x) => x.textContent.trim() === t); if (b) b.click(); }, tab);
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(dir, "..", "aufnahmen", name + ".png") });
  const panel = await page.evaluate(() => document.querySelector('[class*="insp"]').innerText.replace(/\s+/g, " ").slice(0, 260));
  out[name] = panel;
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
