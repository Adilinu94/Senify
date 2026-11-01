// Befund zu P3-7 Punkt 15: Warum fehlen F37 Blanka Trial Bold/Medium im Bake?
// Der Browser-Capture liest die Seite 350 ms nach `load`. Diese Probe liest zu
// drei Zeitpunkten, welche @font-face-Bloecke im HTML stehen, und was in den
// Stylesheets der Seite (inkl. adopted) an Font-Familien deklariert ist.
import { chromium } from "playwright";

const SOURCE = "https://unifiersofjapan.framer.website/";

function familiesIn(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)]
    .map((m) => /font-family:\s*"?([^";]+)"?/.exec(m[1])?.[1]?.trim())
    .filter((name) => name !== undefined);
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(SOURCE, { waitUntil: "domcontentloaded", timeout: 60_000 });
  for (const ms of [350, 2000, 6000]) {
    await page.waitForTimeout(ms === 350 ? 350 : ms - 350);
    const probe = await page.evaluate(`(() => {
      const blocks = [];
      for (const style of document.querySelectorAll("style")) {
        const text = style.textContent || "";
        if (!/@font-face/.test(text)) continue;
        blocks.push({
          marker: style.getAttribute("data-framer-font-css") !== null ? "framer-font-css" : style.getAttribute("data-styles-preset") ? "preset" : "other",
          length: text.length,
          faces: (text.match(/@font-face/g) || []).length,
          hasF37: /F37 Blanka/.test(text),
        });
      }
      const sheets = [];
      for (const sheet of document.styleSheets) {
        let count = 0;
        let f37 = 0;
        let families = [];
        try {
          for (const rule of sheet.cssRules) {
            if (rule.type === CSSRule.FONT_FACE_RULE) {
              count += 1;
              const body = rule.cssText;
              if (/F37 Blanka/.test(body)) f37 += 1;
              const family = /font-family:\\s*"?([^";]+)"?/.exec(body)?.[1];
              if (family && !families.includes(family)) families.push(family.trim());
            }
          }
        } catch (error) {
          count = -1;
        }
        sheets.push({ href: sheet.href ? sheet.href.slice(0, 90) : null, adopted: sheet.href === null, faces: count, f37, families: families.slice(0, 60) });
      }
      const fonts = [];
      document.fonts.forEach((face) => fonts.push(face.family));
      const uniq = [...new Set(fonts)];
      return {
        links: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href),
        blocks,
        sheets,
        fontFaceSet: uniq.length,
        fontFaceSetF37: uniq.filter((name) => /F37/.test(name)),
        hasF37Html: /F37 Blanka/.test(document.documentElement.outerHTML),
      };
    })()`);
    console.log(`\n=== nach ${ms} ms ===`);
    console.log(`  Stylesheet-Links: ${probe.links.length}`);
    for (const href of probe.links) console.log(`    ${href}`);
    console.log(`  <style> mit @font-face: ${probe.blocks.length}`);
    for (const block of probe.blocks) console.log(`    ${block.marker} len ${block.length} faces ${block.faces} F37 ${block.hasF37}`);
    console.log(`  Stylesheets: ${probe.sheets.length}`);
    for (const sheet of probe.sheets) console.log(`    ${sheet.adopted ? "(adopted)" : sheet.href} faces ${sheet.faces} F37 ${sheet.f37} · ${sheet.families.join(" · ").slice(0, 220)}`);
    console.log(`  document.fonts: ${probe.fontFaceSet} Familien, F37: ${probe.fontFaceSetF37.join(" · ") || "keine"}`);
    console.log(`  F37 im HTML: ${probe.hasF37Html}`);
  }
  await context.close();
} finally {
  await browser.close();
}
