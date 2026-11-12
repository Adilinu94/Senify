import { chromium } from "playwright";
const ziel = process.argv[2]!;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: Number(process.argv[3] ?? 768), height: 1024 } });
await page.addInitScript("window.__name = (f) => f;");
await page.goto(ziel, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.evaluate(async () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await sleep(60); }
  await sleep(1500); window.scrollTo(0, 0); await sleep(300);
});
const d = await page.evaluate(() => {
  const out: string[] = [];
  for (const el of [...document.querySelectorAll("h1,h2,h3,h4,button,a[href]")]) {
    const r = el.getBoundingClientRect();
    const t = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28);
    if (t.length > 3 && r.width > 0) out.push(`${Math.round(r.top + window.scrollY)}|${Math.round(r.height)}|${t}`);
  }
  return out;
});
console.log(d.join("\n"));
await browser.close();