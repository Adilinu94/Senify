/* Elementor Design-System: Reiter Variablen lesen (und mit Argument "anlegen" / "loeschen" die Testvariable bearbeiten). */
import { openEditor } from "./lib.mjs";

const modus = process.argv[2] ?? "lesen";
const { browser, page, shot } = await openEditor();
page.on("response", async (r) => { if (/variables/i.test(r.url())) console.log("NETZ " + r.status() + " " + r.request().method() + " " + r.url().replace("https://hcm.local", "").slice(0, 120) + " :: " + (await r.text().catch(() => "")).slice(0, 300)); });
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
await page.waitForTimeout(800);
await page.getByText("Variablen", { exact: true }).first().click();
await page.waitForTimeout(5000);
await shot("70-variablen");
console.log("PANEL: " + (await page.locator("text=Design-System").first().evaluate((e) => e.closest("div[class]")?.parentElement?.innerText ?? "").catch(() => "")).replace(/\n+/g, " | ").slice(0, 400));
const stand = async () => page.evaluate(() => {
  const p = document.querySelector("[aria-label='Variablen'], [role=tabpanel]:not([hidden])");
  return (p ?? document.body).innerText.replace(/\n{2,}/g, "\n").slice(0, 700);
});
console.log("VARIABLEN:\n" + (await stand()));
const knoepfe = await page.evaluate(() => [...document.querySelectorAll("button, [role=button]")].map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()).filter(Boolean).slice(0, 40));
console.log("KNOEPFE: " + JSON.stringify(knoepfe));
await browser.close();
