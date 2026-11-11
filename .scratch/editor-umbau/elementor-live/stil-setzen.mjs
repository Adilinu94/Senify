/* Elementor: Schriftgroesse am Desktop (40) und am Tablet (24) setzen, Hover-Textfarbe setzen, speichern,
   Frontend bei drei Breiten und im Hover messen. Voraussetzung: $env:HCM_POST mit der Ueberschrift. */
import { openEditor, out } from "./lib.mjs";
import { join } from "node:path";

const { browser, context, page, shot } = await openEditor();
const waehlen = () => page.evaluate(() => {
  const finde = (c) => { if (c.model?.get("widgetType") === "e-heading") return c; for (const k of c.children ?? []) { const r = finde(k); if (r) return r; } return null; };
  const h = finde(window.elementor.documents.getCurrent().container);
  window.$e.run("document/elements/select", { container: h });
  return h.id;
});
console.log("gewaehlt: " + (await waehlen()));
await page.waitForTimeout(1200);
await page.locator("#elementor-panel").getByText("Stil", { exact: true }).first().click({ timeout: 8000 });
await page.waitForTimeout(800);
await page.getByText("Typografie", { exact: true }).first().click();
await page.waitForTimeout(800);

// Feld "Schriftgroesse" finden: nächster Number-Input hinter der Beschriftung
const feld = async () => {
  const handle = await page.evaluateHandle(() => {
    const label = [...document.querySelectorAll("#elementor-panel *")].find((e) => e.children.length === 0 && e.textContent.trim() === "Schriftgröße");
    let n = label;
    for (let i = 0; i < 6 && n; i++, n = n.parentElement) { const inp = n.querySelector("input"); if (inp) return inp; }
    return null;
  });
  return handle.asElement();
};
const setzen = async (wert) => {
  const el = await feld();
  if (!el) throw new Error("Schriftgroesse-Feld fehlt");
  await el.click({ clickCount: 3 });
  await page.keyboard.type(String(wert));
  await page.keyboard.press("Tab");
  await page.waitForTimeout(800);
};
await setzen(40);
await shot("40-desktop-40");

// Tablet: Responsive-Modus ueber die Geraeteknoepfe oben (zweites Symbol)
await page.mouse.click(829, 24);
await page.waitForTimeout(2500);
const vorher = await (await feld()).inputValue();
console.log("Tablet-Feld vor Eingabe: [" + vorher + "] Platzhalter: " + (await (await feld()).getAttribute("placeholder")));
await setzen(24);
await shot("41-tablet-24");

// Zurueck auf Desktop, Zustand Hover: Menue am Chip
await page.mouse.click(773, 24);
await page.waitForTimeout(2000);
console.log("PANEL nach Desktop: " + (await page.locator("#elementor-panel").innerText()).replace(/\n+/g, " | ").slice(0, 300));
await waehlen(); await page.waitForTimeout(1000);
await page.locator("#elementor-panel").getByText("Stil", { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(800);
const lokal = await page.getByText(/^(lokal|local)$/i).first().boundingBox();
console.log("lokal-Chip: " + JSON.stringify(lokal));
await page.mouse.click(lokal.x + lokal.width + 16, lokal.y + lokal.height / 2);
await page.waitForTimeout(800);
await shot("42a-menue");
await page.mouse.click(51, 372);
await page.waitForTimeout(1200);
await page.mouse.click(238, 676);
await page.keyboard.type("#ff0000");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
await shot("42-hover-zustand");
const panel = await page.locator("#elementor-panel").innerText();
console.log("HOVER-PANEL:\n" + panel.replace(/\n{2,}/g, "\n").slice(0, 900));

await page.keyboard.press("Control+S");
await page.waitForTimeout(4000);

// Frontend: Desktop 1440, Tablet 900, Mobil 390
const preview = await context.newPage();
for (const [name, w] of [["desktop", 1440], ["tablet", 900], ["mobil", 390]]) {
  await preview.setViewportSize({ width: w, height: 900 });
  await preview.goto(`https://hcm.local/?page_id=${process.env.HCM_POST}&preview=true`, { waitUntil: "load", timeout: 120000 });
  await preview.waitForTimeout(2000);
  const fs = await preview.locator(".e-heading-base").first().evaluate((e) => getComputedStyle(e).fontSize).catch(() => "n/a");
  console.log(`FRONTEND ${name} (${w}px): fontSize ${fs}`);
  if (name === "desktop") {
    const link = preview.locator(".e-heading-base").first();
    const vor = await link.evaluate((e) => getComputedStyle(e).color + " | a: " + getComputedStyle(e.querySelector("a") ?? e).color);
    await link.hover({ force: true });
    await preview.waitForTimeout(600);
    const nach = await link.evaluate((e) => getComputedStyle(e).color + " | a: " + getComputedStyle(e.querySelector("a") ?? e).color);
    console.log("FRONTEND hover: vorher " + vor + " nachher " + nach);
  }
}
await browser.close();
