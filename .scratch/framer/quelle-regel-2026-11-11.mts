import { chromium } from "playwright";

const ORIGIN = "https://gracious-balance-599544.framer.app";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1200);
  const regeln = await page.evaluate(() => {
    const out: { media: string; selector: string; css: string }[] = [];
    const stack: { rule: CSSRule; media: string }[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) stack.push({ rule, media: "" });
      } catch {}
    }
    while (stack.length > 0) {
      const entry = stack.pop();
      if (entry === undefined) continue;
      const rule = entry.rule as CSSRule & {
        cssRules?: CSSRuleList;
        conditionText?: string;
        selectorText?: string;
        style?: CSSStyleDeclaration;
      };
      if (rule.cssRules !== undefined && rule.conditionText !== undefined) {
        for (const child of Array.from(rule.cssRules)) {
          stack.push({ rule: child, media: `${entry.media} && ${rule.conditionText}` });
        }
        continue;
      }
      if (rule.selectorText !== undefined && rule.selectorText.includes("185vnn3")) {
        out.push({
          media: entry.media,
          selector: rule.selectorText.slice(0, 120),
          css: rule.style?.cssText.slice(0, 300) ?? "",
        });
      }
    }
    return out;
  });
  console.log(JSON.stringify(regeln, null, 1));
  const gemessen = await page.evaluate(() => {
    const el = document.querySelector(".framer-185vnn3");
    if (!el) return null;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      box: [Math.round(rect.width), Math.round(rect.height)],
      width: style.width,
      height: style.height,
      radius: style.borderRadius,
      transform: style.transform,
      mediaMobile: window.matchMedia("(max-width: 809.98px)").matches,
      mediaTablet: window.matchMedia("(max-width: 1199.98px)").matches,
    };
  });
  console.log("gemessen:", JSON.stringify(gemessen));
  await page.close();
} finally {
  await browser.close();
}
