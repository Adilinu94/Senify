// Befund 7: Wie rendert das Original die Icons? (maskierte Elemente suchen)
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = "https://chocolate-attributes-385353.framer.app";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${ORIGIN}/price`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.evaluate(async () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const height = document.body.scrollHeight;
  for (let y = 0; y < height; y += 600) { window.scrollTo(0, y); await sleep(60); }
  window.scrollTo(0, 0); await sleep(400);
});
await page.waitForTimeout(1500);

const daten = await page.evaluate(() => {
  const maskiert: unknown[] = [];
  const alle = [...document.querySelectorAll("*")];
  for (const el of alle) {
    const cs = getComputedStyle(el);
    const mask = cs.maskImage && cs.maskImage !== "none" ? cs.maskImage : (cs.webkitMaskImage && cs.webkitMaskImage !== "none" ? cs.webkitMaskImage : null);
    if (!mask) continue;
    maskiert.push({
      tag: el.tagName,
      cls: (el.getAttribute("class") ?? "").slice(0, 100),
      background: cs.backgroundColor,
      color: cs.color,
      mask: mask.slice(0, 120),
      maskVar: cs.getPropertyValue("--framer-icon-mask").slice(0, 120),
      inline: (el.getAttribute("style") ?? "").slice(0, 250),
      width: cs.width,
      height: cs.height,
      text: el.textContent?.trim().slice(0, 40) ?? "",
    });
    if (maskiert.length >= 40) break;
  }
  const svgs = [...document.querySelectorAll("svg")];
  const svgBeispiele = svgs.slice(0, 8).map((s) => ({
    cls: (s.getAttribute("class") ?? "").slice(0, 80),
    outer: s.outerHTML.slice(0, 300),
  }));
  return { maskiertAnzahl: maskiert.length, maskiert, svgAnzahl: svgs.length, svgBeispiele };
});
await browser.close();
writeFileSync(resolve(".scratch/choc-original-icons.json"), JSON.stringify(daten, null, 2));
console.log("maskierte Elemente:", daten.maskiertAnzahl, "svgs:", daten.svgAnzahl);
console.log(JSON.stringify(daten.maskiert.slice(0, 4), null, 1));
console.log("SVG-Beispiel:", JSON.stringify(daten.svgBeispiele[0], null, 1));