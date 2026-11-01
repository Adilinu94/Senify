// Probe zu P3-7 Punkt 15, Ursache 2: Wie laeuft die Transformation ueber den
// Scroll? Erwartung: 10 Grad / 150 Prozent ausserhalb des Blicks, Identitaet,
// sobald die Sektion ihre Leseposition erreicht.
import { chromium } from "playwright";
const SOURCE_URL = "https://unifiersofjapan.framer.website/";
const WORD = "moments";
const TOP = 5120;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  for (const offset of [1200, 900, 600, 400, 300, 200, 100, 0, -100, -300]) {
    await page.evaluate((y) => window.scrollTo(0, y), TOP - offset);
    await page.waitForTimeout(350);
    const row = await page.evaluate((word) => {
      for (const element of document.querySelectorAll("div.word")) {
        let own = "";
        for (const child of element.childNodes) {
          if (child.nodeType === 3) own += child.textContent;
        }
        if (own.trim() !== word) continue;
        const rect = element.getBoundingClientRect();
        return {
          transform: getComputedStyle(element).transform,
          inline: element.getAttribute("style"),
          top: Math.round(rect.top),
          height: Math.round(rect.height),
        };
      }
      return null;
    }, WORD);
    console.log(`scrollY=${TOP - offset}  ${row === null ? "nicht gefunden" : `top=${row.top} h=${row.height}  matrix=${row.transform}`}`);
    if (row !== null) console.log(`   inline=${row.inline}`);
  }
} finally {
  await browser.close();
}
