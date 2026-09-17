// Belegpflicht Runde 80: Zustandsprobe (Aufgabe 26) und Layoutprobe (Aufgabe 28)
// in der Vorschau im echten Browser. Die Vorschau braucht keinen Dienst, deshalb
// ist dieser Teil auch dann messbar, wenn Programm (4322) und Engine (4321) nicht
// laufen.
//
// Aufgabe 26: 96 Zellen (16 Komponenten x 6 Zustaende); jede Zelle ausser Ruhe
//             muss sich sichtbar von ihrer Ruhezelle unterscheiden, ausser wo der
//             Zustand nicht vorgesehen ist (Liste unten, dokumentiert).
// Aufgabe 28: 1280 / 1440 / 1920 / schmal (+ 900 fuer die 1024er-Regel): kein
//             waagerechter Ueberlauf, Statusleiste sichtbar, Buehne scrollt allein,
//             Panels angedockt, Blatt erst unter 1024px.
//
// Ergebnis: .scratch/refs/nick/ui/pruefung-zustand-layout.json + Screenshots.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const preview = resolve(".scratch", "editor-v2-rebuild", "ui-preview", "index.html");
const out = join(".scratch", "refs", "nick", "ui");
mkdirSync(out, { recursive: true });

// Zustellungen, die der Plan ausdruecklich ausnimmt ("ausser dort, wo der Zustand
// nicht vorgesehen ist") bzw. die gleich aussehen muessen.
const AUSNAHMEN = [
  "Panel-Tab / hover", // ein ausgewaehlter Tab hat keine Ueberfahr-Rueckmeldung
  "Panel-Tab / ausgewaehlt", // die Ruhezelle zeigt bereits den ausgewaehlten Tab
  "Panel-Tab / fokus", // Fokus-Unterkante ist Lime, dieselbe Farbe wie die Auswahl-Unterkante
];

