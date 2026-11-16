/* Gemeinsame Helfer für die Elementor-Live-Aufnahmen auf hcm.local (Testseite 1337). */
import { chromium } from "playwright";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";

export const out = resolve(".scratch/editor-umbau/elementor-live/aufnahmen");
mkdirSync(out, { recursive: true });
export const POST = process.env.HCM_POST ?? "1337";

export async function openEditor() {
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
  return { browser, context, page, shot, frame: page.frameLocator("#elementor-preview-iframe") };
}

export async function dragWidget(page, frame, label) {
  const drop = frame.locator(".elementor-add-section-inner, .elementor-empty-view, .e-empty-view").first();
  const widget = page.locator(".elementor-element-wrapper", { hasText: label }).first();
  await widget.dragTo(drop, { timeout: 20000 });
  await page.waitForTimeout(2500);
}
