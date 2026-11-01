// Probe zu P3-7 Punkt 15, Ursache 2 (10-Grad-Drehung der Titel-Wrapper).
//
// Die Messung vom 31.10.2026 fand die Matrix `matrix(0.984808, 0.173648,
// -0.173648, 0.984808, 0, 390)` an den Titel-Wrappern von `strategy`,
// `moments`, `explore`; im gesicherten SSR und im IR steht sie 0×. Diese Probe
// trennt die Herkunft: Inline-Stil der Laufzeit, Stylesheet-Regel oder
// scroll-gebundene Transformation — und ob der Browser-Capture sie sieht.
//
// Usage: pnpm exec tsx .scratch/p3-7-punkt-15/drehung-quelle.mjs

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

const INSPECT = `() => {
  const round = (value) => Math.round(value * 10) / 10;
  const elements = [...document.querySelectorAll("*")];
  const matches = [];
  for (const element of elements) {
    let text = "";
    for (const child of element.childNodes) {
      if (child.nodeType === 3) text += child.textContent;
    }
    text = text.trim().replace(/\\s+/g, " ");
    if (!${JSON.stringify(TITLES)}.includes(text)) continue;
    matches.push({ element, text });
  }
  const describe = (element) => ({
    tag: element.tagName.toLowerCase(),
    className: typeof element.className === "string" ? element.className.slice(0, 160) : "",
    transform: getComputedStyle(element).transform,
    inlineTransform: element.style.transform || null,
    inlineStyle: (element.getAttribute("style") || "").slice(0, 300),
    appearId: element.getAttribute("data-framer-appear-id"),
    rect: (() => {
      const rect = element.getBoundingClientRect();
      return { top: round(rect.top + scrollY), height: round(rect.height), width: round(rect.width) };
    })(),
  });
  const out = [];
  for (const { element, text } of matches) {
    const chain = [];
    let current = element;
    for (let depth = 0; current !== null && depth < 8; depth += 1) {
      chain.push(describe(current));
      current = current.parentElement;
    }
    out.push({ text, chain });
  }
  const rotated = [];
  for (const element of elements) {
    const transform = getComputedStyle(element).transform;
    if (transform === "none" || !transform.includes("0.173648")) continue;
    rotated.push(describe(element));
  }
  const stylesheets = [];
  let ruleHits = [];
  for (const sheet of document.styleSheets) {
    const entry = { href: sheet.href, rules: 0, error: null };
    try {
      entry.rules = sheet.cssRules.length;
      for (const rule of sheet.cssRules) {
        if (rule.cssText.includes("0.173648") || rule.cssText.includes("rotate(10deg)")) {
          ruleHits.push({ href: sheet.href, cssText: rule.cssText.slice(0, 400) });
        }
      }
    } catch (error) {
      entry.error = String(error);
    }
    stylesheets.push(entry);
  }
  return { matches: out, rotated, stylesheets, ruleHits };
}`;

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page);
  const result = await page.evaluate(`(${INSPECT})()`);
  console.log("Titel-Treffer:", result.matches.length);
  for (const match of result.matches) {
    console.log(`\n"${match.text}"`);
    for (const [depth, node] of match.chain.entries()) {
      console.log(
        `  ${depth === 0 ? "*" : " ".repeat(depth)}${node.tag}  transform=${node.transform}  inline=${node.inlineTransform ?? "-"}`,
      );
      if (node.className !== "") console.log(`     class=${node.className}`);
      if (node.appearId !== null) console.log(`     appear=${node.appearId}`);
      console.log(`     rect top=${node.rect.top} h=${node.rect.height} w=${node.rect.width}`);
    }
  }
  console.log(`\nElemente mit der 0.173648-Matrix: ${result.rotated.length}`);
  for (const node of result.rotated.slice(0, 12)) {
    console.log(`  ${node.tag}  top=${node.rect.top} h=${node.rect.height} w=${node.rect.width}  inline=${node.inlineTransform ?? "-"}`);
    if (node.className !== "") console.log(`    class=${node.className}`);
  }
  console.log(`\nStylesheets: ${result.stylesheets.length}`);
  for (const sheet of result.stylesheets) {
    console.log(`  ${sheet.href ?? "(inline)"}  Regeln=${sheet.rules}${sheet.error === null ? "" : `  FEHLER=${sheet.error}`}`);
  }
  console.log(`Regel-Treffer: ${result.ruleHits.length}`);
  for (const hit of result.ruleHits.slice(0, 10)) {
    console.log(`  ${hit.href ?? "(inline)"}: ${hit.cssText}`);
  }
} finally {
  await browser.close();
}
