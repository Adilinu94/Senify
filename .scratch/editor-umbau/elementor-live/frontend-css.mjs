/* Frontend-Vorschau: welche CSS-Regeln tragen die Ueberschrift (Klasse, Hover, Tablet)? */
import { chromium } from "playwright";
import { join } from "node:path";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, storageState: join(process.env.TEMP ?? ".", "hcm-state.json") });
const page = await context.newPage();
await page.goto(`https://hcm.local/?page_id=${process.env.HCM_POST}&preview=true`, { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const h = document.querySelector(".e-heading-base");
  const out = { klassen: h.className, id: h.getAttribute("data-id"), regeln: [] };
  const sammle = (rules, kopf) => {
    for (const r of rules) {
      if (r.cssRules && !r.selectorText) sammle(r.cssRules, (kopf ? kopf + " > " : "") + (r.conditionText || r.media?.mediaText || ""));
      else if (r.selectorText && (r.selectorText.includes(h.getAttribute("data-id")) || /e-[0-9a-f]{7}-/.test(r.selectorText) && h.className.split(" ").some((c) => r.selectorText.includes(c)))) out.regeln.push((kopf ? "[" + kopf + "] " : "") + r.cssText.slice(0, 240));
    }
  };
  for (const s of document.styleSheets) { try { sammle(s.cssRules, ""); } catch { /* cross-origin */ } }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
