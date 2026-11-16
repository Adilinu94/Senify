/* Login auf hcm.local, neue Entwurfsseite als Testobjekt anlegen (oder per `loeschen` wieder entfernen).
   Zugangsdaten nur aus der Umgebung (HCM_USER, HCM_PASS), nie in Datei oder Log.
   Aufruf: node neue-testseite.mjs            -> legt an, schreibt die ID nach stdout
           node neue-testseite.mjs loeschen N -> verschiebt Seite N in den Papierkorb und loescht sie endgueltig */
import { chromium } from "playwright";
import { join } from "node:path";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
await page.goto("https://hcm.local/wp-login.php", { waitUntil: "load" });
await page.fill("#user_login", process.env.HCM_USER);
await page.fill("#user_pass", process.env.HCM_PASS);
await Promise.all([page.waitForURL(/wp-admin/, { timeout: 60000 }), page.click("#wp-submit")]);
console.log("login ok");
await context.storageState({ path: join(process.env.TEMP ?? ".", "hcm-state.json") });

await page.goto("https://hcm.local/wp-admin/post-new.php?post_type=page", { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.wp && window.wp.apiFetch, null, { timeout: 60000 });

if (process.argv[2] === "loeschen") {
  const id = Number(process.argv[3]);
  const r = await page.evaluate(async (n) => {
    const t = await window.wp.apiFetch({ path: `/wp/v2/pages/${n}?force=true`, method: "DELETE" });
    return { geloescht: t.deleted === true, titel: t.previous?.title?.raw ?? null };
  }, id);
  console.log(JSON.stringify(r));
} else {
  const r = await page.evaluate(async () => {
    const p = await window.wp.apiFetch({ path: "/wp/v2/pages", method: "POST", data: { title: "Senify Abgleich 2026-11-11 Lauf 2", status: "draft" } });
    return { id: p.id, status: p.status };
  });
  console.log(JSON.stringify(r));
}
await browser.close();
