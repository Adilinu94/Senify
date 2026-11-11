/* Elementor-Klassen-Manager: nur "senifytest" loeschen. Ende: Klassenliste zur Kontrolle (soll 6 sein). */
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
await page.getByText("Verstanden", { exact: true }).click({ timeout: 4000 }).catch((e) => console.log("Verstanden: " + e.message.slice(0, 60)));
await page.waitForTimeout(800);
const zeile = page.locator("body").getByText("senifytest", { exact: true }).first();
const info = await zeile.evaluate((e) => { let n = e; for (let i = 0; i < 4 && n.parentElement; i++) n = n.parentElement; return n.outerHTML.replace(/class="[^"]*"/g, "").slice(0, 900); });
console.log("ZEILE: " + info.length);
await shot("57-manager-zeile");
const knoepfe = await zeile.evaluate((e) => { let n = e.closest("li"); return [...n.querySelectorAll("button, [role=button]")].map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()); });
console.log("KNOEPFE: " + JSON.stringify(knoepfe));
await zeile.evaluate((e) => e.closest("li").querySelector("[aria-label=\"More actions\"]").click());
await page.waitForTimeout(800);
console.log("MENUE: " + JSON.stringify(await page.locator("[role=menu]").allInnerTexts()));
await shot("58-manager-menue");
await page.locator("[role=menu]").getByText("Löschen", { exact: true }).click();
await page.waitForTimeout(1200);
console.log("DIALOG: " + (await page.locator("[role=dialog]").allInnerTexts()).join(" || ").replace(/\s+/g, " ").slice(0, 400));
await shot("59-nach-loeschen");
const bestaetigen = page.locator("[role=dialog]").getByRole("button", { name: /Löschen|Delete|Bestätigen/ });
if (await bestaetigen.count()) { await bestaetigen.last().click(); await page.waitForTimeout(1200); console.log("bestaetigt"); }
await page.waitForTimeout(2000);
const stand = await page.evaluate(() => ({ klassen: [...document.querySelectorAll("li[role=listitem]")].map((l) => l.textContent.trim().slice(0, 30)), knoepfe: [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Änderungen speichern").map((b) => b.disabled) }));
console.log("NACH BESTAETIGEN: " + JSON.stringify(stand));
const aktiv = page.locator("button:not([disabled])", { hasText: "Änderungen speichern" });
if (await aktiv.count()) { await aktiv.first().click(); await page.waitForTimeout(3000); console.log("gespeichert"); }
await shot("60-gespeichert");
const text = await page.locator("body").innerText();
const i = text.search(/Klassen\s*\n+\s*\d+/);
console.log("MANAGER:\n" + text.slice(Math.max(0, i), i + 200).replace(/\n{2,}/g, "\n"));
await browser.close();
