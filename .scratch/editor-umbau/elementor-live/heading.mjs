/* Heading (atomic) auf Testseite 1337 einfügen, Tabs aufnehmen. Sitzung aus %TEMP%\hcm-state.json. */
import { chromium } from "playwright";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const out = resolve(".scratch/editor-umbau/elementor-live/aufnahmen");
mkdirSync(out, { recursive: true });
const POST = process.env.HCM_POST ?? "1337";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  storageState: join(process.env.TEMP ?? ".", "hcm-state.json"),
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror: " + e.message.slice(0, 160)));
const shot = async (n) => { await page.screenshot({ path: join(out, n + ".png") }); console.log("shot " + n); };

await page.goto(`https://hcm.local/wp-admin/post.php?post=${POST}&action=elementor`, { waitUntil: "load", timeout: 120000 });
await page.waitForSelector("#elementor-panel", { timeout: 180000 });
await page.waitForTimeout(8000);
// Struktur-Popup schließen, falls offen.
await page.locator('[aria-label="Schließen"], .e-structure-close, button:has-text("×")').first().click({ timeout: 2000 }).catch(() => {});

const frame = page.frameLocator("#elementor-preview-iframe");
const drop = frame.locator(".elementor-add-section-inner, .elementor-empty-view, .e-empty-view").first();
const widget = page.locator('.elementor-element-wrapper:has-text("Überschrift"), .elementor-panel-category-items :text("Überschrift")').first();
await widget.dragTo(drop, { timeout: 20000 }).catch((e) => console.log("drag failed: " + e.message.slice(0, 120)));
await page.waitForTimeout(3000);
await shot("10-heading-eingefuegt");
console.log("panel tabs: " + (await page.locator("#elementor-panel .elementor-panel-navigation-tab").allInnerTexts()).join(" | "));
await browser.close();
