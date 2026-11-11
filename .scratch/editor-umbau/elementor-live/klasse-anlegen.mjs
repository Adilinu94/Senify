/* Elementor: Testklasse "senifytest" anlegen und der Ueberschrift zuweisen, speichern, Frontend pruefen.
   Aufraeumen macht klasse-loeschen.mjs. Die sechs echten Klassen werden nicht angefasst. */
import { openEditor } from "./lib.mjs";
import { join } from "node:path";

const { browser, context, page, shot } = await openEditor();
await page.evaluate(() => {
  const finde = (c) => { if (c.model?.get("widgetType") === "e-heading") return c; for (const k of c.children ?? []) { const r = finde(k); if (r) return r; } return null; };
  window.$e.run("document/elements/select", { container: finde(window.elementor.documents.getCurrent().container) });
});
await page.waitForTimeout(1200);
await page.locator("#elementor-panel").getByText("Stil", { exact: true }).first().click({ timeout: 8000 });
await page.waitForTimeout(800);
await page.getByPlaceholder("Klassennamen eingeben").click();
await page.keyboard.type("senifytest");
await page.waitForTimeout(1200);
await shot("51-klasse-tippen");
console.log("DROPDOWN: " + (await page.locator("[role=listbox], [role=presentation], [role=menu]").allInnerTexts()).join(" || ").replace(/\s+/g, " ").slice(0, 400));
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
await shot("52-klasse-angelegt");
console.log("CHIPS: " + (await page.locator("#elementor-panel").innerText()).split("\n").slice(0, 14).join(" | "));
await page.getByText("Typografie", { exact: true }).first().click();
await page.waitForTimeout(500);
await page.keyboard.press("Control+S");
await page.waitForTimeout(4000);

const vorschau = await context.newPage();
await vorschau.goto(`https://hcm.local/?page_id=${process.env.HCM_POST}&preview=true`, { waitUntil: "load", timeout: 120000 });
await vorschau.waitForTimeout(2000);
console.log("FRONTEND class: " + (await vorschau.locator(".e-heading-base").first().getAttribute("class")));
await browser.close();
