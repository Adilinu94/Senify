// Befund Tablet: Bild ncAdz1... Groesse und Elternkette, Original gegen Build.
import { chromium } from "playwright";
const ziel = process.argv[2]!; // Basis-URL
const kennung = "ncAdz1QPuNirK24HN0tzNMjgB6c";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
await page.addInitScript("window.__name = (f) => f;");
await page.goto(ziel, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.evaluate(async () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await sleep(60); }
  window.scrollTo(0, 0); await sleep(300);
});
const daten = await page.evaluate((k: string) => {
  const out: unknown[] = [];
  for (const img of [...document.querySelectorAll("img")].filter((i) => (i.currentSrc || i.src).includes(k))) {
    const kette: unknown[] = [];
    let cur: Element | null = img;
    for (let i = 0; i < 6 && cur; i += 1, cur = cur.parentElement) {
      const r = cur.getBoundingClientRect();
      const cs = getComputedStyle(cur);
      kette.push({ tag: cur.tagName, cls: (cur.getAttribute("class") ?? "").slice(0, 50), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, ar: cs.aspectRatio, disp: cs.display, objFit: cs.objectFit });
    }
    out.push(kette);
  }
  return out;
}, kennung);
console.log(JSON.stringify(daten, null, 1));
await browser.close();