const breiten = [
  { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
  { name: "schmal", width: 480, height: 900 },
  { name: "900", width: 900, height: 900 },
];

const browser = await chromium.launch({ headless: true });
const konsole = [];
const anfragen = [];

/* ------------------------------------------------ Aufgabe 26: Zustandsprobe */
const ctxMatrix = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const tabMatrix = await ctxMatrix.newPage();
tabMatrix.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
tabMatrix.on("pageerror", (e) => konsole.push(`PAGEERROR ${e.message}`));
await tabMatrix.goto(pathToFileURL(preview).href, { waitUntil: "load" });
await tabMatrix.evaluate(async () => { await document.fonts.ready; });
await tabMatrix.waitForTimeout(300);

const matrix = await tabMatrix.evaluate((ausnahmen) => {
  const zeilen = [...document.querySelectorAll("#matrix-ziel tbody tr")];
  const kopf = [...document.querySelectorAll("#matrix-ziel thead th")].map((th) => th.textContent);
  const props = [
    "backgroundColor", "boxShadow", "transform", "opacity",
    "outline", "outlineOffset", "color", "borderColor", "borderTopColor",
  ];
  const VERTRAG = ".ed-btn, .ed-iconbtn, .ed-row, .ed-field, .ed-divfield, .ed-tab, .ed-check, .ed-switch, .ed-chip, .ed-seg__item, .ed-menu__row, .ed-sel__row, .ed-spot__row";
  const abbild = (zelle) => {
    const ziele = [...zelle.querySelectorAll(VERTRAG)];
    const liste = ziele.length > 0 ? ziele : [zelle.firstElementChild ?? zelle];
    return liste
      .map((ziel) => {
        const s = getComputedStyle(ziel);
        return `${ziel.className || ziel.tagName}::` + props.map((p) => `${p}=${s[p]}`).join("|");
      })
      .join(" # ");
  };
  const unterschiedlich = [];
  const identisch = [];
  for (const zeile of zeilen) {
    const name = zeile.querySelector(".mx__name")?.textContent ?? "?";
    const zellen = [...zeile.querySelectorAll(".mx__cell")];
    const ruhe = zellen.find((z) => z.dataset.state === "ruhe");
    const basis = ruhe ? abbild(ruhe) : "";
    for (const zelle of zellen) {
      if (zelle.dataset.state === "ruhe") continue;
      (abbild(zelle) === basis ? identisch : unterschiedlich).push(`${name} / ${zelle.dataset.state}`);
    }
  }
  return {
    spalten: kopf,
    zeilen: zeilen.length,
    zellen: document.querySelectorAll("#matrix-ziel .mx__cell").length,
    ruhezellen: document.querySelectorAll('#matrix-ziel .mx__cell[data-state="ruhe"]').length,
    zustaende: [...document.querySelectorAll("#matrix-ziel .mx__cell")].reduce((acc, zelle) => {
      acc[zelle.dataset.state] = (acc[zelle.dataset.state] ?? 0) + 1;
      return acc;
    }, {}),
    unterschiedlich: unterschiedlich.length,
    identisch,
    unerwartet: identisch.filter((eintrag) => !ausnahmen.includes(eintrag)),
  };
}, AUSNAHMEN);

await tabMatrix.screenshot({ path: join(out, "zustandsprobe-1440.png") });
await ctxMatrix.close();

/* --------------------------------------------------- Aufgabe 28: Layoutprobe */
const layout = {};
for (const bp of breiten) {
  const ctx = await browser.newContext({
    viewport: { width: bp.width, height: bp.height },
    deviceScaleFactor: 1,
  });
  const tab = await ctx.newPage();
  const k = [];
  const a = [];
  tab.on("console", (m) => { if (m.type() === "error") k.push(m.text()); });
  tab.on("pageerror", (e) => k.push(`PAGEERROR ${e.message}`));
  tab.on("requestfailed", (r) => a.push(`FAIL ${r.url()}`));
  tab.on("response", (r) => { if (r.status() >= 400) a.push(`HTTP ${r.status()} ${r.url()}`); });
  tab.on("request", (r) => {
    const url = r.url();
    if (!/^(file|data|blob):/.test(url)) a.push(`FREMD ${url}`);
  });

  await tab.goto(pathToFileURL(preview).href, { waitUntil: "load" });
  await tab.evaluate(async () => { await document.fonts.ready; });
  await tab.waitForTimeout(250);

  layout[bp.name] = await tab.evaluate(() => {
    const sichtbar = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    };
    const stage = document.querySelector(".app__stage");
    const body = document.querySelector(".app__body");
    const explorer = document.querySelector(".app__explorer");
    const inspector = document.querySelector(".app__inspector");
    const stageBreite = stage ? Math.round(stage.getBoundingClientRect().width) : 0;
    const explBreite = explorer ? Math.round(explorer.getBoundingClientRect().width) : 0;
    const inspBreite = inspector ? Math.round(inspector.getBoundingClientRect().width) : 0;
    const inline = body ? getComputedStyle(body).gridTemplateColumns : null;
    return {
      breite: window.innerWidth,
      ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      statusSichtbar: sichtbar(document.querySelector(".app__status")),
      explorerSichtbar: sichtbar(explorer),
      inspectorSichtbar: sichtbar(inspector),
      spalten: inline,
      explorerBreite: explBreite,
      inspectorBreite: inspBreite,
      stageBreite,
      summePasst: 264 >= 0 && (explBreite + inspBreite + stageBreite) <= window.innerWidth,
      stageOverflowY: stage ? getComputedStyle(stage).overflowY : null,
      stageScrolltAllein: stage ? stage.scrollWidth >= 0 && stage.scrollHeight >= stage.clientHeight : null,
      // "Blatt erst unter 1024px": der Inspektor steht dann unter der Buehne.
      inspectorUnterBuehne: inspector
        ? inspector.getBoundingClientRect().top >= (stage?.getBoundingClientRect().bottom ?? 0) - 2
        : null,
    };
  });
  await tab.screenshot({ path: join(out, `layoutprobe-${bp.name}.png`) });
  layout[bp.name].konsole = k;
  layout[bp.name].anfragen = a;
  konsole.push(...k.map((x) => `${bp.name}: ${x}`));
  anfragen.push(...a.map((x) => `${bp.name}: ${x}`));
  await ctx.close();
}

