/* Canvas-Geometrie: Rahmen, Überlauf, Dialog.
   Aufruf: node .scratch/editor-v2-rebuild/mess-canvas.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = "#/editor"; });
await page.waitForTimeout(400);

const geo = await page.evaluate(() => {
  const frames = [...document.querySelectorAll("[data-frame]")].map((f) => {
    const r = f.getBoundingClientRect();
    return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), y: Math.round(r.y), label: (f.getAttribute("data-frame") || "") };
  });
  const canvas = document.querySelector('[class*="canvas"], [class*="stage"]');
  const stage = document.querySelector(".ed-center") || canvas;
  const sr = stage ? stage.getBoundingClientRect() : null;
  const left = document.querySelector(".ed-left, .ed-tree, .ed-panel-l");
  const right = document.querySelector(".ed-right, .ed-insp");
  const lr = left ? left.getBoundingClientRect() : null;
  const rr = right ? right.getBoundingClientRect() : null;
  return {
    frames,
    stage: sr ? { x: Math.round(sr.x), w: Math.round(sr.width), right: Math.round(sr.right) } : null,
    leftPanel: lr ? { x: Math.round(lr.x), right: Math.round(lr.right), w: Math.round(lr.width) } : null,
    rightPanel: rr ? { x: Math.round(rr.x), right: Math.round(rr.right), w: Math.round(rr.width) } : null,
    classes: [...document.querySelectorAll("header > *, body > div > *")].slice(0, 2).map((e) => String(e.className).slice(0, 40)),
    zoom: document.querySelector(".ed-zoom")?.textContent.trim(),
  };
});

/* Dialog */
await page.evaluate(() => { document.querySelector('[data-eact="publish"]')?.click(); });
await page.waitForTimeout(400);
const dlg = await page.evaluate(() => {
  const d = document.querySelector(".dialog, [role=dialog]");
  if (!d) return null;
  const c = getComputedStyle(d);
  const r = d.getBoundingClientRect();
  const inner = [...d.querySelectorAll("*")].filter((e) => {
    const cc = getComputedStyle(e);
    return cc.borderTopWidth !== "0px" && e.getBoundingClientRect().width > 300;
  }).slice(0, 4).map((e) => {
    const cc = getComputedStyle(e);
    return { cls: String(e.className).slice(0, 30), w: Math.round(e.getBoundingClientRect().width), radius: cc.borderTopLeftRadius, border: cc.borderTopColor };
  });
  const steps = [...d.querySelectorAll("*")].filter((e) => e.textContent.trim() === "2" && !e.children.length).map((e) => ({ bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color, size: Math.round(e.getBoundingClientRect().width) }));
  return {
    w: Math.round(r.width), h: Math.round(r.height), radius: c.borderTopLeftRadius,
    bg: c.backgroundColor, border: c.borderTopWidth + " " + c.borderTopColor, shadow: c.boxShadow.slice(0, 70),
    nestedBoxes: inner, stepMarker2: steps,
  };
});

await browser.close();
console.log(JSON.stringify({ geo, dlg }, null, 2));
