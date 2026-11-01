// Ursache 4: Ist die Transformation der Papiertextur scroll-gekoppelt oder ein
// fester Wert? Die Quelle setzt sie zur Laufzeit (im SSR steht keine).
import { chromium } from "playwright";
const SOURCE_URL = "https://unifiersofjapan.framer.website/";
const NEEDLE = "rR6HYXBrMmX4cRpXfXUOvpvpB0";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3000);
  for (const y of [0, 400, 800, 1600, 2400, 3600, 5200, 7000]) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(400);
    const row = await page.evaluate((needle) => {
      for (const element of document.querySelectorAll("*")) {
        if (!getComputedStyle(element).backgroundImage.includes(needle)) continue;
        const rect = element.getBoundingClientRect();
        return {
          transform: getComputedStyle(element).transform,
          inline: (element.getAttribute("style") || "").slice(0, 400),
          pageTop: Math.round(rect.top + scrollY),
          viewportTop: Math.round(rect.top),
        };
      }
      return null;
    }, NEEDLE);
    console.log(`scrollY=${String(y).padStart(5)}  ${row === null ? "nicht gefunden" : `pageTop=${String(row.pageTop).padStart(6)} viewTop=${String(row.viewportTop).padStart(6)}  ${row.transform}`}`);
    if (row !== null && y === 0) console.log(`   inline=${row.inline}`);
  }
} finally {
  await browser.close();
}
