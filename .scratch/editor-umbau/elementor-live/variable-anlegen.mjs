/* Elementor: Testvariable "senifytestvar" (Farbe) anlegen, speichern, auf dem Server pruefen, wieder loeschen.
   Die Serverliste war vorher leer (variables/list: total 0). */
import { openEditor } from "./lib.mjs";

const { browser, page, shot } = await openEditor();
const liste = () => page.evaluate(async () => {
  const nonce = window.wpApiSettings?.nonce ?? window.elementorWebCliConfig?.nonce ?? window.elementorCommon?.config?.nonce ?? "";
  const r = await fetch("/wp-json/elementor/v1/variables/list", { headers: { "X-WP-Nonce": nonce }, credentials: "same-origin" });
  const j = await r.json();
  return JSON.stringify(j.data?.variables?.map((v) => v.label ?? v.name) ?? j).slice(0, 300) + " total=" + (j.data?.total ?? "?");
});
console.log("SERVER vorher: " + (await liste()));
await page.evaluate(() => {
  const finde = (c) => { if (c.model?.get("widgetType") === "e-heading") return c; for (const k of c.children ?? []) { const r = finde(k); if (r) return r; } return null; };
  window.$e.run("document/elements/select", { container: finde(window.elementor.documents.getCurrent().container) });
});
await page.waitForTimeout(1200);
await page.locator("#elementor-panel").getByText("Stil", { exact: true }).first().click({ timeout: 8000 });
await page.waitForTimeout(800);
await page.mouse.click(275, 162);
await page.waitForTimeout(2000);
await page.getByText("Verstanden", { exact: true }).click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(600);
await page.getByText("Variablen", { exact: true }).first().click();
await page.waitForTimeout(1500);
await page.mouse.click(269, 156);
await page.waitForTimeout(1200);
await shot("71-variable-plus");
console.log("MENUE: " + JSON.stringify(await page.locator("[role=menu], [role=listbox]").allInnerTexts()).slice(0, 400));
await page.locator("[role=menu]").getByText("Color", { exact: true }).click();
await page.waitForTimeout(1200);
await shot("72-variable-formular");
const felder = await page.evaluate(() => [...document.querySelectorAll("input, textarea")].filter((i) => i.offsetParent).map((i) => (i.getAttribute("aria-label") || i.placeholder || i.name || i.type) + "=" + i.value).slice(0, 12));
console.log("FELDER: " + JSON.stringify(felder));
await page.getByLabel("Name").fill("senifytestvar");
const sicht = await page.evaluate(() => [...document.querySelectorAll("button, [role=button], input")].filter((b) => b.offsetParent && b.getBoundingClientRect().x < 310).map((b) => (b.getAttribute("aria-label") || b.textContent || b.placeholder || b.type).trim().slice(0, 30) + "@" + Math.round(b.getBoundingClientRect().x) + "," + Math.round(b.getBoundingClientRect().y)));
console.log("FORMULAR-ELEMENTE: " + JSON.stringify(sicht));
await shot("73-variable-name");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
const aktiv = page.locator("button:not([disabled])", { hasText: "Änderungen speichern" });
console.log("Speichern aktiv: " + (await aktiv.count()));
if (await aktiv.count()) { await aktiv.first().click(); await page.waitForTimeout(3500); }
await shot("74-variable-gespeichert");
console.log("SERVER nachher: " + (await liste()));
await browser.close();
