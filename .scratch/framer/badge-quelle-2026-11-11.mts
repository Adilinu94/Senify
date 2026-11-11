import { chromium } from "playwright";

const ORIGIN = "https://gracious-balance-599544.framer.app/";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(`(() => {
    const h5 = [...document.querySelectorAll("h5")].find((el) => (el.textContent || "").includes("200+"));
    if (!h5) return null;
    const beschreiben = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        klasse: (el.getAttribute("class") || "").slice(0, 90),
        box: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
        opacity: style.opacity,
        display: style.display,
        background: style.backgroundColor,
        radius: style.borderRadius,
        transform: style.transform,
        kinder: el.children.length,
        stil: (el.getAttribute("style") || "").slice(0, 200),
      };
    };
    const ketten = [];
    let el = h5;
    for (let i = 0; i < 5 && el; i += 1) {
      ketten.push(beschreiben(el));
      el = el.parentElement;
    }
    const container = h5.parentElement && h5.parentElement.parentElement;
    const geschwister = container ? Array.from(container.children).map((child) => beschreiben(child)) : [];
    const punkt = container ? container.children[0] : null;
    const punktKinder = punkt ? Array.from(punkt.children).map((child) => beschreiben(child)) : [];
    return { ketten, geschwister, punktKinder };
  })()`);
  console.log(JSON.stringify(info, null, 2));
} finally {
  await browser.close();
}
