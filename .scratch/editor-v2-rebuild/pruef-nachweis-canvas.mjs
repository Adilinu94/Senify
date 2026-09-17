// Nachweis: die Canvas-Ansicht (`?view=canvas`) traegt jetzt dieselbe Haut wie
// der Editor (`?view=editor`) -- dieselben Tokens, dieselbe Schrift, derselbe
// Symbolbezug, aus derselben Quelle -- und die Arbeitsflaeche (das weisse Blatt
// mit dem Seiteninhalt) bleibt dabei unberuehrt. Zusaetzlich: das Ziehen an den
// Panels im laufenden Editor (Aufgabe 29).
//
// Die festen Dienste (127.0.0.1:4322 / 4321) werden ZUERST abgefragt, aber auf
// Auflage weder gestartet noch angefasst. Ist keiner erreichbar, startet dieses
// Skript -- wie die Browser-Tests des Repos -- eine EIGENE, fluechtige
// Programm-Instanz auf freien Ports (appPort: 0 / enginePort: 0), misst gegen
// sie und beendet nur diese wieder.
//
// Ausgabe: `.scratch/refs/nick/ui/nachweis-canvas.json` + Screenshots.
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

// ------------------------------------------------- fluechtige Programm-Instanz
const author = { kind: "human", id: "messung", label: "Messung" };
const database = memoryDb();
const dataDir = mkdtempSync(join(tmpdir(), "senify-canvas-r-"));
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

const site = await (await post("/api/sites", { name: "Nachweis Canvas " + Date.now() })).json();
const page = await (
  await post(`/api/sites/${site.id}/pages`, { title: "Start", path: "/" })
).json();
await post(`/api/pages/${page.id}/mutations`, {
  baseDraftVersion: page.draftVersion,
  author,
  mutations: [
    { op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { type: "hero", props: { headline: "Canvas-Haut" } } },
    { op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { type: "features", props: {} } },
  ],
});

