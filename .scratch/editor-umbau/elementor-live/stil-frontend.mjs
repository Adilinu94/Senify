/* Heading mit Link anlegen, Entwurf speichern, Frontend-Vorschau lesen, Stil-Tab und Zustaende erkunden.
   Aufruf: $env:HCM_POST=<id>; node stil-frontend.mjs   (Sitzung aus login/neue-testseite.mjs) */
import { openEditor, dragWidget, out } from "./lib.mjs";
import { join } from "node:path";

const TEXT = "Senify Abgleich Ueberschrift";
const ZIEL = "https://example.com/ziel";
const { browser, context, page, shot, frame } = await openEditor();
await dragWidget(page, frame, "Überschrift");
const title = page.locator(".ProseMirror").first();
await title.click();
await page.keyboard.press("Control+A");
await page.keyboard.type(TEXT);
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Umschalt-Link" }).click();
await page.waitForTimeout(800);
await page.getByPlaceholder("URL eingeben oder einfügen").fill(ZIEL);
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);
await page.keyboard.press("Control+S");
await page.waitForTimeout(4000);
await shot("20-gespeichert");

// Stil-Tab: Struktur der Abschnitte und Felder
const tabs = await page.locator("#elementor-panel .elementor-panel-navigation .elementor-component-tab, #elementor-panel [role=tab]").allInnerTexts();
console.log("tabs: " + JSON.stringify(tabs));
await page.getByRole("tab", { name: "Stil" }).first().click().catch(async () => { await page.locator("text=Stil").first().click(); });
await page.waitForTimeout(1500);
await shot("21-stil-tab");
const panelText = await page.locator("#elementor-panel").innerText();
console.log("STIL-PANEL:\n" + panelText.replace(/\n{2,}/g, "\n").slice(0, 2500));

// Frontend-Vorschau (angemeldet, Entwurf)
const preview = await context.newPage();
await preview.goto(`https://hcm.local/?page_id=${process.env.HCM_POST}&preview=true`, { waitUntil: "load", timeout: 120000 });
await preview.waitForTimeout(3000);
const html = await preview.locator("h1, h2, h3").filter({ hasText: TEXT }).first().evaluate((e) => e.outerHTML).catch((e) => "n/a " + e.message.slice(0, 100));
console.log("FRONTEND heading: " + html.slice(0, 500));
const stil = await preview.locator("h1, h2, h3").filter({ hasText: TEXT }).first().evaluate((e) => {
  const s = getComputedStyle(e);
  return { fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color, margin: s.margin, tag: e.tagName, aColor: e.querySelector("a") ? getComputedStyle(e.querySelector("a")).color : null, aDeco: e.querySelector("a") ? getComputedStyle(e.querySelector("a")).textDecorationLine : null };
}).catch(() => null);
console.log("FRONTEND stil: " + JSON.stringify(stil));
await preview.screenshot({ path: join(out, "22-frontend.png") });
await browser.close();