/* ------------------------------------------- Aufgabe 29: Panelbreiten */
const ctxPanel = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const tabPanel = await ctxPanel.newPage();
tabPanel.setDefaultTimeout(15000);
tabPanel.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
tabPanel.on("pageerror", (e) => konsole.push(`PAGEERROR ${e.message}`));
await tabPanel.goto(pathToFileURL(preview).href, { waitUntil: "load" });
await tabPanel.evaluate("localStorage.clear()");
await tabPanel.reload({ waitUntil: "load" });
await tabPanel.waitForTimeout(200);

const panelMessen = () =>
  tabPanel.evaluate(`(() => {
    const body = document.querySelector(".app__body");
    const expl = document.querySelector(".app__explorer");
    const insp = document.querySelector(".app__inspector");
    const b = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);
    return {
      breiten: body ? body.getAttribute("data-breiten") : null,
      explorer: b(expl),
      inspector: b(insp),
      explorerRand: expl ? Math.round(expl.getBoundingClientRect().right) : null,
      ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);

const panels = { standard: await panelMessen() };
const griff = tabPanel.locator('.app__split[data-panel="explorer"]');
const kasten = await griff.boundingBox();
const startX = kasten.x + kasten.width / 2;
const y = kasten.y + 200;
await tabPanel.mouse.move(startX, y);
await tabPanel.mouse.down();
await tabPanel.mouse.move(startX + 30, y, { steps: 5 });
panels.bei30 = await panelMessen();
await tabPanel.mouse.move(startX + 60, y, { steps: 5 });
await tabPanel.mouse.up();
panels.nach60 = await panelMessen();
panels.sprungPx = Math.abs((panels.bei30.explorerRand ?? 0) - (startX + 30));

await tabPanel.mouse.move(startX + 60, y);
await tabPanel.mouse.down();
await tabPanel.mouse.move(startX + 600, y, { steps: 8 });
await tabPanel.mouse.up();
panels.obergrenze = await panelMessen();
const griff2 = await griff.boundingBox();
await tabPanel.mouse.move(griff2.x + griff2.width / 2, y);
await tabPanel.mouse.down();
await tabPanel.mouse.move(griff2.x + griff2.width / 2 - 800, y, { steps: 8 });
await tabPanel.mouse.up();
panels.untergrenze = await panelMessen();

const inspGriff = tabPanel.locator('.app__split[data-panel="inspector"]');
const inspKasten = await inspGriff.boundingBox();
await tabPanel.mouse.move(inspKasten.x + inspKasten.width / 2, y);
await tabPanel.mouse.down();
await tabPanel.mouse.move(inspKasten.x + inspKasten.width / 2 - 40, y, { steps: 5 });
await tabPanel.mouse.up();
panels.inspektorGezogen = await panelMessen();
await tabPanel.screenshot({ path: join(out, "panelbreiten-1440.png") });

await inspGriff.dblclick();
panels.nachDoppelklick = await panelMessen();
await griff.focus();
await tabPanel.keyboard.press("ArrowRight");
panels.nachPfeiltaste = await panelMessen();
await tabPanel.reload({ waitUntil: "load" });
await tabPanel.waitForTimeout(250);
panels.nachNeuladen = await panelMessen();
await ctxPanel.close();

await browser.close();
const bericht = { matrix, ausnahmen: AUSNAHMEN, panels, layout, konsole, anfragen, fehler: konsole.length + anfragen.length };
writeFileSync(join(out, "pruefung-zustand-layout.json"), JSON.stringify(bericht, null, 2));
console.log(JSON.stringify(bericht, null, 2));
