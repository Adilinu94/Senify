// Nachweis (Auftragsrunde 60): kommt die neue Editor-Haut in der WAHREN
// Editor-Oberflaeche an -- in beiden Ansichten (bisheriger Editor und neue
// Canvas-Ansicht `?view=canvas`) und zusaetzlich im Sollbild
// (`.scratch/editor-v2-rebuild/ui-preview/index.html`)?
//
// Die festen Dienste (127.0.0.1:4322 / 4321) werden ZUERST abgefragt, aber auf
// Auflage weder gestartet noch angefasst. Ist keiner erreichbar, startet dieses
// Skript -- wie die Browser-Tests des Repos -- eine EIGENE, fluechtige
// Programm-Instanz auf freien Ports (appPort: 0 / enginePort: 0), misst gegen
// sie und beendet nur diese wieder. Es fasst keinen fremden Prozess an.
//
// Gemessen wird, was der Auftrag verlangt: berechnete Schriftfamilie und
// geladene Schnitte, Layout-Sprung (CLS), Symbole als echte Zeichnung statt
// Platzhalter, Farben gegen `tokens.ts`, Kontraste wie im Plan, kein Ueberlauf
// bei 1280/1440/1920/schmal, null Konsolenfehler, null fehlgeschlagene
// Anfragen und die unveraenderte Bedienbarkeit der alten Oberflaeche.
//
// Ausgabe: `.scratch/refs/nick/ui/nachweis-r60.json` + Screenshots.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startProgram } from "@senify/app";
import { memoryDb } from "../../packages/app/test/support.ts";
import { EDITOR_TOKENS } from "../../packages/editor/src/ui/tokens.ts";

const out = join(".scratch", "refs", "nick", "ui");
mkdirSync(out, { recursive: true });
const preview = resolve(".scratch", "editor-v2-rebuild", "ui-preview", "index.html");

