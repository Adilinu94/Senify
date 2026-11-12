import { chromium } from "playwright";
const ziel = process.argv[2]!; const w = Number(process.argv[3] ?? 768);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: w, height: 1024 } });
await page.addInitScript("window.__name = (f) => f;");
await page.goto(ziel, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2500);
const d = await page.evaluate(() => {
  const h = [...document.querySelectorAll("h1,h2,h3")].find((e) => (e.textContent ?? "").includes("Run the company"))!;
  const pill = h.parentElement!.previousElementSibling!;
  const out: string[] = [];
  const walk = (el: Element, depth: number) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    out.push(`${"  ".repeat(depth)}${el.tagName}.${(el.getAttribute("class") ?? "").split(" ").slice(0, 2).join(".")} ${r.width.toFixed(1)}x${r.height.toFixed(1)} pad=${cs.padding} border=${cs.borderTopWidth} lh=${cs.lineHeight} fs=${cs.fontSize} ff=${cs.fontFamily.slice(0, 30)} disp=${cs.display} ai=${cs.alignItems} txt="${el.children.length === 0 ? (el.textContent ?? "").trim().slice(0, 30) : ""}"`);
    if (depth < 6) for (const c of el.children) walk(c, depth + 1);
  };
  walk(pill, 0);
  return out;
});
console.log(d.join("\n"));
await browser.close();