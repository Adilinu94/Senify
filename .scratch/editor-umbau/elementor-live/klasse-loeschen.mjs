/* Elementor: Testklasse "senifytest" von der Ueberschrift loesen und im Klassen-Manager loeschen.
   Fasst nur "senifytest" an; Ende: Liste der Klassen zur Kontrolle. */
import { openEditor } from "./lib.mjs";

const { browser, page, shot } = await openEditor();
await page.evaluate(() => {
  const finde = (c) => { if (c.model?.get("widgetType") === "e-heading") return c; for (const k of c.children ?? []) { const r = finde(k); if (r) return r; } return null; };
  window.$e.run("document/elements/select", { container: finde(window.elementor.documents.getCurrent().container) });
});
await page.waitForTimeout(1200);
await page.locator("#elementor-panel").getByText("Stil", { exact: true }).first().click({ timeout: 8000 });
await page.waitForTimeout(800);
const chip = page.locator("#elementor-panel").getByText("senifytest", { exact: true }).first();
const html = await chip.evaluate((e) => { let n = e; for (let i = 0; i < 3 && n.parentElement; i++) n = n.parentElement; return n.outerHTML.slice(0, 900); });
console.log("CHIP-HTML: " + html);
await shot("53-chip");
await page.locator("[aria-label=\"Edit senifytest\"]").getByRole("button", { name: "Öffne CSS Klassen Menü" }).click();
await page.waitForTimeout(800);
const menue = await page.locator("[role=menu]").allInnerTexts();
console.log("MENUE: " + JSON.stringify(menue).slice(0, 600));
await shot("54-chip-menue");
await page.locator("[role=menu]").getByText("Löschen", { exact: true }).click();
await page.waitForTimeout(1500);
await shot("55-nach-loeschen");
console.log("DIALOG: " + (await page.locator("[role=dialog]").allInnerTexts()).join(" || ").replace(/\s+/g, " ").slice(0, 500));
console.log("CHIPS danach: " + (await page.locator("#elementor-panel").innerText()).split("\n").slice(0, 10).join(" | "));
await page.keyboard.press("Control+S");
await page.waitForTimeout(4000);
await page.mouse.click(275, 162);
await page.waitForTimeout(2000);
await shot("56-manager-danach");
const text = await page.locator("body").innerText();
const i = text.search(/Klassen\s*\n+\s*\d+/);
console.log("MANAGER:\n" + text.slice(Math.max(0, i), i + 300).replace(/\n{2,}/g, "\n"));
await browser.close();
