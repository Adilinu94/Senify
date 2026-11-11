/* Paket D, Messung: Aendern sich Links und Knoepfe der Relay-Quelle beim Hover, und gibt es dafuer :hover-CSS?
   Reines Messwerkzeug, schreibt nichts ins Projekt. */
import { chromium } from "playwright";

const URL = process.argv[2] ?? "https://gracious-balance-599544.framer.app/";
const PROPS = ["color", "backgroundColor", "borderColor", "opacity", "transform", "boxShadow", "textDecorationLine", "filter"];
const LESEN = `(el) => { const s = getComputedStyle(el); const o = {}; for (const p of ${JSON.stringify(PROPS)}) o[p] = s[p]; o.cls = el.className; return o; }`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
const ziele = await page.$$("a[href], button, [role=button]");
console.log("Kandidaten:", ziele.length);
const treffer = [];
let geprueft = 0;
for (const el of ziele) {
  const box = await el.boundingBox();
  if (!box || box.width < 4 || box.height < 4) continue;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await page.mouse.move(2, 2);
  await page.waitForTimeout(350);
  const vorher = await el.evaluate(eval(LESEN));
  await el.hover({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(550);
  const nachher = await el.evaluate(eval(LESEN));
  geprueft++;
  const diff = {};
  for (const p of PROPS) if (vorher[p] !== nachher[p]) diff[p] = [vorher[p], nachher[p]];
  const text = ((await el.textContent()) ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  const kinder = await el.evaluate(`(el) => { const out = []; for (const c of el.querySelectorAll("*")) { const s = getComputedStyle(c); out.push(s.color + "|" + s.backgroundColor + "|" + s.transform + "|" + s.opacity); } return out.join(";"); }`);
  treffer.push({ text, diff, kinder });
  if (geprueft >= 40) break;
}
const mitDiff = treffer.filter((t) => Object.keys(t.diff).length > 0);
console.log("geprueft:", geprueft, "mit Aenderung am Element selbst:", mitDiff.length);
for (const t of mitDiff.slice(0, 12)) console.log(JSON.stringify(t.text), JSON.stringify(t.diff));
await browser.close();
