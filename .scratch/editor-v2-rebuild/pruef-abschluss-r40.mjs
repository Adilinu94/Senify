// Runde-40-Beleg: die Vorschau (ui-preview/index.html) per file:// im echten
// Browser pruefen. Schrift (Sora, Inhalt), Symbole (Phosphor-Masken), Farben
// (Tokens), Konsole/Anfragen, Ueberlauf bei 1440. Screenshot + JSON nach
// .scratch/refs/nick/ui/.
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const preview = resolve(".scratch", "editor-v2-rebuild", "ui-preview", "index.html");
const out = join(".scratch", "refs", "nick", "ui");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const tab = await ctx.newPage();
const konsole = [];
const anfragen = [];
tab.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
tab.on("pageerror", (e) => konsole.push("PAGEERROR " + e.message));
tab.on("requestfailed", (r) => anfragen.push("FAIL " + r.url()));
tab.on("request", (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) anfragen.push("FREMD " + u); });

await tab.goto(pathToFileURL(preview).href, { waitUntil: "load" });
// Force every bundled cut to load: proves the local files exist and decode
// (a missing file would reject here and show up as a failed request).
await tab.evaluate(async () => {
  await Promise.all([
    document.fonts.load('400 16px "Sora"'),
    document.fonts.load('600 16px "Sora"'),
    document.fonts.load('700 16px "Sora"'),
    document.fonts.load('400 13px "Inter"'),
    document.fonts.load('500 13px "Inter"'),
    document.fonts.load('600 15px "Inter Display"'),
    document.fonts.load('700 15px "Inter Display"'),
  ]);
  await document.fonts.ready;
});
await tab.waitForTimeout(400);

const mess = await tab.evaluate(() => {
  const root = document.documentElement;
  const cs = getComputedStyle(root);

  // Count every distinct --ed-* name the stylesheets define.
  const namen = new Set();
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      const style = rule.style;
      if (!style) continue;
      for (let i = 0; i < style.length; i += 1) {
        const prop = style[i];
        if (prop.startsWith("--ed-")) namen.add(prop);
      }
    }
  }

  const icons = [...document.querySelectorAll(".ic")];
  const gezeichnet = icons.filter((el) => {
    const s = getComputedStyle(el);
    const mask = s.webkitMaskImage || s.maskImage || "";
    const r = el.getBoundingClientRect();
    return typeof mask === "string" && mask.includes("data:") && r.width > 0 && r.height > 0;
  }).length;
  // The undrawn ones: name the closest named ancestor and its width, so a
  // collapsed container is distinguishable from a real defect.
  const nichtGezeichnet = icons
    .filter((el) => {
      const s = getComputedStyle(el);
      const mask = s.webkitMaskImage || s.maskImage || "";
      const r = el.getBoundingClientRect();
      return !(typeof mask === "string" && mask.includes("data:") && r.width > 0 && r.height > 0);
    })
    .map((el) => {
      const holder = el.closest("[class]");
      return {
        cls: el.className,
        parent: holder ? holder.className : null,
        parentWidth: holder ? Math.round(holder.getBoundingClientRect().width) : null,
      };
    });

  const h1 = document.querySelector(".page h1, .page__brand");
  const bodyFont = getComputedStyle(h1 ?? document.body).fontFamily;

  const de = document.documentElement;
  return {
    sora400: document.fonts.check('400 16px "Sora"'),
    sora600: document.fonts.check('600 16px "Sora"'),
    sora700: document.fonts.check('700 16px "Sora"'),
    soraLoaded: [...document.fonts].filter((f) => f.family.includes("Sora") && f.status === "loaded").map((f) => f.weight),
    interLoaded: document.fonts.check('400 13px "Inter"'),
    interDisplayLoaded: document.fonts.check('600 15px "Inter Display"'),
    contentFontStack: bodyFont,
    tokenNames: namen.size,
    tokenSignals: {
      accent: cs.getPropertyValue("--ed-signal-accent").trim(),
      canvas: cs.getPropertyValue("--ed-surface-canvas").trim(),
      lineControl: cs.getPropertyValue("--ed-line-control").trim(),
    },
    iconTotal: icons.length,
    iconDrawn: gezeichnet,
    iconUndrawn: nichtGezeichnet,
    kontrast: root.getAttribute("data-kontrast-geprueft"),
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    ueberlaufPx: de.scrollWidth - de.clientWidth,
  };
});

await tab.screenshot({ path: join(out, "abschluss-vorschau-1440.png"), fullPage: true });
await browser.close();

const erwartet = { accent: "#cbff97", canvas: "#01283c", lineControl: "#6390a7" };
const farbenOk =
  mess.tokenSignals.accent === erwartet.accent &&
  mess.tokenSignals.canvas === erwartet.canvas &&
  mess.tokenSignals.lineControl === erwartet.lineControl;

const bericht = {
  mess,
  erwartet,
  farbenOk,
  schriftOk: mess.sora400 && mess.sora600 && mess.sora700 && mess.contentFontStack.includes("Sora"),
  symboleOk: mess.iconTotal > 0 && mess.iconUndrawn.every((n) => n.parentWidth === 0),
  ueberlaufOk: mess.ueberlaufPx === 0,
  fehler: konsole.length + anfragen.length,
  konsole,
  anfragen,
  screenshot: "abschluss-vorschau-1440.png",
};
writeFileSync(join(out, "abschluss-vorschau-1440.json"), JSON.stringify(bericht, null, 2));
console.log(JSON.stringify(bericht, null, 2));
