// Belegpflicht (Auftragsrunde 80, Punkte 1 und 4): kommen Schrift, Symbole und
// die Tiefwasser-Palette in der ECHTEN Editor-Oberflaeche an, und zwar in beiden
// Ansichten (bisheriger Editor und neue Canvas-Ansicht `?view=canvas`)?
//
// Die festen Dienste (127.0.0.1:4322 / 4321) waren bei dieser Messung nicht
// erreichbar und wurden auf Auflage NICHT gestartet. Damit die Oberflaeche
// trotzdem im echten Browser messbar ist, startet dieses Skript -- wie die
// Browser-Tests des Repos (`packages/app/test/*-browser.test.ts`) -- eine
// EIGENE, fluechtige Programm-Instanz auf einem freien Port (appPort: 0) und
// beendet sie am Ende wieder. Es fasst keinen laufenden Prozess an.
//
// Ausgabe: .scratch/refs/nick/ui/nachweis-editor.json + Screenshots je Breite.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProgram } from "@senify/app";
import { memoryDb } from "../../packages/app/test/support.ts";
import { EDITOR_TOKENS } from "../../packages/editor/src/ui/tokens.ts";

const out = join(".scratch", "refs", "nick", "ui");
mkdirSync(out, { recursive: true });

const breiten = [
  { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
  { name: "schmal", width: 480, height: 900 },
];

const author = { kind: "human", id: "messung", label: "Messung" };
const database = memoryDb();
const dataDir = mkdtempSync(join(tmpdir(), "senify-editor-nachweis-"));
const running = await startProgram({
  db: database.db,
  dataDir,
  programTokenFile: join(dataDir, "program-token.json"),
  enginePort: 0,
  appPort: 0,
  openBrowser: false,
  rateLimits: { perMinute: 1200, burst: 400, destructivePerMinute: 200 },
});
const base = running.dashboardUrl;

const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const site = await (await post("/api/sites", { name: "Editor-Nachweis " + Date.now() })).json();
const page = await (
  await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
).json();
await post(`/api/pages/${page.id}/mutations`, {
  baseDraftVersion: page.draftVersion,
  author,
  mutations: [
    {
      op: "insertNode",
      parent: { nodeId: page.draft.rootNodeId },
      node: { type: "hero", props: { headline: "Editor-Nachweis" } },
    },
    {
      op: "insertNode",
      parent: { nodeId: page.draft.rootNodeId },
      node: { type: "features", props: {} },
    },
  ],
});

// Der Messkern: laeuft im Editor-Dokument und gibt alles zurueck, was die
// Auftragspunkte 1 und 4 verlangen (Farben mit Zahlen, Schrift, Symbole,
// Ueberlauf, Statusleiste, Buehne).
const messung = (tokenListe) => {
  const root = document.querySelector(".senify-editor, .senify-canvas");
  const editorRoot = document.querySelector(".senify-editor");
  const canvasRoot = document.querySelector(".senify-canvas");
  const istCanvas = !!canvasRoot && !editorRoot;

  // 1) Tiefwasser-Palette: liegt JEDER Token mit GENAU dem Wert aus tokens.ts
  //    auf dem Editor-Wurzelknoten?
  const traeger = editorRoot ?? canvasRoot;
  const farben = { geprueft: 0, gleich: 0, fehlend: [], abweichend: [] };
  if (traeger) {
    const stil = getComputedStyle(traeger);
    for (const [name, wert] of Object.entries(tokenListe)) {
      farben.geprueft += 1;
      const gelesen = stil.getPropertyValue(name).trim();
      if (gelesen === "") farben.fehlend.push(name);
      else if (gelesen !== wert) farben.abweichend.push({ name, wert, gelesen });
      else farben.gleich += 1;
    }
  }
  const farbproben = {
    // Der Wurzelknoten selbst (neue Haut-Variablen) ...
    wurzelFlaeche: traeger ? getComputedStyle(traeger).getPropertyValue("--ed-surface-canvas").trim() : null,
    // ... und was die LAUFENDE (T17) Oberflaeche tatsaechlich malt.
    topbarGrund: editorRoot
      ? getComputedStyle(editorRoot.querySelector(".senify-editor__topbar")).backgroundColor
      : canvasRoot
        ? getComputedStyle(canvasRoot.querySelector(".senify-canvas__topbar")).backgroundColor
        : null,
    hauptknopfGrund: editorRoot
      ? getComputedStyle(editorRoot.querySelector(".senify-editor__publish") ?? editorRoot).backgroundColor
      : null,
    panelGrund: editorRoot
      ? getComputedStyle(editorRoot.querySelector(".senify-editor__panels")).backgroundColor
      : null,
  };

  // 2) Schrift: berechnete Familie, geladene Schnitte, Layout-Sprung (CLS).
  const familie = editorRoot
    ? getComputedStyle(editorRoot).fontFamily
    : canvasRoot
      ? getComputedStyle(canvasRoot).fontFamily
      : null;
  const schrift = {
    familie,
    inter400: document.fonts.check('400 13px "Inter"'),
    interDisplay600: document.fonts.check('600 15px "Inter Display"'),
    geladeneSchnitte: [...document.fonts]
      .filter((f) => f.status === "loaded")
      .map((f) => `${f.family} ${f.weight}`)
      .sort(),
    bekannt: [...document.fonts].map((f) => `${f.family} ${f.weight}`).sort(),
    fontFaceRegeln: document.querySelectorAll("style[data-senify-editor-styles], style[data-senify-canvas-styles]").length,
    cls: Math.round((window.__cls ?? 0) * 10000) / 10000,
  };

  // 3) Symbole: echte Zeichnung (Maske aus data-URI) oder Platzhalter-Zeichen?
  const zeichen = [...document.querySelectorAll(".senify-editor button, .senify-canvas__button")];
  const platzhalter = zeichen
    .map((el) => (el.textContent ?? "").trim())
    .filter((t) => t.length > 0 && /^[^\w\s]+$/.test(t) && !/[a-zA-Z]/.test(t));
  const symbole = {
    icMaskenElemente: document.querySelectorAll('[class*="ic--"]').length,
    maskenMitDataUri: [...document.querySelectorAll('[class*="ic--"]')].filter((el) => {
      const s = getComputedStyle(el);
      return ((s.webkitMaskImage || s.maskImage || "").includes("data:image/svg+xml"));
    }).length,
    platzhalterZeichen: [...new Set(platzhalter)].slice(0, 12),
    platzhalterAnzahl: platzhalter.length,
  };

  // 4) Layoutprobe (Aufgabe 28): kein waagerechter Ueberlauf, Statusleiste
  //    sichtbar, Buehne scrollt allein.
  const statusEl = document.querySelector(".senify-editor__status, .senify-canvas__status");
  const stageEl = document.querySelector(".senify-editor__stage, .senify-canvas__stage");
  const sichtbar = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
  };
  const layout = {
    breite: window.innerWidth,
    ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    senkrechtUeberlaufPx: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    statusleisteSichtbar: sichtbar(statusEl),
    buehneOverflow: stageEl ? getComputedStyle(stageEl).overflowY : null,
    buehneScrolltAllein: stageEl ? stageEl.scrollHeight >= stageEl.clientHeight : null,
    panelAngedockt: !!document.querySelector(".senify-editor__panels, .senify-canvas__topbar"),
  };

  return {
    view: istCanvas ? "canvas" : "editor",
    vorhanden: !!root,
    wurzelAttribut: editorRoot?.getAttribute("data-senify-editor") ?? null,
    farben,
    farbproben,
    schrift,
    symbole,
    layout,
  };
};

