import { chromium } from "playwright";
const [ziel, wS, xS, yS] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: Number(wS), height: 900 } });
await page.addInitScript("window.__name = (f) => f;");
await page.goto(ziel!, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.evaluate(async () => { const s = (ms: number) => new Promise((r) => setTimeout(r, ms)); for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await s(60); } await s(1500); });
await page.evaluate((y) => scrollTo(0, y - 300), Number(yS));
await page.waitForTimeout(1200);
const d = await page.evaluate(([x, y]) => {
  const vy = y - scrollY;
  return document.elementsFromPoint(x, vy).slice(0, 10).map((el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return `${el.tagName}.${(el.getAttribute("class") ?? "").split(" ").filter((c) => !c.startsWith("__senify")).slice(0, 3).join(".")} ${Math.round(r.width)}x${Math.round(r.height)} bg=${cs.backgroundColor} bgi=${cs.backgroundImage.slice(0, 40)} op=${cs.opacity} z=${cs.zIndex} pos=${cs.position} vis=${el.getAttribute("data-node-id") ?? ""} name=${el.getAttribute("data-framer-name") ?? ""}`;
  });
}, [Number(xS), Number(yS)]);
console.log(d.join("\n"));
await browser.close();