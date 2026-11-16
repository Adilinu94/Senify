/* Pruefen, ob die drei Elementor-Variablen (accent, ueberschrift, hell) im Frontend als CSS-Variablen vorkommen. Nur lesen. */
import { chromium } from "playwright";
import { join } from "node:path";

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: join(process.env.TEMP ?? ".", "hcm-state.json") });
const page = await context.newPage();
await page.goto("https://hcm.local/", { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(2000);
const treffer = await page.evaluate(() => {
  const out = new Set();
  const sammle = (rules) => { for (const r of rules) { if (r.cssRules && !r.selectorText) sammle(r.cssRules); else if (r.style) for (const n of r.style) if (/^--(e-global-var-)?(accent|ueberschrift|hell)\b/i.test(n) || /(accent|ueberschrift|hell)/i.test(n) && n.startsWith("--e-global")) out.add(n + ": " + r.style.getPropertyValue(n).trim().slice(0, 40)); } };
  for (const s of document.styleSheets) { try { sammle(s.cssRules); } catch { /* cross-origin */ } }
  return [...out].slice(0, 20);
});
console.log("TREFFER: " + JSON.stringify(treffer));
await browser.close();
