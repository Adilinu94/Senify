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
const d = await page.evaluate(([lo, hi]) => {
  const out: string[] = [];
  for (const el of [...document.querySelectorAll("img, svg, canvas, video")]) {
    const r = el.getBoundingClientRect();
    const y = r.top + window.scrollY;
    if (y > lo && y < hi && r.width > 40) {
      const cs = getComputedStyle(el);
      out.push(`${el.tagName} y=${Math.round(y)} x=${Math.round(r.left)} ${Math.round(r.width)}x${Math.round(r.height)} op=${cs.opacity} vis=${cs.visibility} ${((el as HTMLImageElement).currentSrc || "").split("/").pop()?.slice(0, 24) ?? ""}`);
    }
  }
  return out;
}, [Number(process.argv[4] ?? 2200), Number(process.argv[5] ?? 3700)]);
console.log(d.join("\n"));
await browser.close();