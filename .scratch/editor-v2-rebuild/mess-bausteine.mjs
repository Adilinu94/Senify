/* Baustein-Probe: echte Klassennamen und Maße der Schalen-Bausteine.
   Aufruf: node .scratch/editor-v2-rebuild/mess-bausteine.mjs */

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

const probe = (fn) => page.evaluate(fn);

await go("#/cms/blog/e1");
const felder = await probe(() => {
  const out = [];
  document.querySelectorAll("label, .field, .f-field, .form-row > *, .card > div").forEach((el) => {
    const t = (el.textContent || "").trim();
    if (!/^(Titel|Slug|Datum|Lesezeit|Kategorie|Bild|Text)/.test(t)) return;
    const w = el.querySelector("input, select, textarea, button, .input, .p-input");
    const ws = w ? getComputedStyle(w) : null;
    const wr = w ? w.getBoundingClientRect() : null;
    if (!ws) return;
    out.push({
      wrapper: String(el.className).slice(0, 30),
      label: getComputedStyle(el.querySelector("span, label, .lbl") || el).fontSize,
      ctrl: String(w.className).slice(0, 30) + "|" + w.tagName,
      radius: ws.borderTopLeftRadius, h: wr ? Math.round(wr.height) : null,
      bg: ws.backgroundColor, border: ws.borderTopWidth + " " + ws.borderTopColor,
    });
  });
  return out.slice(0, 7);
});

await go("#/releases");
const tabelle = await probe(() => {
  const cell = document.querySelector("thead th, table tr:first-child th, .thead, [class*=head] th");
  const th = [...document.querySelectorAll("table tr")][0]?.children || [];
  const first = th[0];
  const badge = [...document.querySelectorAll("span, div")].find((e) => e.textContent.trim() === "Aktiv" && !e.children.length);
  const dateCell = [...document.querySelectorAll("td, div")].find((e) => /^Release 12/.test((e.textContent || "").trim()));
  const cs = (el) => { const c = getComputedStyle(el); return { font: c.fontSize, weight: c.fontWeight, color: c.color, bg: c.backgroundColor, radius: c.borderTopLeftRadius, h: Math.round(el.getBoundingClientRect().height), letter: c.letterSpacing, transform: c.textTransform }; };
  return {
    thText: first ? (first.textContent || "").trim().slice(0, 30) : null,
    th: first ? cs(first) : null,
    badge: badge ? { cls: String(badge.className).slice(0, 30), ...cs(badge) } : null,
    dateCell: dateCell ? { cls: String(dateCell.className).slice(0, 30), w: Math.round(dateCell.getBoundingClientRect().width), ...cs(dateCell) } : null,
  };
});

await go("#/");
const startKicker = await probe(() => {
  const el = [...document.querySelectorAll("*")].find((e) => (e.textContent || "").trim() === "WEITERARBEITEN" && !e.children.length);
  if (!el) return null;
  const c = getComputedStyle(el);
  return { cls: String(el.className).slice(0, 30), font: c.fontSize, weight: c.fontWeight, color: c.color, letter: c.letterSpacing, transform: c.textTransform };
});
const startStats = await probe(() => {
  const el = [...document.querySelectorAll("*")].find((e) => (e.textContent || "").trim() === "12");
  if (!el) return null;
  const c = getComputedStyle(el);
  const lbl = el.parentElement;
  return { num: { font: c.fontSize, weight: c.fontWeight }, label: { text: (lbl.textContent || "").trim().slice(0, 24), font: getComputedStyle(lbl).fontSize, color: getComputedStyle(lbl).color } };
});
const chipGrammatik = await probe(() => {
  const hits = [...document.querySelectorAll("*")].filter((e) => !e.children.length && /^(Entwurf|Entwurf v43|Zuletzt Heute, 14:26|Von Mensch)$/.test((e.textContent || "").trim()));
  return hits.map((h) => ({ text: h.textContent.trim(), tag: h.tagName, cls: String(h.className).slice(0, 22) }));
});

await go("#/settings");
const navEnde = await probe(() => {
  const nav = document.querySelector("aside, .side, nav");
  if (!nav) return null;
  const rows = [...nav.querySelectorAll("a, button")];
  const last = rows[rows.length - 1];
  const act = nav.querySelector('[aria-current], .is-active, [class*=active]');
  const r = last?.getBoundingClientRect();
  return {
    lastRow: last ? { text: (last.textContent || "").trim().slice(0, 20), bottom: Math.round(r.bottom), visible: r.bottom <= window.innerHeight } : null,
    active: act ? (act.textContent || "").trim().slice(0, 20) : null,
    navScrollTop: nav.scrollTop, navScrollHeight: nav.scrollHeight, navClient: nav.clientHeight,
    scrollbarWidth: nav.offsetWidth - nav.clientWidth,
  };
});

await browser.close();
console.log("=== FELDER (CMS-Eintrag) ===\n" + JSON.stringify(felder, null, 2));
console.log("\n=== TABELLE (Releases) ===\n" + JSON.stringify(tabelle, null, 2));
console.log("\n=== START: Kicker + Kennzahlen + Chips ===\n" + JSON.stringify({ startKicker, startStats, chipGrammatik }, null, 2));
console.log("\n=== NAV ENDE (Einstellungen) ===\n" + JSON.stringify(navEnde, null, 2));
