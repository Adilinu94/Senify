/* Mobil: wird beschnitten oder gescrollt?
   Aufruf: node .scratch/editor-v2-rebuild/mess-mobil.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);

const res = await page.evaluate(() => {
  const vw = window.innerWidth;
  const btn = [...document.querySelectorAll("button")].find((b) => /Vorschau/.test(b.textContent || ""));
  const main = document.querySelector(".main, .content, main, .shell-main");
  const rail = document.querySelector(".nav, aside, .side");
  const foot = document.querySelector(".nav-foot");
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
  const clipped = [...document.querySelectorAll(".main *, .content *, main *")].filter((e) => {
    const b = e.getBoundingClientRect();
    return b.width > 0 && b.right > vw + 0.5;
  }).length;
  const hidden = [...document.querySelectorAll("*")].filter((e) => {
    const c = getComputedStyle(e);
    return (c.overflow === "hidden" || c.overflowX === "hidden") && e.scrollWidth > e.clientWidth + 1;
  }).map((e) => ({ cls: String(e.className).slice(0, 30), scrollW: e.scrollWidth, clientW: e.clientWidth }));
  return {
    vw, docScrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth,
    vorschauKnopf: r(btn), main: r(main), rail: r(rail), navFoot: r(foot),
    navFootText: foot ? foot.innerText.replace(/\s+/g, " ").slice(0, 60) : null,
    beschnitteneElemente: clipped,
    ueberlaufHidden: hidden.slice(0, 5),
  };
});

await browser.close();
console.log(JSON.stringify(res, null, 2));
