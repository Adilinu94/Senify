/* Elementor: nur die Testvariable "senifytestvar" loeschen; vorher und nachher die Serverliste ausgeben. */
import { openEditor } from "./lib.mjs";

const { browser, page, shot } = await openEditor();
const liste = () => page.evaluate(async () => {
  const nonce = window.wpApiSettings?.nonce ?? window.elementorWebCliConfig?.nonce ?? window.elementorCommon?.config?.nonce ?? "";
  const r = await fetch("/wp-json/elementor/v1/variables/list", { headers: { "X-WP-Nonce": nonce }, credentials: "same-origin" });
  const j = await r.json();
  const v = j.data?.variables;
  const namen = Array.isArray(v) ? v.map((x) => x.label) : Object.values(v ?? {}).map((x) => x.label);
  return JSON.stringify(namen) + " total=" + j.data?.total;
});
console.log("SERVER vorher: " + (await liste()));
console.log("ROH: " + (await page.evaluate(async () => { const nonce = window.wpApiSettings?.nonce ?? window.elementorWebCliConfig?.nonce ?? window.elementorCommon?.config?.nonce ?? ""; const r = await fetch("/wp-json/elementor/v1/variables/list", { headers: { "X-WP-Nonce": nonce }, credentials: "same-origin" }); return (await r.text()).slice(0, 500); })));
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
await page.waitForTimeout(2000);
await shot("75-variablenliste");
const zeile = page.getByText("senifytestvar", { exact: true }).first();
const knoepfe = await zeile.evaluate((e) => { let l = e; for (let i = 0; i < 6 && l.parentElement && !l.querySelector("button, [role=button]"); i++) l = l.parentElement; return [...l.querySelectorAll("button, [role=button]")].map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()); });
console.log("ZEILE-KNOEPFE: " + JSON.stringify(knoepfe));
await page.mouse.move(150, 241);
await page.waitForTimeout(500);
await page.evaluate(() => { const b = [...document.querySelectorAll("button, [role=button]")].find((x) => Math.round(x.getBoundingClientRect().x) === 264 && Math.round(x.getBoundingClientRect().y) === 227); console.log; if (b) { b.removeAttribute("disabled"); b.click(); } });
await page.waitForTimeout(1200);
await shot("76-variable-bearbeiten");
console.log("MENUE: " + JSON.stringify(await page.locator("[role=menu]").allInnerTexts()));
if (process.argv[2] === "loeschen") {
  await page.locator("[role=menu]").getByText(/Löschen|Delete/).click();
  await page.waitForTimeout(1200);
  console.log("DIALOG: " + (await page.locator("[role=dialog]").allInnerTexts()).join(" || ").replace(/\s+/g, " ").slice(0, 300));
  await shot("77-variable-bestaetigen");
  const ok = page.locator("button:visible", { hasText: /^Löschen$/ });
  console.log("Loeschen-Knoepfe: " + (await ok.count()));
  if (await ok.count()) await ok.last().click();
  await page.waitForTimeout(1500);
  const aktiv = page.locator("button:not([disabled])", { hasText: "Änderungen speichern" });
  if (await aktiv.count()) { await aktiv.first().click(); await page.waitForTimeout(3500); console.log("gespeichert"); }
  console.log("SERVER nachher: " + (await liste()));
}
const sicht = await page.evaluate(() => [...document.querySelectorAll("button, [role=button], [role=menuitem]")].filter((b) => b.offsetParent).map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30) + "@" + Math.round(b.getBoundingClientRect().x) + "," + Math.round(b.getBoundingClientRect().y)).filter((s) => !/^(Element|Angie|Seite|Verlauf|Elementor)/.test(s)));
console.log("SICHTBAR: " + JSON.stringify(sicht));
await browser.close();
