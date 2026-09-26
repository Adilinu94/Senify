/* Aufnahmen zum Dunkelmodus-Fix.
   Aufruf: node .scratch/editor-v2-rebuild/aufnahme-dunkelfix.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const out = resolve(".scratch/editor-v2-rebuild/aufnahmen-dunkelfix");
mkdirSync(out, { recursive: true });
const target = pathToFileURL(join(dir, "index.html")).href;
const browser = await chromium.launch();

async function shot(name, { mode, hash, width = 1440, click, clip } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(target, { waitUntil: "load" });
  if (mode) await page.evaluate((m) => window.SENIFY_APP.setMode(m), mode);
  if (hash) await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(500);
  if (click) {
    await page.evaluate((s) => document.querySelector(s)?.click(), click);
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: join(out, `${name}.png`), clip });
  await page.close();
  console.log("✓", name);
}

/* Bühne: Dunkelmodus, Dokumenttext muss Tinte des Dokuments tragen */
await shot("01-editor-dunkel-buehne", { mode: "dark", hash: "#/editor" });
/* Dasselbe hell — Gegenprobe, das Dokument ist in beiden Modi gleich */
await shot("02-editor-hell-buehne", { mode: "light", hash: "#/editor" });
/* Inspektor im Dunkelmodus: die elf Auswahllisten */
await shot("03-inspektor-dunkel", { mode: "dark", hash: "#/editor", clip: { x: 1120, y: 0, width: 320, height: 900 } });
await shot("04-inspektor-hell", { mode: "light", hash: "#/editor", clip: { x: 1120, y: 0, width: 320, height: 900 } });
/* Werkzeugprofil-Feld in einem Dialog (.field, .select) */
await shot("05-medien-dialog-dunkel", { mode: "dark", hash: "#/media", click: '[data-act="generate-image"]' });
await shot("06-medien-dialog-hell", { mode: "light", hash: "#/media", click: '[data-act="generate-image"]' });
/* CMS-Eintrag mit Auswahlliste im Dunkelmodus */
await shot("07-cms-eintrag-dunkel", { mode: "dark", hash: "#/cms/blog" });
/* Content-Reiter: Auswahllisten im Werkzeugprofil dunkel */
await shot("08-editor-content-dunkel", { mode: "dark", hash: "#/editor", click: '[data-eact="insp-tab"][data-tab="Content"]' });

await browser.close();
console.log("Bilder in", out);
