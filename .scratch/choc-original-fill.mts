// Befund 7: Original fill/color-Kette der Check-Icons (/price).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
const ORIGIN = "https://chocolate-attributes-385353.framer.app";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${ORIGIN}/price`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.evaluate(async () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await sleep(50); }
  window.scrollTo(0, 0); await sleep(300);
});
await page.waitForTimeout(1200);
const daten = await page.evaluate(() => {
  const uses = [...document.querySelectorAll("use")].filter((u) => (u.getAttribute("href") ?? "").includes("svg-2019673837_942"));
  const out: unknown[] = [];
  for (const use of uses.slice(0, 2)) {
    const svg = use.closest("svg");
    if (!svg) continue;
    const kette: unknown[] = [];
    let cur: Element | null = svg;
    while (cur && cur !== document.documentElement) {
      const cs = getComputedStyle(cur);
      kette.push({
        tag: cur.tagName, cls: (cur.getAttribute("class") ?? "").slice(0, 60),
        fill: cs.fill, color: cs.color,
        inlineFill: cur.getAttribute("fill"),
        style: (cur.getAttribute("style") ?? "").slice(0, 160),
      });
      cur = cur.parentElement;
    }
    // Symbol-Definition
    const sym = document.getElementById("svg-2019673837_942");
    out.push({ kette, symbol: sym ? sym.outerHTML.slice(0, 500) : null });
  }
  return out;
});
await browser.close();
writeFileSync(resolve(".scratch/choc-original-fill.json"), JSON.stringify(daten, null, 2));
console.log(JSON.stringify(daten, null, 1).slice(0, 3000));