const breiten = [
  { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
  { name: "schmal", width: 480, height: 900 },
];

// ------------------------------------------------------------------ Dienste
const probe = (url) =>
  fetch(url, { signal: AbortSignal.timeout(4000) })
    .then((r) => ({ url, status: r.status }))
    .catch((e) => ({ url, error: String(e?.cause?.code ?? e.message) }));

const dienste = {
  program4322: await probe("http://127.0.0.1:4322/"),
  engine4321: await probe("http://127.0.0.1:4321/"),
  fontRoute: await probe("http://127.0.0.1:4322/editor-fonts/Inter-Regular.woff2"),
};
const festeDiensteErreichbar =
  dienste.program4322.status !== undefined && dienste.engine4321.status !== undefined;

// ------------------------------------------------- fluechtige Programm-Instanz
const author = { kind: "human", id: "messung", label: "Messung" };
const database = memoryDb();
const dataDir = mkdtempSync(join(tmpdir(), "senify-r60-"));
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

const site = await (await post("/api/sites", { name: "Nachweis R60 " + Date.now() })).json();
const page = await (
  await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
).json();
await post(`/api/pages/${page.id}/mutations`, {
  baseDraftVersion: page.draftVersion,
  author,
  mutations: [
    { op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { type: "hero", props: { headline: "Nachweis R60" } } },
    { op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { type: "features", props: {} } },
  ],
});

// ------------------------------------------------------------------ Messkern
// Laeuft im Editor-Dokument. Der Editor-Rahmen ist ein srcdoc-iframe
// (gleicher Ursprung), deshalb ist `contentDocument` hier lesbar.
const messung = (tokenListe) => {
  const editorRoot = document.querySelector(".senify-editor");
  const canvasRoot = document.querySelector(".senify-canvas");
  const istCanvas = !!canvasRoot && !editorRoot;
  const traeger = editorRoot ?? canvasRoot;

  // 1) Tokens: liegt jeder Wert GENAU wie in `tokens.ts` auf dem Traeger?
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

  // 2) Was die Oberflaeche TATSAECHLICH malt (nicht nur deklariert).
  const bg = (sel, scope) => {
    const el = (scope ?? document).querySelector(sel);
    return el ? getComputedStyle(el).backgroundColor : null;
  };
  const farbproben = {
    wurzelFlaeche: traeger ? getComputedStyle(traeger).getPropertyValue("--ed-surface-canvas").trim() : null,
    topbarGrund: istCanvas ? bg(".senify-canvas__topbar") : bg(".senify-editor__topbar"),
    hauptknopfGrund: istCanvas ? null : bg(".senify-editor__publish"),
    panelGrund: istCanvas ? null : bg(".senify-editor__panels"),
    rahmenGrund: istCanvas ? null : bg(".senify-editor__frame"),
  };

  // 3) Schrift: berechnete Familie, bekannte und geladene Schnitte.
  const schrift = {
    familie: traeger ? getComputedStyle(traeger).fontFamily : null,
    inter400: document.fonts.check('400 13px "Inter"'),
    interDisplay600: document.fonts.check('600 15px "Inter Display"'),
    geladeneSchnitte: [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`).sort(),
    bekannt: [...document.fonts].map((f) => `${f.family} ${f.weight}`).sort(),
    fontFaceStyleElemente: document.querySelectorAll("style[data-senify-editor-styles], style[data-senify-canvas-styles]").length,
    cls: Math.round((window.__cls ?? 0) * 10000) / 10000,
  };

  // 4) Inhalts-Schrift im Rahmen (Sora) und Symbole im Inhalt.
  const frame = document.querySelector(".senify-editor__iframe, .senify-canvas__iframe");
  let rahmen = null;
  try {
    const d = frame?.contentDocument;
    if (d) {
      rahmen = {
        bodyFamilie: getComputedStyle(d.body).fontFamily,
        sora400: d.fonts.check('400 16px "Sora"'),
        sora600: d.fonts.check('600 16px "Sora"'),
        soraSchnitte: [...d.fonts].filter((f) => f.family === "Sora").map((f) => `${f.family} ${f.weight} ${f.status}`).sort(),
        knoten: d.querySelectorAll("[data-node-id]").length,
      };
    }
  } catch (e) {
    rahmen = { fehler: String(e) };
  }

  // 5) Symbole: echte Zeichnung (data-URI-Maske, Groesse > 0) statt Platzhalter.
  const ic = [...document.querySelectorAll(".senify-editor .ic, .senify-canvas .ic")];
  const gezeichnet = ic.filter((el) => {
    const s = getComputedStyle(el);
    const m = s.webkitMaskImage || s.maskImage || String(s.getPropertyValue("--m") ?? "");
    const r = el.getBoundingClientRect();
    return String(m).includes("data:image/svg+xml") && r.width > 0 && r.height > 0;
  });
  const knoepfe = [...document.querySelectorAll(".senify-editor button, .senify-canvas__button")];
  const platzhalter = knoepfe
    .map((el) => (el.textContent ?? "").trim())
    .filter((t) => t.length > 0 && /^[^\w\s]+$/.test(t) && !/[a-zA-Z0-9]/.test(t));
  const symbole = {
    icElemente: ic.length,
    mitZeichnung: gezeichnet.length,
    platzhalterZeichen: [...new Set(platzhalter)],
    platzhalterAnzahl: platzhalter.length,
  };

  // 6) Layoutprobe (Aufgabe 28): kein waagerechter Ueberlauf, Statusleiste
  //    sichtbar, Buehne scrollt allein.
  const sichtbar = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
  };
  const statusEl = document.querySelector(".senify-editor__status, .senify-canvas__status");
  const stageEl = document.querySelector(".senify-editor__stage, .senify-canvas__stage");
  const layout = {
    breite: window.innerWidth,
    ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    senkrechtUeberlaufPx: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    statusleisteSichtbar: sichtbar(statusEl),
    buehneOverflowY: stageEl ? getComputedStyle(stageEl).overflowY : null,
    buehneScrolltAllein: stageEl ? stageEl.scrollHeight >= stageEl.clientHeight : null,
    iframes: document.querySelectorAll(".senify-editor__iframe").length,
  };

  return {
    view: istCanvas ? "canvas" : "editor",
    vorhanden: !!traeger,
    wurzelAttribut: editorRoot?.getAttribute("data-senify-editor") ?? null,
    farben,
    farbproben,
    schrift,
    rahmen,
    symbole,
    layout,
  };
};

// -------------------------------------------------------------- Browserlauf
const browser = await (await import("playwright")).chromium.launch({ headless: true });
const istFavicon = (url) => url.endsWith("/favicon.ico");
const fremd = (url) => !/^(http:\/\/127\.0\.0\.1|http:\/\/localhost|data:|blob:|file:)/.test(url);

const bericht = { dienste, festeDiensteErreichbar, base, ansichten: {}, konsole: [], anfragen: [] };

for (const ansicht of ["editor", "canvas"]) {
  for (const bp of breiten) {
    const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 });
    const tab = await ctx.newPage();
    tab.setDefaultTimeout(30000);
    const konsole = [];
    const anfragen = [];
    tab.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
    tab.on("pageerror", (e) => konsole.push("PAGEERROR " + e.message));
    tab.on("requestfailed", (r) => { if (!istFavicon(r.url())) anfragen.push(`FAIL ${r.url()} ${r.failure()?.errorText ?? ""}`); });
    tab.on("response", (r) => { if (r.status() < 400 || istFavicon(r.url())) return; anfragen.push(`HTTP ${r.status()} ${r.url()}`); });
    tab.on("request", (r) => { if (fremd(r.url())) anfragen.push(`FREMD ${r.url()}`); });
    await tab.addInitScript(() => {
      window.__cls = 0;
      try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      } catch { /* nicht unterstuetzt */ }
    });

    const ziel = ansicht === "canvas" ? "?view=canvas" : "?view=editor";
    const url = `${base}/#/projects/${site.id}/pages/${page.id}${ziel}`;
    const erwartet = ansicht === "canvas" ? ".senify-canvas" : ".senify-editor";
    let montiert = false;
    for (let versuch = 0; versuch < 3 && !montiert; versuch += 1) {
      await tab.goto(url, { waitUntil: "domcontentloaded" });
      montiert = await tab.waitForSelector(erwartet, { timeout: 30000 }).then(() => true).catch(() => false);
    }
    await tab.waitForTimeout(1500);
    try { await tab.evaluate(async () => { await document.fonts.ready; }); } catch { /* egal */ }
    await tab.waitForTimeout(300);

    let ergebnis = { view: ansicht, montiert };
    if (montiert) {
      ergebnis = await tab.evaluate(messung, EDITOR_TOKENS);
      ergebnis.montiert = true;
      // Bedienbarkeit der alten Oberflaeche: Menue oeffnet und schliesst.
      if (ansicht === "editor") {
        const bedien = { menueGeoeffnet: false, menueEintraege: 0 };
        try {
          await tab.locator('[data-action="menu-brand"]').click();
          await tab.waitForTimeout(120);
          bedien.menueEintraege = await tab.locator(".senify-editor__menu-item").count();
          bedien.menueGeoeffnet = bedien.menueEintraege > 0;
          await tab.keyboard.press("Escape");
        } catch { /* Bedienprobe ist ein Zusatz */ }
        ergebnis.bedienbarkeit = bedien;
      }
    }
    await tab.screenshot({ path: join(out, `r60-${ansicht}-${bp.name}.png`), fullPage: false });
    await ctx.close();

    bericht.ansichten[`${ansicht}-${bp.name}`] = { ...ergebnis, konsole, anfragen };
    bericht.konsole.push(...konsole.map((k) => `${ansicht}-${bp.name}: ${k}`));
    bericht.anfragen.push(...anfragen.map((a) => `${ansicht}-${bp.name}: ${a}`));
  }
}

// -------------------------------------------------------- Sollbild-Vorschau
const vorschau = { breiten: {} };
for (const bp of breiten) {
  const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 });
  const tab = await ctx.newPage();
  const konsole = [];
  const anfragen = [];
  tab.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
  tab.on("pageerror", (e) => konsole.push("PAGEERROR " + e.message));
  tab.on("requestfailed", (r) => anfragen.push("FAIL " + r.url()));
  tab.on("request", (r) => { if (fremd(r.url())) anfragen.push("FREMD " + r.url()); });
  await tab.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    } catch { /* nicht unterstuetzt */ }
  });
  await tab.goto(pathToFileURL(preview).href, { waitUntil: "load" });
  try { await tab.evaluate(async () => { await document.fonts.ready; }); } catch { /* egal */ }
  await tab.waitForTimeout(400);
  const mess = await tab.evaluate(() => {
    const fam = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontFamily : null; };
    const ic = [...document.querySelectorAll(".ic")];
    const gezeichnet = ic.filter((el) => {
      const s = getComputedStyle(el);
      const m = s.webkitMaskImage || s.maskImage || "";
      const r = el.getBoundingClientRect();
      return String(m).includes("data:image/svg+xml") && r.width > 0 && r.height > 0;
    });
    return {
      bodyFont: fam("body"),
      displayFont: fam("h1, h2, h3"),
      geladeneSchnitte: [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`).sort(),
      symboleGesamt: ic.length,
      symboleMitZeichnung: gezeichnet.length,
      symboleOhneZeichnung: ic.length - gezeichnet.length,
      kontrast: document.documentElement.getAttribute("data-kontrast-geprueft"),
      kontrastZeilen: document.querySelectorAll("#kontrast-koerper tr").length,
      kontrastAbweichungen: document.querySelectorAll('#kontrast-koerper tr[data-ok="false"], #kontrast-koerper tr[data-abweichung="true"]').length,
      cls: Math.round((window.__cls ?? 0) * 10000) / 10000,
      ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await tab.screenshot({ path: join(out, `r60-vorschau-${bp.name}.png`) });
  await ctx.close();
  vorschau.breiten[bp.name] = { ...mess, konsole, anfragen };
  bericht.konsole.push(...konsole.map((k) => `vorschau-${bp.name}: ${k}`));
  bericht.anfragen.push(...anfragen.map((a) => `vorschau-${bp.name}: ${a}`));
}
bericht.vorschau = vorschau;

await browser.close();
await running.close();
await database.close();
rmSync(dataDir, { recursive: true, force: true });

bericht.fehler = bericht.konsole.length + bericht.anfragen.length;
writeFileSync(join(out, "nachweis-r60.json"), JSON.stringify(bericht, null, 2));

// Kurzfassung auf der Konsole (die Zahlen, die in den Bericht gehen).
const kurz = {
  dienste,
  ansichten: Object.fromEntries(
    Object.entries(bericht.ansichten).map(([k, v]) => [
      k,
      {
        montiert: v.montiert,
        tokens: v.farben ? `${v.farben.gleich}/${v.farben.geprueft}` : null,
        topbar: v.farbproben?.topbarGrund ?? null,
        knopf: v.farbproben?.hauptknopfGrund ?? null,
        schrift: v.schrift?.familie ?? null,
        sora: v.rahmen?.sora400 ?? null,
        symbole: v.symbole ? `${v.symbole.mitZeichnung}/${v.symbole.icElemente}` : null,
        platzhalter: v.symbole?.platzhalterZeichen ?? null,
        ueberlauf: v.layout?.ueberlaufPx ?? null,
        cls: v.schrift?.cls ?? null,
      },
    ]),
  ),
  vorschau: Object.fromEntries(
    Object.entries(vorschau.breiten).map(([k, v]) => [k, { kontrast: v.kontrast, zeilen: v.kontrastZeilen, symbole: `${v.symboleMitZeichnung}/${v.symboleGesamt}`, ueberlauf: v.ueberlaufPx, cls: v.cls }]),
  ),
  fehler: bericht.fehler,
};
console.log(JSON.stringify(kurz, null, 2));