// ------------------------------------------------------------------ Messkern
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

  // 2) Was die Oberflaeche TATSAECHLICH malt.
  const bg = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).backgroundColor : null;
  };
  const color = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).color : null;
  };
  const farbproben = {
    wurzelGrund: traeger ? getComputedStyle(traeger).backgroundColor : null,
    topbarGrund: istCanvas ? bg(".senify-canvas__topbar") : bg(".senify-editor__topbar"),
    knopfGrund: istCanvas ? null : bg(".senify-editor__publish"),
    panelGrund: istCanvas ? null : bg(".senify-editor__panels"),
    buehneGrund: istCanvas ? bg(".senify-canvas__stage") : bg(".senify-editor__stage"),
    statusGrund: istCanvas ? color(".senify-canvas__status") : bg(".senify-editor__status"),
  };

  // 2b) Kontraste wie im Plan, direkt an der laufenden Oberflaeche nachgerechnet
  // (WCAG-Formel). Die Paare stammen aus `EDITOR_CONTRAST_PROOF`/ui-design.md.
  const lum = (c) => {
    const m = String(c).match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(Number(m[0])) + 0.7152 * f(Number(m[1])) + 0.0722 * f(Number(m[2]));
  };
  const ratio = (fg, bgg) => {
    const a = lum(fg);
    const b = lum(bgg);
    if (a === null || b === null) return null;
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const paare = istCanvas
    ? [
        ["Status auf Kopfleiste", color(".senify-canvas__status"), bg(".senify-canvas__topbar")],
        ["Knopf auf Kopfleiste", color(".senify-canvas__button"), bg(".senify-canvas__topbar")],
        ["Zoom auf Kopfleiste", color(".senify-canvas__zoom-label"), bg(".senify-canvas__topbar")],
      ]
    : [
        ["Status auf Statusleiste", color(".senify-editor__status-message"), bg(".senify-editor__status")],
        ["Knopf auf Kopfleiste", color(".senify-editor__button"), bg(".senify-editor__topbar")],
        ["Text auf Lime", color(".senify-editor__publish"), bg(".senify-editor__publish")],
      ];
  const kontrast = Object.fromEntries(paare.map(([name, fg, bgg]) => [name, ratio(fg, bgg)]));

  // 3) Schrift: berechnete Familie, geladene Schnitte, Titel-Schrift.
  const bandRoot = istCanvas ? ".senify-canvas" : ".senify-editor";
  const titelEl = istCanvas
    ? null
    : document.querySelector(".senify-editor__brand, .senify-editor__panel-heading, .senify-editor__title strong");
  const schrift = {
    familie: traeger ? getComputedStyle(traeger).fontFamily : null,
    titelFamilie: titelEl ? getComputedStyle(titelEl).fontFamily : null,
    interDisplay600: document.fonts.check('600 15px "Inter Display"'),
    geladeneSchnitte: [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`).sort(),
    bekannt: [...document.fonts].map((f) => `${f.family} ${f.weight}`).sort(),
    fontFaceStyleElemente: document.querySelectorAll("[data-senify-editor-styles], [data-senify-canvas-styles], [data-senify-canvas-skin]").length,
    cls: Math.round((window.__cls ?? 0) * 10000) / 10000,
    bandRoot,
  };

  // 4) Inhaltsbereich (das Blatt): bleibt er neutral? Wir lesen Innen und Rand.
  const frameWrap = document.querySelector(istCanvas ? ".senify-canvas__frame" : ".senify-editor__frame");
  const iframe = document.querySelector(istCanvas ? ".senify-canvas__iframe" : ".senify-editor__iframe");
  let blatt = null;
  try {
    const d = iframe?.contentDocument;
    if (d && d.body) {
      const s = getComputedStyle(d.body);
      blatt = {
        koerperGrund: s.backgroundColor,
        koerperFarbe: s.color,
        koerperFamilie: s.fontFamily,
        // Kein `--ed-*` im Inhaltsdokument: die Haut reicht nicht hinein.
        edVariablen: [...Object.keys(d.documentElement.style)].filter((k) => k.startsWith("--ed-")).length,
        knoten: d.querySelectorAll("[data-node-id]").length,
        soraGeladen: [...d.fonts].filter((f) => f.family === "Sora" && f.status === "loaded").map((f) => `${f.family} ${f.weight}`).sort(),
        skinAttribute: [...d.querySelectorAll("*")].some((el) => el.hasAttribute("data-editor-skin")),
      };
    }
  } catch (e) {
    blatt = { fehler: String(e) };
  }
  const blattRandGrund = frameWrap ? getComputedStyle(frameWrap).backgroundColor : null;

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

  // 6) Layoutprobe (Aufgabe 28).
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
    statusleisteSichtbar: sichtbar(statusEl),
    buehneOverflowY: stageEl ? getComputedStyle(stageEl).overflowY : null,
    buehneScrolltAllein: stageEl ? stageEl.scrollHeight >= stageEl.clientHeight : null,
    iframes: document.querySelectorAll(".senify-editor__iframe, .senify-canvas__iframe").length,
  };

  // 7) Panels (Aufgabe 29), nur im laufenden Editor.
  const main = document.querySelector(".senify-editor__main");
  const panels = main
    ? {
        breiten: main.getAttribute("data-breiten"),
        inspectorBreite: Math.round(document.querySelector(".senify-editor__panels").getBoundingClientRect().width),
        explorerBreite: Math.round(document.querySelector(".senify-editor__rail").getBoundingClientRect().width),
        kanten: [...document.querySelectorAll(".senify-editor__split")].map((el) => ({
          panel: el.getAttribute("data-panel"),
          sichtbar: sichtbar(el),
        })),
        ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    : null;

  return {
    view: istCanvas ? "canvas" : "editor",
    vorhanden: !!traeger,
    wurzelAttribute: traeger
      ? { marke: traeger.getAttribute("data-senify-editor"), haut: traeger.getAttribute("data-editor-skin") }
      : null,
    farben,
    farbproben,
    kontrast,
    schrift,
    blatt,
    blattRandGrund,
    symbole,
    layout,
    panels,
  };
};

// Inhalt des Blattes mit alter Haut vergleichen: derselbe Inhalt muss dieselben
// Werte zeigen, egal ob die Tiefwasser-Haut an ist (Beweis: Haut blutet nicht).
const blattProbe = (root) => {
  const iframe = document.querySelector(`${root}__iframe`);
  const wrap = document.querySelector(`${root}__frame`);
  if (!iframe?.contentDocument?.body) return null;
  const s = getComputedStyle(iframe.contentDocument.body);
  return {
    grund: s.backgroundColor,
    farbe: s.color,
    familie: s.fontFamily,
    rand: wrap ? getComputedStyle(wrap).backgroundColor : null,
  };
};

// -------------------------------------------------------------- Browserlauf
const browser = await (await import("playwright")).chromium.launch({ headless: true });
const istFavicon = (url) => url.endsWith("/favicon.ico");
const fremd = (url) => !/^(http:\/\/127\.0\.0\.1|http:\/\/localhost|data:|blob:|file:)/.test(url);

const bericht = { dienste, base, ansichten: {}, panels: {}, vorschau: {}, konsole: [], anfragen: [] };

const initScript = () => {
  window.__cls = 0;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  } catch {
    /* nicht unterstuetzt */
  }
};

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
    await tab.addInitScript(initScript);

    const ziel = ansicht === "canvas" ? "?view=canvas" : "?view=editor";
    const url = `${base}/#/projects/${site.id}/pages/${page.id}${ziel}`;
    const erwartet = ansicht === "canvas" ? ".senify-canvas" : ".senify-editor";
    let montiert = false;
    for (let versuch = 0; versuch < 3 && !montiert; versuch += 1) {
      await tab.goto(url, { waitUntil: "domcontentloaded" });
      montiert = await tab.waitForSelector(erwartet, { timeout: 30000 }).then(() => true).catch(() => false);
    }
    await tab.waitForTimeout(1200);
    try { await tab.evaluate(async () => { await document.fonts.ready; }); } catch { /* egal */ }
    await tab.waitForTimeout(300);

    let ergebnis = { view: ansicht, montiert };
    if (montiert) {
      ergebnis = await tab.evaluate(messung, EDITOR_TOKENS);
      ergebnis.montiert = true;
      // Die Haut ist an: Inhalt darf sich durch Ab- und Anschalten nicht aendern.
      const root = ansicht === "canvas" ? ".senify-canvas" : ".senify-editor";
      const an = await tab.evaluate(blattProbe, root);
      const chromeVorher = await tab.evaluate(
        (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor,
        ansicht === "canvas" ? ".senify-canvas__topbar" : ".senify-editor__topbar",
      );
      await tab.evaluate((sel) => document.querySelector(sel)?.setAttribute("data-editor-skin", "alt"), root);
      await tab.waitForTimeout(120);
      const aus = await tab.evaluate(blattProbe, root);
      const chromeNachher = await tab.evaluate(
        (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor,
        ansicht === "canvas" ? ".senify-canvas__topbar" : ".senify-editor__topbar",
      );
      await tab.evaluate((sel) => document.querySelector(sel)?.setAttribute("data-editor-skin", "tiefwasser"), root);
      await tab.waitForTimeout(120);
      ergebnis.blattVorherNachher = {
        an,
        aus,
        gleich: JSON.stringify(an) === JSON.stringify(aus),
        chromeVorher,
        chromeNachher,
        chromeAendert: chromeVorher !== chromeNachher,
      };
      ergebnis.montiert = true;
    }
    await tab.screenshot({ path: join(out, `canvas-${ansicht}-${bp.name}.png`), fullPage: false });
    await ctx.close();

    bericht.ansichten[`${ansicht}-${bp.name}`] = { ...ergebnis, konsole, anfragen };
    bericht.konsole.push(...konsole.map((k) => `${ansicht}-${bp.name}: ${k}`));
    bericht.anfragen.push(...anfragen.map((a) => `${ansicht}-${bp.name}: ${a}`));
  }
}

// ----------------------------------------------- Panels ziehen (Aufgabe 29)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const tab = await ctx.newPage();
  tab.setDefaultTimeout(30000);
  const konsole = [];
  const anfragen = [];
  tab.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
  tab.on("pageerror", (e) => konsole.push("PAGEERROR " + e.message));
  tab.on("requestfailed", (r) => { if (!istFavicon(r.url())) anfragen.push(`FAIL ${r.url()}`); });
  const url = `${base}/#/projects/${site.id}/pages/${page.id}?view=editor`;
  await tab.goto(url, { waitUntil: "domcontentloaded" });
  await tab.waitForSelector(".senify-editor", { timeout: 30000 });
  await tab.waitForTimeout(400);

  const messen = () => tab.evaluate(() => {
    const main = document.querySelector(".senify-editor__main");
    const b = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().width);
    return {
      breiten: main.getAttribute("data-breiten"),
      inspector: b(".senify-editor__panels"),
      explorer: b(".senify-editor__rail"),
      ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  const panels = { start: await messen(), schritte: [] };
  const griff = tab.locator('.senify-editor__split[data-panel="inspector"]');
  const box = await griff.boundingBox();
  const startX = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + 200;
  await tab.mouse.move(startX, y);
  await tab.mouse.down();
  await tab.mouse.move(startX + 40, y, { steps: 6 });
  panels.schritte.push({ was: "ziehen +40", ...(await messen()) });
  await tab.mouse.up();

  // Grenze 420.
  await tab.mouse.move(startX + 40, y);
  await tab.mouse.down();
  await tab.mouse.move(startX + 600, y, { steps: 8 });
  await tab.mouse.up();
  panels.schritte.push({ was: "ziehen weit (Grenze)", ...(await messen()) });

  // Doppelklick setzt den Standard (320) des Feldes an der Kante.
  await griff.dblclick();
  panels.schritte.push({ was: "doppelklick", ...(await messen()) });

  // Tastatur: Pfeil rechts +8.
  await griff.focus();
  await tab.keyboard.press("ArrowRight");
  panels.schritte.push({ was: "pfeil rechts", ...(await messen()) });

  // Explorer-Kante: ziehen +30, dann Doppelklick (264).
  const eGriff = tab.locator('.senify-editor__split[data-panel="explorer"]');
  const eBox = await eGriff.boundingBox();
  const eX = (eBox?.x ?? 0) + (eBox?.width ?? 0) / 2;
  await tab.mouse.move(eX, y);
  await tab.mouse.down();
  await tab.mouse.move(eX + 30, y, { steps: 6 });
  panels.schritte.push({ was: "explorer +30", ...(await messen()) });
  await tab.mouse.up();
  await eGriff.dblclick();
  panels.schritte.push({ was: "explorer doppelklick", ...(await messen()) });

  await tab.screenshot({ path: join(out, "canvas-panels-1440.png") });

  // Breiten ueberleben ein Neuladen.
  await tab.reload({ waitUntil: "domcontentloaded" });
  await tab.waitForSelector(".senify-editor", { timeout: 30000 });
  await tab.waitForTimeout(400);
  panels.nachNeuladen = await messen();

  bericht.panels = { ...panels, konsole, anfragen };
  await ctx.close();
}

// -------------------------------------------------------- Sollbild-Vorschau
for (const bp of breiten) {
  const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 });
  const tab = await ctx.newPage();
  const konsole = [];
  const anfragen = [];
  tab.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
  tab.on("pageerror", (e) => konsole.push("PAGEERROR " + e.message));
  tab.on("requestfailed", (r) => anfragen.push("FAIL " + r.url()));
  tab.on("request", (r) => { if (fremd(r.url())) anfragen.push("FREMD " + r.url()); });
  await tab.addInitScript(initScript);
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
      kontrast: document.documentElement.getAttribute("data-kontrast-geprueft"),
      kontrastZeilen: document.querySelectorAll("#kontrast-koerper tr").length,
      cls: Math.round((window.__cls ?? 0) * 10000) / 10000,
      ueberlaufPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await tab.screenshot({ path: join(out, `canvas-vorschau-${bp.name}.png`) });
  await ctx.close();
  bericht.vorschau[bp.name] = { ...mess, konsole, anfragen };
  bericht.konsole.push(...konsole.map((k) => `vorschau-${bp.name}: ${k}`));
  bericht.anfragen.push(...anfragen.map((a) => `vorschau-${bp.name}: ${a}`));
}

await browser.close();
await running.close();
await database.close();
rmSync(dataDir, { recursive: true, force: true });

bericht.fehler = bericht.konsole.length + bericht.anfragen.length;
writeFileSync(join(out, "nachweis-canvas.json"), JSON.stringify(bericht, null, 2));

const kurz = {
  dienste,
  ansichten: Object.fromEntries(
    Object.entries(bericht.ansichten).map(([k, v]) => [
      k,
      {
        montiert: v.montiert,
        wurzel: v.wurzelAttribute,
        tokens: v.farben ? `${v.farben.gleich}/${v.farben.geprueft}` : null,
        abweichend: v.farben?.abweichend?.length ?? null,
        topbar: v.farbproben?.topbarGrund ?? null,
        buehne: v.farbproben?.buehneGrund ?? null,
        knopf: v.farbproben?.knopfGrund ?? null,
        kontrast: v.kontrast ?? null,
        schrift: v.schrift?.familie ?? null,
        titel: v.schrift?.titelFamilie ?? null,
        displayGeladen: v.schrift?.interDisplay600 ?? null,
        blatt: v.blatt ? { grund: v.blatt.koerperGrund, farbe: v.blatt.koerperFarbe, edVars: v.blatt.edVariablen, sora: v.blatt.soraGeladen } : null,
        blattRand: v.blattRandGrund,
        symbole: v.symbole ? `${v.symbole.mitZeichnung}/${v.symbole.icElemente}` : null,
        platzhalter: v.symbole?.platzhalterZeichen ?? null,
        ueberlauf: v.layout?.ueberlaufPx ?? null,
        status: v.layout?.statusleisteSichtbar ?? null,
        cls: v.schrift?.cls ?? null,
        blattVorherNachherGleich: v.blattVorherNachher?.gleich ?? null,
        chromeAendert: v.blattVorherNachher?.chromeAendert ?? null,
        chromeVorher: v.blattVorherNachher?.chromeVorher ?? null,
        chromeNachher: v.blattVorherNachher?.chromeNachher ?? null,
        panels: v.panels?.breiten ?? null,
      },
    ]),
  ),
  panelDrag: {
    start: bericht.panels.start,
    schritte: bericht.panels.schritte,
    nachNeuladen: bericht.panels.nachNeuladen,
    fehler: (bericht.panels.konsole ?? []).length + (bericht.panels.anfragen ?? []).length,
  },
  vorschau: Object.fromEntries(
    Object.entries(bericht.vorschau).map(([k, v]) => [k, { kontrast: v.kontrast, zeilen: v.kontrastZeilen, symbole: `${v.symboleMitZeichnung}/${v.symboleGesamt}`, ueberlauf: v.ueberlaufPx, cls: v.cls }]),
  ),
  fehler: bericht.fehler,
};
console.log(JSON.stringify(kurz, null, 2));
