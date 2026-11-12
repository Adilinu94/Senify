import { chromium } from "playwright";
const [ziel, text, upS, wS, depthS] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: Number(wS ?? 768), height: 1024 } });
await page.addInitScript("window.__name = (f) => f;");
await page.goto(ziel!, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2500);
const d = await page.evaluate(([text, up, depth]) => {
  const leaf = [...document.querySelectorAll("body *")].find((e) => e.children.length === 0 && (e.textContent ?? "").trim() === text)!;
  let start: Element = leaf; for (let i = 0; i < Number(up); i++) start = start.parentElement!;
  const out: string[] = [];
  const walk = (el: Element, dd: number) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.display === "contents" && false) { out.push(`${"  ".repeat(dd)}${el.tagName} none`); return; }
    const t = el.children.length === 0 ? `"${(el.textContent ?? "").trim().slice(0, 30)}"` : "";
    out.push(`${"  ".repeat(dd)}${el.tagName} y=${Math.round(r.top + scrollY)} ${Math.round(r.width)}x${Math.round(r.height)} fs=${cs.fontSize} lh=${cs.lineHeight} pad=${cs.padding} gap=${cs.rowGap} dir=${cs.flexDirection} ${t}`);
    if (dd < Number(depth)) for (const c of el.children) walk(c, dd + 1);
  };
  walk(start, 0);
  return out;
}, [text, upS ?? "3", depthS ?? "4"]);
console.log(d.join("\n"));
await browser.close();