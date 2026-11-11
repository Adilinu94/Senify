import { chromium } from "playwright";

const ORIGIN = "https://gracious-balance-599544.framer.app";
const WIDTH = Number(process.env.SENIFY_PROBE_WIDTH ?? 768);
const NAMEN = (process.env.SENIFY_PROBE_SRC ?? "carlpPM,kmzIY3,23zbhL").split(",");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 1024 } });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const treffer = await page.evaluate((namen) => {
    return namen.map((name) => {
      const alle = Array.from(document.images).filter((image) => (image.getAttribute("src") ?? "").includes(name));
      return {
        name,
        anzahl: alle.length,
        bilder: alle.map((image) => {
          const rect = image.getBoundingClientRect();
          const kette: Record<string, unknown>[] = [];
          let el: Element | null = image;
          for (let tiefe = 0; el !== null && tiefe < 5; tiefe += 1) {
            const style = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            kette.push({
              tag: el.tagName.toLowerCase(),
              klasse: (el.getAttribute("class") ?? "").slice(0, 80),
              styleAttr: (el.getAttribute("style") ?? "").slice(0, 140),
              box: [Math.round(r.width), Math.round(r.height)],
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
            });
            el = el.parentElement;
          }
          return { box: [Math.round(rect.width), Math.round(rect.height)], kette };
        }),
      };
    });
  }, NAMEN);
  console.log(JSON.stringify(treffer, null, 2));
  await page.close();
} finally {
  await browser.close();
}
