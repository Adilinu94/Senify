/* Nur lesen: wo liegen die Elementor-Variablen? Netzwerk beim Laden des Editors mitschneiden. */
import { chromium } from "playwright";
import { join } from "node:path";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, storageState: join(process.env.TEMP ?? ".", "hcm-state.json") });
const page = await context.newPage();
page.on("response", async (r) => {
  if (/variable/i.test(r.url())) console.log("NETZ " + r.status() + " " + r.request().method() + " " + r.url().replace("https://hcm.local", "").slice(0, 140) + " :: " + (await r.text().catch(() => "")).slice(0, 400));
});
await page.goto(`https://hcm.local/wp-admin/post.php?post=${process.env.HCM_POST}&action=elementor`, { waitUntil: "load", timeout: 120000 });
await page.waitForSelector("#elementor-panel", { timeout: 180000 });
await page.waitForTimeout(10000);
const globals = await page.evaluate(() => Object.keys(window).filter((k) => /variable|elementorV2/i.test(k)).slice(0, 20));
console.log("GLOBALS: " + JSON.stringify(globals));
await browser.close();
