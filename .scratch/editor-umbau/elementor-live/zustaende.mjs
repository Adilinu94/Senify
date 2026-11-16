/* Elementor: Zustandsmenue (Hover), Typografie am Desktop/Tablet, Frontend-Pruefung bei drei Breiten.
   Voraussetzung: Seite $env:HCM_POST enthaelt die Ueberschrift aus stil-frontend.mjs. */
import { openEditor, out } from "./lib.mjs";
import { join } from "node:path";

const { browser, context, page, shot, frame } = await openEditor();
const gewaehlt = await page.evaluate(() => {
  const finde = (c) => { if (c.model?.get("widgetType") === "e-heading") return c; for (const k of c.children ?? []) { const r = finde(k); if (r) return r; } return null; };
  const wurzel = window.elementor.documents.getCurrent().container;
  const h = finde(wurzel);
  if (!h) return "kein heading";
  window.$e.run("document/elements/select", { container: h });
  return h.id;
});
console.log("gewaehlt: " + gewaehlt);
await page.waitForTimeout(1500);
await shot("29-nach-klick");
await page.locator("#elementor-panel").getByText("Stil", { exact: true }).first().click({ timeout: 8000 }).catch((e) => console.log("Stil-Klick: " + e.message.slice(0, 80)));
await page.waitForTimeout(1000);

// Das Chip "lokal" und sein Menue
const chip = page.locator("#elementor-panel").getByText("lokal", { exact: true }).first();
await page.mouse.click(85, 190);
await page.waitForTimeout(1000);
await shot("30-lokal-menue");
const popover = await page.locator("[role=menu], [role=listbox], [role=presentation], .MuiPopover-root, [class*=popover i]").allInnerTexts();
console.log("MENUE: " + JSON.stringify(popover).slice(0, 1200));
await page.keyboard.press("Escape");

// Typografie aufklappen und Felder lesen
await page.getByText("Typografie", { exact: true }).first().click();
await page.waitForTimeout(1000);
await shot("31-typografie");
const typo = await page.locator("#elementor-panel").innerText();
console.log("TYPO:\n" + typo.replace(/\n{2,}/g, "\n").slice(0, 1800));
await browser.close();
