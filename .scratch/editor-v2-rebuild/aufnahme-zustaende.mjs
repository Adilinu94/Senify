/* Zustandsaufnahmen: Menüs, Spotlight mit Treffern, Toast.
   Aufruf: node .scratch/editor-v2-rebuild/aufnahme-zustaende.mjs */

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
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);
const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(250); };
const shot = async (n) => { await page.screenshot({ path: join(out, n + ".png") }); console.log("shot: " + n); };

/* Spotlight mit Treffern */
await go("#/");
await page.keyboard.press("Control+k");
await page.waitForTimeout(350);
await shot("40-spotlight-treffer");
await page.fill("#spot-input", "lei").catch(() => {});
await page.waitForTimeout(300);
await shot("41-spotlight-filter");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

/* Toast: auslösende Handlung suchen */
await go("#/references");
await page.evaluate(() => { document.querySelector('[data-act="ref-import"]')?.click(); });
await page.waitForTimeout(400);
await shot("42-toast");
console.log("toast-sichtbar: " + await page.evaluate(() => { const t = document.querySelector("#toasts"); return t ? t.children.length + " / " + (t.textContent || "").trim().slice(0, 60) : "kein #toasts"; }));

/* Editor: Einfügen-Menü, Kontextmenü, Zoom-Menü, Zustands-Menü */
await go("#/editor");
await page.evaluate(() => { const b = [...document.querySelectorAll(".ed-toolbar .btn, button")].find((x) => /Einfügen/.test(x.textContent || "")); if (b) b.click(); });
await page.waitForTimeout(300);
await shot("43-einfuegen-menue");
await page.keyboard.press("Escape");
await page.waitForTimeout(150);

await page.evaluate(() => { document.querySelector('[data-eact="node-menu"]')?.click(); });
await page.waitForTimeout(300);
await shot("44-ebenen-menue");
await page.keyboard.press("Escape");
await page.waitForTimeout(150);

await page.evaluate(() => { document.querySelector('[data-eact="zoom-menu"]')?.click(); });
await page.waitForTimeout(300);
await shot("45-zoom-menue");
await page.keyboard.press("Escape");
await page.waitForTimeout(150);

/* Kontextmenü auf der Bühne */
await page.evaluate(() => {
  const f = document.querySelector("[data-frame]");
  const r = f?.getBoundingClientRect();
  if (!f || !r) return;
  const ev = (type, x, y) => f.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 2 }));
  ev("contextmenu", r.x + 40, r.y + 40);
});
await page.waitForTimeout(300);
await shot("46-kontextmenue");
await page.keyboard.press("Escape");
await page.waitForTimeout(150);

/* Marker in der Bühne bei 100 % (nicht 32 %) */
await page.evaluate(() => { document.querySelector('[data-eact="zoom-in"]')?.click(); });
await page.waitForTimeout(350);
await shot("47-zoom-groesser");

/* Panel-Reiter Seiten/Komponenten */
await page.evaluate(() => { document.querySelector('[data-eact="tab-components"]')?.click(); });
await page.waitForTimeout(300);
await shot("48-komponenten-tab");

await browser.close();
console.log("fehler: " + JSON.stringify(errs));
