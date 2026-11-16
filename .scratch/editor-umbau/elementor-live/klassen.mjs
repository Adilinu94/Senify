/* Elementor: Klassenverwaltung lesen (ohne etwas zu aendern). */
import { openEditor } from "./lib.mjs";

const { browser, page, shot } = await openEditor();
await page.evaluate(() => {
  const finde = (c) => { if (c.model?.get("widgetType") === "e-heading") return c; for (const k of c.children ?? []) { const r = finde(k); if (r) return r; } return null; };
  window.$e.run("document/elements/select", { container: finde(window.elementor.documents.getCurrent().container) });
});
await page.waitForTimeout(1200);
await page.locator("#elementor-panel").getByText("Stil", { exact: true }).first().click({ timeout: 8000 });
await page.waitForTimeout(800);
await page.mouse.click(275, 162);
await page.waitForTimeout(2000);
await shot("50-klassenverwaltung");
const text = await page.locator("body").innerText();
const i = text.search(/Klassen|Class Manager|Global Classes/i);
console.log("VERWALTUNG:\n" + text.slice(Math.max(0, i), i + 1500).replace(/\n{2,}/g, "\n"));
await browser.close();
