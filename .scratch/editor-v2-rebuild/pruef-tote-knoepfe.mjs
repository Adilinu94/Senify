/* Prüfung: Wirken die Reiter und das Kontextmenü?
   Aufruf: node .scratch/editor-v2-rebuild/pruef-tote-knoepfe.mjs */

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

const snap = () => page.evaluate(() => {
  const left = document.querySelector('.ed-left, [class*="left"], aside');
  const insp = document.querySelector('[class*="insp"]');
  const menu = document.querySelector('.menu, .ed-menu, [role="menu"]');
  return {
    left: left ? left.innerText.replace(/\s+/g, " ").slice(0, 90) : null,
    insp: insp ? insp.innerText.replace(/\s+/g, " ").slice(0, 90) : null,
    menuCount: document.querySelectorAll('.menu, .ed-menu, [role="menu"]').length,
    menuText: menu ? menu.innerText.replace(/\s+/g, " ").slice(0, 80) : null,
    treeRows: document.querySelectorAll(".tree-row").length,
    activeTabs: [...document.querySelectorAll(".ed-tab, [role=tab]")].filter((t) => (t.getAttribute("aria-selected") === "true" || /is-active|active/.test(t.className))).map((t) => t.textContent.trim().slice(0, 22)),
  };
});

const out = {};
out.basis = await snap();

/* Reiter im Ebenen-Panel */
for (const [key, sel] of [["seiten", '[data-eact="tab-pages"]'], ["komponenten", '[data-eact="tab-components"]'], ["ebenen", '[data-eact="tab-ebenen"], .ed-tab']]) {
  await page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); }, sel);
  await page.waitForTimeout(300);
  out["panel_" + key] = await snap();
}
/* zurück auf Ebenen */
await page.evaluate(() => { const b = [...document.querySelectorAll(".ed-tab")].find((x) => /Ebenen/.test(x.textContent)); if (b) b.click(); });
await page.waitForTimeout(250);

/* Reiter im Inspektor */
for (const t of ["Content", "Interactions", "Advanced", "Style"]) {
  await page.evaluate((name) => { const b = [...document.querySelectorAll('[data-eact="insp-tab"]')].find((x) => x.textContent.trim() === name); if (b) b.click(); }, t);
  await page.waitForTimeout(300);
  out["insp_" + t] = await snap();
}

/* Kontextmenü auf der Bühne: echter Rechtsklick */
const frame = await page.$("[data-frame]");
if (frame) {
  const box = await frame.boundingBox();
  await page.mouse.click(box.x + 60, box.y + 60, { button: "right" });
  await page.waitForTimeout(400);
  out.rechtsklick = await snap();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

/* Rechtsklick auf eine Baumzeile */
const row = await page.$('.tree-row[data-id="n9"]');
if (row) {
  const b = await row.boundingBox();
  await page.mouse.click(b.x + 40, b.y + 8, { button: "right" });
  await page.waitForTimeout(400);
  out.rechtsklick_baum = await snap();
}

/* Spotlight: gibt es Befehle? */
await page.keyboard.press("Escape");
await page.keyboard.press("Control+k");
await page.waitForTimeout(350);
out.spotlight = await page.evaluate(() => ({
  gruppen: [...document.querySelectorAll(".spotlight__group, .spotlight h3, .spotlight [class*=head]")].map((e) => e.textContent.trim().slice(0, 24)),
  zeilen: [...document.querySelectorAll(".spotlight__row")].map((e) => e.textContent.trim().replace(/\s+/g, " ").slice(0, 44)),
}));

await browser.close();
console.log(JSON.stringify(out, null, 2));
