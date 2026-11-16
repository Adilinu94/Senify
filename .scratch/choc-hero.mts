import { chromium } from "playwright";
const ziel = process.argv[2]!;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
await page.addInitScript("window.__name = (f) => f;");
await page.goto(ziel, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2500);
const d = await page.evaluate(() => {
  const h = [...document.querySelectorAll("h1,h2,h3")].find((e) => (e.textContent ?? "").includes("Run the company"))!;
  const out: string[] = [];
  let cur: Element | null = h;
  for (let i = 0; i < 7 && cur; i += 1, cur = cur.parentElement) {
    const r = cur.getBoundingClientRect(); const cs = getComputedStyle(cur);
    out.push(`${cur.tagName} top=${Math.round(r.top + scrollY)} h=${Math.round(r.height)} w=${Math.round(r.width)} pad=${cs.paddingTop}/${cs.paddingBottom} gap=${cs.rowGap} lh=${cs.lineHeight} fs=${cs.fontSize} disp=${cs.display} dir=${cs.flexDirection} jc=${cs.justifyContent}`);
    const prev = cur.previousElementSibling;
    if (prev) { const pr = prev.getBoundingClientRect(); out.push(`   prevSib ${prev.tagName} top=${Math.round(pr.top + scrollY)} h=${Math.round(pr.height)}`); }
  }
  return out;
});
console.log(d.join("\n"));
await browser.close();