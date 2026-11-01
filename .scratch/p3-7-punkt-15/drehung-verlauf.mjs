// Probe zu P3-7 Punkt 15, Ursache 2: Ist `translate(0%, 150%) rotate(10deg)`
// der Ruhezustand der Wörter oder ein Startzustand, den nur die reduzierte
// Bewegung stehen lässt? Zwei Kontexte, derselbe Ablauf, dieselbe Abfrage.
//
// Usage: pnpm exec tsx .scratch/p3-7-punkt-15/drehung-verlauf.mjs

import { chromium } from "playwright";

const SOURCE_URL = "https://unifiersofjapan.framer.website/";
const TITLES = ["strategy", "moments", "explore"];

async function settle(page) {
  await page.evaluate(`(async () => {
    const globals = globalThis;
    const wait = (ms) => new Promise((resolve) => { globals.setTimeout(() => resolve(), ms); });
    const step = Math.max(200, Math.floor(globals.window.innerHeight * 0.8));
    for (let y = 0; y < globals.document.body.scrollHeight; y += step) {
      globals.window.scrollTo(0, y);
      await wait(240);
    }
    globals.window.scrollTo(0, 0);
    await wait(600);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const elements = globals.document.querySelectorAll("*");
      let open = false;
      for (let index = 0; index < elements.length; index += 1) {
        if (Number.parseFloat(globals.getComputedStyle(elements[index]).opacity) < 0.99) {
          open = true;
          break;
        }
      }
      if (!open) break;
      await wait(220);
    }
    await globalThis.document.fonts.ready;
    await wait(400);
  })()`);
}

const READ = `(titles) => {
  const round = (value) => Math.round(value * 10) / 10;
  const out = [];
  for (const element of document.querySelectorAll("*")) {
    let text = "";
    for (const child of element.childNodes) {
      if (child.nodeType === 3) text += child.textContent;
    }
    text = text.trim().replace(/\\s+/g, " ");
    if (!titles.includes(text)) continue;
    const style = getComputedStyle(element);
    const parent = element.parentElement;
    const parentStyle = parent === null ? null : getComputedStyle(parent);
    const rect = element.getBoundingClientRect();
    out.push({
      text,
      transform: style.transform,
      inline: element.getAttribute("style"),
      color: style.color,
      opacity: style.opacity,
      visibility: style.visibility,
      display: style.display,
      clipPath: style.clipPath,
      transformOrigin: style.transformOrigin,
      rect: { top: round(rect.top + scrollY), height: round(rect.height), width: round(rect.width) },
      parent: parent === null ? null : {
        tag: parent.tagName.toLowerCase(),
        text: (parent.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 80),
        overflow: parentStyle.overflow,
        height: round(parent.getBoundingClientRect().height),
        opacity: parentStyle.opacity,
        color: parentStyle.color,
      },
      animations: element.getAnimations().length,
    });
  }
  return out;
}`;

const browser = await chromium.launch();
try {
  for (const reducedMotion of ["reduce", "no-preference"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion,
    });
    const page = await context.newPage();
    await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await settle(page);
    const rows = await page.evaluate(`(${READ})(${JSON.stringify(TITLES)})`);
    console.log(`\n=== reducedMotion=${reducedMotion} ===`);
    for (const row of rows) {
      console.log(`"${row.text}"`);
      console.log(`  transform=${row.transform}  inline=${row.inline}`);
      console.log(`  color=${row.color}  opacity=${row.opacity}  visibility=${row.visibility}  display=${row.display}`);
      console.log(`  clip=${row.clipPath === "none" ? "-" : row.clipPath}  origin=${row.transformOrigin}  animationen=${row.animations}`);
      console.log(`  rect top=${row.rect.top} h=${row.rect.height} w=${row.rect.width}`);
      if (row.parent !== null) {
        console.log(`  eltern ${row.parent.tag} "${row.parent.text}" overflow=${row.parent.overflow} h=${row.parent.height} opacity=${row.parent.opacity} color=${row.parent.color}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