const browser = await (await import("playwright")).chromium.launch({ headless: true });
const bericht = { base, ansichten: {}, konsole: [], anfragen: [], fehler: 0 };
const istFavicon = (url) => url.endsWith("/favicon.ico");

for (const ansicht of ["editor", "canvas"]) {
  for (const bp of breiten) {
    const ctx = await browser.newContext({
      viewport: { width: bp.width, height: bp.height },
      deviceScaleFactor: 1,
    });
    const tab = await ctx.newPage();
    tab.setDefaultTimeout(30000);
    const konsole = [];
    const anfragen = [];
    tab.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
    tab.on("pageerror", (e) => konsole.push("PAGEERROR " + e.message));
    tab.on("requestfailed", (r) => {
      if (!istFavicon(r.url())) anfragen.push(`FAIL ${r.url()} ${r.failure()?.errorText ?? ""}`);
    });
    tab.on("response", (r) => {
      if (r.status() < 400 || istFavicon(r.url())) return;
      anfragen.push(`HTTP ${r.status()} ${r.url()}`);
    });
    tab.on("request", (r) => {
      const url = r.url();
      if (!/^(http:\/\/127\.0\.0\.1|http:\/\/localhost|data:|blob:)/.test(url)) {
        anfragen.push(`FREMD ${url}`);
      }
    });
    await tab.addInitScript(() => {
      window.__cls = 0;
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      } catch { /* nicht unterstuetzt */ }
    });

    const ziel = ansicht === "canvas" ? "?view=canvas" : "?view=editor";
    const url = `${base}/#/projects/${site.id}/pages/${page.id}${ziel}`;
    const erwartet = ansicht === "canvas" ? ".senify-canvas" : ".senify-editor";
    let montiert = false;
    for (let versuch = 0; versuch < 3 && !montiert; versuch += 1) {
      await tab.goto(url, { waitUntil: "domcontentloaded" });
      montiert = await tab
        .waitForSelector(erwartet, { timeout: 30000 })
        .then(() => true)
        .catch(() => false);
    }
    await tab.waitForTimeout(1500);

    let ergebnis = { view: ansicht, montiert };
    if (montiert) {
      ergebnis = await tab.evaluate(messung, EDITOR_TOKENS);
      ergebnis.montiert = true;
    }
    await tab.screenshot({
      path: join(out, `editor-${ansicht}-${bp.name}.png`),
      fullPage: false,
    });
    await ctx.close();

    bericht.ansichten[`${ansicht}-${bp.name}`] = { ...ergebnis, konsole, anfragen };
    bericht.konsole.push(...konsole.map((k) => `${ansicht}-${bp.name}: ${k}`));
    bericht.anfragen.push(...anfragen.map((a) => `${ansicht}-${bp.name}: ${a}`));
  }
}

await browser.close();
await running.close();
await database.close();
rmSync(dataDir, { recursive: true, force: true });

bericht.fehler = bericht.konsole.length + bericht.anfragen.length;
writeFileSync(join(out, "nachweis-editor.json"), JSON.stringify(bericht, null, 2));
console.log(JSON.stringify(bericht, null, 2));
