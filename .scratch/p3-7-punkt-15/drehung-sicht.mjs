// Probe zu P3-7 Punkt 15, Ursache 2: der Zustand der Titel-Wörter, wenn ihre
// Sektion im Blick ist. Screenshot je Sektion plus Kette der Überläufe.
//
// Usage: pnpm exec tsx .scratch/p3-7-punkt-15/drehung-sicht.mjs

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const SOURCE_URL = "https://unifiersofjapan.framer.website/";
const TARGETS = [
  { text: "strategy", top: 3467 },
  { text: "moments", top: 5120 },
  { text: "explore", top: 6491 },
];
const work = ".scratch/p3-7-punkt-15/bilder";
mkdirSync(work, { recursive: true });

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

const READ = `(text) => {
  const round = (value) => Math.round(value * 10) / 10;
  let target = null;
  for (const element of document.querySelectorAll("*")) {
    let own = "";
    for (const child of element.childNodes) {
      if (child.nodeType === 3) own += child.textContent;
    }
    if (own.trim().replace(/\\s+/g, " ") === text) target = element;
  }
  if (target === null) return null;
  const chain = [];
  let current = target;
  for (let depth = 0; current !== null && depth < 10; depth += 1) {
    const style = getComputedStyle(current);
    const rect = current.getBoundingClientRect();
    chain.push({
      tag: current.tagName.toLowerCase(),
      className: typeof current.className === "string" ? current.className.slice(0, 80) : "",
      overflow: style.overflow,
      height: round(rect.height),
      top: round(rect.top),
      transform: style.transform,
      inline: current.getAttribute("style"),
    });
    current = current.parentElement;
  }
  const style = getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  return {
    transform: style.transform,
    inline: target.getAttribute("style"),
    rect: { top: round(rect.top), height: round(rect.height), width: round(rect.width), left: round(rect.left) },
    chain,
  };
}`;

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page);
  for (const target of TARGETS) {
    await page.evaluate(`window.scrollTo(0, ${target.top - 300})`);
    await page.waitForTimeout(1200);
    const result = await page.evaluate(`(${READ})(${JSON.stringify(target.text)})`);
    console.log(`\n=== "${target.text}" bei scrollY=${target.top - 300} ===`);
    if (result === null) {
      console.log("  nicht gefunden");
      continue;
    }
    console.log(`  transform=${result.transform}`);
    console.log(`  inline=${result.inline}`);
    console.log(`  rect top=${result.rect.top} h=${result.rect.height} w=${result.rect.width} left=${result.rect.left}`);
    console.log("  Kette:");
    for (const [depth, node] of result.chain.entries()) {
      console.log(
        `    ${depth === 0 ? "*" : " ".repeat(depth)}${node.tag}.${node.className} top=${node.top} h=${node.height} overflow=${node.overflow} transform=${node.transform}`,
      );
    }
    await page.screenshot({ path: `${work}/sicht-${target.text}.png` });
  }
} finally {
  await browser.close();
}
