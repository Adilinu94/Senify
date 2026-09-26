/* Nachmessung: Radien, Überlauf, Kontrast, Schriftgrade, Fokus.
   Aufruf: node .scratch/editor-v2-rebuild/mess-details.mjs */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";

const dir = resolve(".scratch/editor-v2-rebuild/ui-preview");
const target = pathToFileURL(join(dir, "index.html")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(target, { waitUntil: "load" });
await page.waitForTimeout(400);
const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(250); };

const RATIO = `
function lum(c) {
  const [r, g, b] = c.match(/\\d+(\\.\\d+)?/g).slice(0, 3).map(Number).map((v) => {
    const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg) { const a = lum(fg), b = lum(bg); const hi = Math.max(a, b), lo = Math.min(a, b); return +((hi + 0.05) / (lo + 0.05)).toFixed(2); }
function bgOf(el) {
  let n = el;
  while (n && n !== document.documentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
    n = n.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor;
}
function look(sel, label) {
  const el = document.querySelector(sel);
  if (!el) return { label, sel, missing: true };
  const c = getComputedStyle(el);
  const bg = bgOf(el);
  return {
    label, sel,
    text: (el.textContent || "").trim().slice(0, 26),
    font: c.fontSize, weight: c.fontWeight,
    color: c.color, bg,
    contrast: ratio(c.color, bg),
    radius: c.borderTopLeftRadius,
    height: Math.round(el.getBoundingClientRect().height),
  };
}
`;

/* --- Shell --- */
await go("#/cms/blog/e1");
const shell = await page.evaluate(`(() => { ${RATIO}
  const nav = document.querySelector("aside, .side, .nav-col, nav");
  const active = document.querySelector('[aria-current], .is-active, .nav-row--active, .nav-row.active');
  const r = nav ? nav.getBoundingClientRect() : null;
  return {
    look: [
      look(".card", "Karte (Produkt)"),
      look("input[type=text], .input, .field input", "Feld"),
      look(".chip", "Chip"),
      look(".btn--product.btn--primary, .btn--primary", "Primärknopf"),
      look(".card h1, h1", "Screenschrift"),
      look(".kicker, .eyebrow", "Kicker"),
      look("th", "Tabellenkopf"),
      look(".badge", "Badge"),
    ],
    nav: nav ? { rect: { y: Math.round(r.y), h: Math.round(r.height) }, scroll: nav.scrollHeight, client: nav.clientHeight, scrollbar: nav.scrollHeight > nav.clientHeight } : null,
    active: active ? { text: active.textContent.trim().slice(0, 24), y: Math.round(active.getBoundingClientRect().y), bottom: Math.round(active.getBoundingClientRect().bottom) } : null,
    vh: window.innerHeight,
  };
})()`);

/* --- Editor hell --- */
await go("#/editor");
const edLight = await page.evaluate(`(() => { ${RATIO}
  const rows = [...document.querySelectorAll(".tree-row")];
  const trunc = rows.filter((r) => { const l = r.querySelector(".label"); return l && l.scrollWidth > l.clientWidth + 1; });
  const sel = document.querySelector('.tree-row[aria-selected="true"]');
  const selTag = sel ? sel.querySelector(".tag, .type, code, span:nth-child(3)") : null;
  const tagEls = [...document.querySelectorAll(".tree-row span")].filter((s) => s.textContent.trim().startsWith("."));
  return {
    rows: rows.length, truncated: trunc.length,
    truncatedLabels: trunc.slice(0, 6).map((r) => r.querySelector(".label").textContent.trim()),
    labels: rows.slice(0, 8).map((r) => { const l = r.querySelector(".label"); return { t: l.textContent.trim(), client: l.clientWidth, scroll: l.scrollWidth }; }),
    look: [
      look(".ed-panel, .panel", "Editor-Panel"),
      look(".tree-row .label", "Baum-Beschriftung"),
      look(".tree-row .tag, .tree-row span:nth-child(3)", "Baum-Typ"),
      look(".p-label, .field-label", "Eigenschafts-Beschriftung"),
      look(".ed-toolbar .btn, .ed-tool", "Werkzeugleiste"),
      look(".ed-status", "Statusleiste"),
      look(".ed-tab", "Reiter"),
      look(".panel-section__head", "Abschnittskopf"),
    ],
    tagColorOnSelected: selTag ? getComputedStyle(selTag).color : null,
    tagOnSelectedBg: sel ? getComputedStyle(sel).backgroundColor : null,
    fieldRadius: (() => { const f = document.querySelector(".p-input"); return f ? getComputedStyle(f).borderTopLeftRadius : null; })(),
    btnRadius: (() => { const b = document.querySelector(".ed-top .btn--primary, .btn--primary"); return b ? getComputedStyle(b).borderTopLeftRadius : null; })(),
  };
})()`);

/* --- Editor dunkel --- */
await go("#/design");
await page.evaluate(() => { document.querySelector('[data-act="mode"][data-mode="dark"]')?.click(); });
await page.waitForTimeout(250);
await go("#/editor");
const edDark = await page.evaluate(`(() => { ${RATIO}
  return {
    look: [
      look(".p-label, .field-label", "Eigenschafts-Beschriftung dunkel"),
      look(".tree-row .label", "Baum-Beschriftung dunkel"),
      look(".ed-tab", "Reiter dunkel"),
      look(".p-input input", "Feldwert dunkel"),
    ],
    selects: [...document.querySelectorAll("select")].slice(0, 3).map((s) => ({
      v: s.value, bg: getComputedStyle(s).backgroundColor, color: getComputedStyle(s).color,
      contrast: ratio(getComputedStyle(s).color, getComputedStyle(s).backgroundColor),
    })),
  };
})()`);
await go("#/design");
await page.evaluate(() => { document.querySelector('[data-act="mode"][data-mode="light"]')?.click(); });
await page.waitForTimeout(200);

/* --- Fokus --- */
await go("#/");
await page.keyboard.press("Tab");
await page.keyboard.press("Tab");
const focus = await page.evaluate(() => {
  const el = document.activeElement;
  const c = getComputedStyle(el);
  return { tag: el.tagName, cls: String(el.className).slice(0, 40), outline: c.outline, boxShadow: c.boxShadow.slice(0, 60), text: (el.textContent || "").trim().slice(0, 20) };
});
await page.keyboard.press("Tab");
const focus2 = await page.evaluate(() => { const el = document.activeElement; const c = getComputedStyle(el); return { tag: el.tagName, text: (el.textContent || "").trim().slice(0, 20), outline: c.outline, boxShadow: c.boxShadow.slice(0, 60) }; });

await browser.close();
console.log("=== SHELL ===\n" + JSON.stringify(shell, null, 2));
console.log("\n=== EDITOR HELL ===\n" + JSON.stringify(edLight, null, 2));
console.log("\n=== EDITOR DUNKEL ===\n" + JSON.stringify(edDark, null, 2));
console.log("\n=== FOKUS ===\n" + JSON.stringify([focus, focus2], null, 2));
