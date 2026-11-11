/* Heading mit Text + Link: einfügen, befüllen, Entwurf speichern, Reload, Undo/Redo, Stil-Tab.
   Referenz: Elementor 4.2.3 (+ pro-elements), Testseite 1337 auf hcm.local. */
import { openEditor, dragWidget } from "./lib.mjs";

const TEXT = "Senify Abgleich Überschrift";
const ZIEL = "https://example.com/ziel";
const { browser, page, shot, frame } = await openEditor();
await dragWidget(page, frame, "Überschrift");

const title = page.locator(".ProseMirror").first();
await title.click();
await page.keyboard.press("Control+A");
await page.keyboard.type(TEXT);
await page.waitForTimeout(800);

await page.getByRole("button", { name: "Umschalt-Link" }).click();
await page.waitForTimeout(800);
const url = page.getByPlaceholder("URL eingeben oder einfügen");
await url.fill(ZIEL);
await page.waitForTimeout(1500);
await shot("12-link-eingegeben");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
await shot("13-link-bestaetigt");
const heading = frame.locator(".e-heading-base, h2").filter({ hasText: TEXT }).first();
console.log("preview html: " + (await heading.evaluate((e) => e.outerHTML).catch((e) => "n/a " + e.message.slice(0, 80))).slice(0, 400));

// Entwurf speichern (Dropdown neben "Veröffentlichen" bzw. Ctrl+S)
await page.keyboard.press("Control+S");
await page.waitForTimeout(4000);
await shot("14-nach-speichern");
await browser.close();
