/* Login auf hcm.local und Editor der Testseite öffnen. Zugangsdaten nur aus der Umgebung.
   Aufruf: $env:HCM_USER=...; $env:HCM_PASS=...; node .scratch/editor-umbau/elementor-live/login-open.mjs */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

const out = resolve(".scratch/editor-umbau/elementor-live/aufnahmen");
mkdirSync(out, { recursive: true });
const POST = process.env.HCM_POST ?? "1337";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror: " + e.message.slice(0, 160)));

await page.goto("https://hcm.local/wp-login.php", { waitUntil: "load" });
await page.fill("#user_login", process.env.HCM_USER);
await page.fill("#user_pass", process.env.HCM_PASS);
await Promise.all([page.waitForURL(/wp-admin/, { timeout: 60000 }), page.click("#wp-submit")]);
console.log("login ok: " + page.url());

await page.goto(`https://hcm.local/wp-admin/post.php?post=${POST}&action=elementor`, { waitUntil: "load", timeout: 120000 });
await page.waitForSelector("#elementor-editor-wrapper, #elementor-panel", { timeout: 180000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: join(out, "00-editor-start.png") });
console.log("editor: " + (await page.title()));
// Sitzung bewusst außerhalb des Repos (enthält Cookies).
await context.storageState({ path: join(process.env.TEMP ?? ".", "hcm-state.json") });
await browser.close();
