import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Erzeugt `docs/current/module.md`: die Übersicht der Fachmodule aus dem Code.
//
// Warum generiert: die R12-Zeile in `docs/current/stand.md` war 7 046 Zeichen
// lang und nannte 73 Dateinamen, 8 Routenzahlen und 8 Zeilenzahlen - alles von
// Hand. Am 23.10.2026 waren zwei Routenzahlen falsch (`http-routes-sites.ts`
// 64 statt 61, `http-routes-media.ts` 16 statt 15) und vier Mapper-Module
// fehlten ganz. Niemand findet das beim Lesen.
//
// Dieses Skript liest den Bestand und schreibt ihn. `--check` vergleicht,
// statt zu schreiben - das Muster von `route-matrix` und `render-manifest`:
// eine generierte Datei ohne Tor driftet still.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "packages", "engine", "src");
const PUB = join(ROOT, "packages", "app", "public");
const MCP_SRC = join(ROOT, "packages", "mcp", "src");
const ZIEL = join(ROOT, "docs", "current", "module.md");

/**
 * Der Kopfkommentar einer Datei.
 *
 * Er steht NICHT immer in Zeile 1: manche Module fuehren erst ihre Importe und
 * beschreiben sich darunter (`store-audit.ts`, `http-response.ts`). Gesucht
 * wird deshalb der erste zusammenhaengende `//`-Block VOR dem ersten Export.
 * Genau diese Annahme war im ersten Anlauf falsch - vier von sechs Modulen
 * wurden als "ohne Kopfkommentar" gemeldet, obwohl sie einen haben.
 */
function kopf(pfad) {
  const zeilen = readFileSync(pfad, "utf8").split(/\r?\n/);
  for (let i = 0; i < zeilen.length; i++) {
    if (!zeilen[i].startsWith("//")) continue;
    const block = [];
    let j = i;
    while (j < zeilen.length && zeilen[j].startsWith("//")) {
      block.push(zeilen[j].replace(/^\/\/\s?/, ""));
      j++;
    }
    // Der Block muss den Zweck nennen, nicht nur eine Trennlinie sein.
    if (block.some((z) => z.trim().length > 25)) return block;
  }
  return [];
}

/** Der Zweck: der erste Absatz des Kopfkommentars, einzeilig. */
function zweck(pfad) {
  const zeilen = kopf(pfad);
  if (zeilen.length === 0) return "(kein Kopfkommentar)";
  const absatz = [];
  for (const z of zeilen) {
    if (z.trim() === "") break;
    absatz.push(z.trim());
  }
  return absatz.join(" ");
}

/** Zeilen wie im Editor gezaehlt (ohne die leere Zeile nach dem Schluss-Newline). */
function zeilenZahl(pfad) {
  const roh = readFileSync(pfad, "utf8");
  const n = roh.split(/\r?\n/).length;
  return roh.endsWith("\n") ? n - 1 : n;
}

/** Eine Markdown-Zelle: Pipes und Zeilenumbrueche wuerden die Tabelle brechen. */
function zelle(text) {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Der Test, der zu einem Modul gehoert - oder `-`. */
function testDatei(dir, name, endung) {
  const basis = name.replace(new RegExp(`\\${endung}$`), "");
  const rel = dir.slice(ROOT.length + 1).replace(/\\/g, "/");
  const paket = rel.split("/")[0];
  const kandidaten = [
    `packages/${paket}/test/${basis}.test.ts`,
    `packages/app/test/${basis}-browser.test.ts`,
    `packages/app/test/${basis}.test.ts`,
  ];
  const treffer = kandidaten.find((p) => existsSync(join(ROOT, p)));
  return treffer === undefined ? "-" : `\`${treffer}\``;
}

function klasse(pfad) {
  return /^export class (\w+)/m.exec(readFileSync(pfad, "utf8"))?.[1] ?? null;
}

function routen(pfad) {
  return (readFileSync(pfad, "utf8").match(/^\s*method: "/gm) ?? []).length;
}

/**
 * Die verbleibenden grossen Dateien - gemessen, nicht behauptet.
 *
 * Die vorige Fassung dieser Liste trug die Zeilenzahlen als Text. Das ist
 * derselbe Fehler, den diese Datei behebt, nur an anderer Stelle. Der Grund,
 * warum eine Datei bleibt, steht als Zuordnung im Skript - er ist eine
 * Entscheidung (ADR-0019), keine Messung.
 *
 * Hier steht NUR, was die Schwelle reisst (1 000 Zeilen, dieselbe wie im
 * Waechter). Kleinere Dateien gehoeren nicht in eine Tabelle, die "warum so
 * gross" heisst - sie sind nicht gross. Bis zum 25.10.2026 standen hier auch
 * `http.ts` (259), `app.js` (219) und `app-references.js` (597); die Tabelle
 * behauptete damit, es gehe um Grosse, und meinte in Wahrheit "Dateien, die
 * ich erklaeren wollte".
 *
 * Die Liste ist vollstaendig: `packages/engine/test/doku-konsistenz.test.ts`
 * laeuft selbst durch den Baum und meldet jede Datei ueber der Schwelle, die
 * hier fehlt. Sie war bis zum 25.10.2026 NICHT vollstaendig - der Waechter
 * las `engine/src` nicht rekursiv und sonst nur eine von Hand gepflegte
 * Auswahl, sodass fuenf Dateien (6 321 Zeilen) ohne Entscheidung dastanden.
 */
const BLEIBT = {
  "packages/engine/src/store.ts":
    "vier fachübergreifende Transaktionen (`applyRedesignPlan`, `duplicateSiteWithPlan`, `duplicateAssetRecords`, `commitFramerImportPlan`), `replaceTables` und die Fassade; 202 von 244 Methoden sind reine Delegaten (gemessen), der Rest steht in 38 `store-*`-Modulen",
  "packages/mcp/src/tools.ts":
    "die Werkzeug-Tabelle; ihre Reihenfolge ist der Vertrag (`server.ts` liest `TOOLS.map`), der Manifest-Generator folgt den `...X_TOOLS`-Spreizungen - ein weiterer Schnitt ist möglich und braucht den Manifest-Diff als Beweis",
  "packages/editor/src/inspector/inspector.ts":
    "eine Closure (`createInspector`), die DOM und Zustand gemeinsam hält. **Gemessen am 26.10.2026:** 22 Renderer, und nur EINER kommt ohne Fremdnamen aus (`renderSwitcher`, 24 Zeilen); alle anderen brauchen `commitProp`, ein Geschwister oder den Zustand. `renderFieldRow` allein nennt elf Fremdnamen (`breakpoint`, `tokenPanelKey`, `apply`, `commitProp`, `toggleVariant`, `removeVariant`, `clearProp`, `clearField`, `commitMotion`, `motionModel`) und zehn Geschwister-Renderer. Eine Fabrik, die elf Rückrufe durchreicht, ist keine Naht, sondern eine Verschiebung mit mehr Parametern: dieselbe Prüfung, mit der die Betriebsgruppe der Routen verworfen wurde",
  "packages/app/public/app-editor.js":
    "`mountCanvasView` haelt Canvas, Zustand und Ereignisse in einer Closure",
  "packages/engine/src/content.ts": "Sammlungen, Einträge und ihre Suche in einem Fachgebiet",
  "packages/engine/src/references-lifecycle.ts":
    "die Referenz-Pipeline: Analyse, Job-Lauf, Snapshot, Playwright-Aufnahme und Anwendung; der Capture-Treiber allein sind 250 Zeilen, und er teilt den Zustand mit dem Job-Lauf",
  "packages/engine/src/lifecycle.ts":
    "der Release-Lebenszyklus in einem Fachgebiet: Revision, Re-Bake, Veroeffentlichung, Preview und Review gehoeren zusammen, weil ein Release ohne die anderen drei nicht entsteht; ein Schnitt muesste die gemeinsame Transaktion teilen",
  "packages/engine/src/forms.ts": "Formulare, Einsendungen und der CSV-Export",
  "packages/engine/src/media.ts": "Assets, Ableitungen und Ordner",
  "packages/engine/src/types.ts": "die öffentlichen Typen der Engine; keine Logik",
  "packages/framer-import/src/capture-html.ts":
    "der HTML-Capture des Imports - **gemessen am 26.10.2026, und der Schnitt wurde versucht und verworfen.** Der CSS-Block am Dateiende (Z1940-2777, 838 Zeilen, 24 Funktionen) sieht wie ein eigenes Fachgebiet aus, ist aber keine Senke: `applyClassRules` ist die einzige öffentliche Funktion und liest den BAUM (`SPACED_TEXT`, `KEEPS_SPACES`, `FRAMER_TEXT_PROPS`, `IrInteraction`, `IrVisual`, `elementStyleToParts`) und neun interne Helfer (`parseCssRules`, `buildIndex`, `devicesOf`, `tokenDefinitionsOf`, `matchingRules`, `cascade`, `resolveVars`, `tokensOf`, `Vars`). Ein Modul mit 15 Importen aus der Quelldatei waere keine Naht, sondern eine Verschiebung. Die anderen 47 Funktionen lesen denselben Rohtext (HTML-Scan, Appear-Ableitung, IR-Bau)",
  "packages/framer-import/src/mapper.ts":
    "die Abbildung Framer nach NodeTree. **Gemessen am 26.10.2026:** 55 Funktionen, und `mapNode` allein sind 289 Zeilen. Sie liest dieselben Tabellen wie `mapDocument` und die Zustaende des Mappers - ein Schnitt muesste diese als Parameter durchreichen. Die 55. Funktion ist `attachMotionClasses` (26.10.2026): ein gemessener Wort-Effekt haengt an der Klasse seines `<span>`, und weil das Wort als Inline-Markup gerendert wird, muss die Klasse ins Markup - dort, wo der Mapper den Text schreibt",
  "packages/editor/src/canvas/canvas.ts": "die Bühne des Editors",
  "packages/editor/src/inspector/model.ts": "das Modell des Inspektors",
  "packages/editor/src/state/operations.ts":
    "die Editor-Operationen: ein Dispatcher (`applyEditorMutation`) und je eine Funktion pro Operation, dazu die gemeinsamen Pruefer fuer Katalog, Props, Styles und Motion. Die Pruefer teilen den Katalog und die Fehlerform - sie zu trennen hiesse, den Katalog zweimal zu lesen. Geteilt wird ueber `applyEditorMutation`, geprueft ueber `EditorStore` (`mutations.test.ts`, `history.test.ts`, `save-pipeline.test.ts`)",
  "packages/engine/src/mutations/apply.ts":
    "die Mutationen der Engine: ein Dispatcher (`applyOne`) und je eine Funktion pro Operation, dazu die Platzierungspruefer (`assertChildPlacement`, `assertSlotPlacement`, `assertSlotAllowedTypes`). Allen gemeinsam ist der `ApplierState`: der Dispatcher setzt `currentOpIndex`, die Faelle lesen ihn. Ein Schnitt muesste diesen Zustand teilen. Geprueft in `mutations.test.ts`, `transactions.test.ts`, `undo-batch.test.ts`",
  "packages/renderer/src/motion.ts":
    "die Motion-Auslieferung: `renderPageScript` und `renderIslandsScript` sind die beiden Laufzeit-Skripte, die als TEXT ausgeliefert werden - der groesste Teil der Datei steht in Template-Literalen, also in ausgeliefertem Code, nicht in Quellcode. Ein Schnitt wuerde zwei Skripte mit gemeinsamem Zustand (Lenis, GSAP, ScrollTrigger) auf zwei Dateien verteilen",
  "packages/renderer/src/bake.ts":
    "der Bake: `bakeSite` haelt Warnungen, Manifest-Seiten, Motion-/Lenis-/Formular-Flags, Island-Arten und benutzte Payload-Ids ueber alle Seiten - genau dieser geteilte Zustand ist der Grund, warum der Bake in einem Durchgang laeuft. Die Helfer (`stageTemplate`, `runAstroBuild`, `writeAeoFiles`, `assertBakeable`) sind bereits eigenstaendig",
  "packages/manifest/src/tools.ts":
    "ERZEUGT von `scripts/render-manifest.mjs` aus `packages/mcp/src/tools.ts` (`pnpm manifest:check` haelt es). Die Zeilenzahl ist keine Entscheidung, sondern die Folge von 109 Werkzeugen mit je vier Angaben",
};

/**
 * Der laufende Zuschnitt: Dateien UNTER der Schwelle, die bewusst noch weiter
 * geteilt werden. Getrennt von `BLEIBT`, weil die Frage eine andere ist -
 * dort "warum bleibt das so", hier "was passiert als naechstes".
 */
const ZUSCHNITT = {
  "packages/engine/src/http-routes-sites.ts":
    "9 Site-Routen; 1 205 → 270 Zeilen über zehn Schnitte. Der Zuschnitt ist an seiner fachlichen Grenze: der Betriebs-Block (Seiten, Audit, Releases, Bake-Jobs, Formulare, Benachrichtigungen, Redesign) wurde gemessen und VERWORFEN - 2 von 6 Importen wandern mit, das ist eine Sammelgruppe",
  "packages/app/public/app-references.js":
    "die Referenzen-Seite selbst; Karten, Huelle, Zustand und Inspektor sind bereits eigene Module (`app-refs-cards.js`, `app-refs-shell.js`, `app-refs-state.js`, `app-refs-inspector.js`). Was bleibt, ist die Seitenfunktion `referencesView` mit ihren fuenf Naehten",
};

// --- Der Bestand ------------------------------------------------------------
const storeDateien = readdirSync(SRC)
  .filter((n) => /^store-.*\.ts$/.test(n))
  .sort();
const httpDateien = readdirSync(SRC)
  .filter((n) => /^http-.*\.ts$/.test(n))
  .sort();
const appDateien = readdirSync(PUB)
  .filter((n) => /^app-.*\.js$/.test(n))
  .sort();
// Die Werkzeug-Module der MCP-Fassade (P3-2, Schritt 57). Sie standen bis
// dahin alle in `tools.ts`; die Uebersicht muss sie einzeln nennen, sonst
// sieht die Datei aus wie ein God-File, das sie nicht mehr ist.
const mcpDateien = readdirSync(MCP_SRC)
  .filter((n) => /^tools(-[\w-]+)?\.ts$/.test(n))
  .sort();

const repositories = storeDateien.filter((n) => klasse(join(SRC, n)) !== null);
const routenSumme = httpDateien.reduce((n, name) => n + routen(join(SRC, name)), 0);
const ohneKopf = [...storeDateien.map((n) => join(SRC, n)), ...httpDateien.map((n) => join(SRC, n)), ...appDateien.map((n) => join(PUB, n))].filter(
  (p) => kopf(p).length === 0,
);

const zeilen = [];
zeilen.push("# Die Fachmodule");
zeilen.push("");
zeilen.push("> **Erzeugt.** `pnpm module:render` schreibt diese Datei aus `packages/engine/src` und");
zeilen.push("> `packages/app/public`; `pnpm module:check` lässt den Lauf rot werden, wenn Dokument und");
zeilen.push("> Code auseinanderlaufen. Nicht von Hand editieren.");
zeilen.push(">");
zeilen.push("> Warum generiert: diese Übersicht stand bis zum 23.10.2026 als eine 7 046 Zeichen");
zeilen.push("> lange Zelle in `docs/current/stand.md` und wurde bei jedem Schritt von Hand nachgezogen.");
zeilen.push("> Zwei Routenzahlen waren falsch, vier Mapper-Module fehlten - und niemand sah es beim Lesen.");
zeilen.push("");
zeilen.push("## Engine: Store-Fachmodule");
zeilen.push("");
zeilen.push(`**${storeDateien.length} Dateien**, davon **${repositories.length}** mit eigener Repository-Klasse.`);
zeilen.push("");
zeilen.push("| Modul | Repository | Zeilen | Zweck | Test |");
zeilen.push("|---|---|---|---|---|");
for (const name of storeDateien) {
  const pfad = join(SRC, name);
  const k = klasse(pfad);
  zeilen.push(
    `| \`${name}\` | ${k === null ? "-" : `\`${k}\``} | ${zeilenZahl(pfad)} | ${zelle(zweck(pfad))} | ${testDatei(SRC, name, ".ts")} |`,
  );
}
zeilen.push("");
zeilen.push("## Engine: HTTP-Routen-Module");
zeilen.push("");
zeilen.push(`**${httpDateien.length} Dateien** mit zusammen **${routenSumme} Routen**.`);
zeilen.push("");
zeilen.push("| Modul | Routen | Zeilen | Zweck |");
zeilen.push("|---|---|---|---|");
for (const name of httpDateien) {
  const pfad = join(SRC, name);
  const n = routen(pfad);
  zeilen.push(`| \`${name}\` | ${n === 0 ? "-" : n} | ${zeilenZahl(pfad)} | ${zelle(zweck(pfad))} |`);
}
zeilen.push(`| **Summe** | **${routenSumme}** | | |`);
zeilen.push("");
zeilen.push("## Oberfläche: ES-Module");
zeilen.push("");
zeilen.push(`**${appDateien.length} Dateien.**`);
zeilen.push("");
zeilen.push("| Modul | Zeilen | Zweck |");
zeilen.push("|---|---|---|");
for (const name of appDateien) {
  const pfad = join(PUB, name);
  zeilen.push(`| \`${name}\` | ${zeilenZahl(pfad)} | ${zelle(zweck(pfad))} |`);
}
zeilen.push("");
zeilen.push("## MCP: Werkzeug-Module");
zeilen.push("");
zeilen.push(`**${mcpDateien.length} Dateien.** Die Werkzeuge lagen bis zum 23.10.2026 alle in \`tools.ts\`;`);
zeilen.push("die Uebersicht nennt sie einzeln, weil die Datei sonst wie ein God-File aussieht, das sie nicht mehr ist.");
zeilen.push("");
zeilen.push("| Modul | Werkzeuge | Zeilen | Zweck |");
zeilen.push("|---|---|---|---|");
let werkzeugeSumme = 0;
for (const name of mcpDateien) {
  const pfad = join(MCP_SRC, name);
  const text = readFileSync(pfad, "utf8");
  const n = (text.match(/^\s{4}name: "[a-z_]+",/gm) ?? []).length;
  werkzeugeSumme += n;
  zeilen.push(`| \`${name}\` | ${n === 0 ? "-" : n} | ${zeilenZahl(pfad)} | ${zelle(zweck(pfad))} |`);
}
zeilen.push(`| **Summe** | **${werkzeugeSumme}** | | |`);
zeilen.push("");
zeilen.push("## Die grossen Dateien und warum sie so gross sind");
zeilen.push("");
zeilen.push("Die Aufteilung folgt ADR-0019: `Store` und der HTTP-Dispatcher bleiben die Fassade, die");
zeilen.push("Fachmodule tragen die Tabellen. Diese Dateien reissen die Schwelle von 1 000 Zeilen; jede");
zeilen.push("Zeile hier nennt den Grund - eine Entscheidung, keine Messung. Die Zeilenzahl selbst wird");
zeilen.push("beim Erzeugen gemessen.");
zeilen.push("");
zeilen.push("`packages/engine/test/doku-konsistenz.test.ts` prueft die Vollstaendigkeit dieser Tabelle:");
zeilen.push("er laeuft selbst durch `packages` und meldet jede Datei ueber der Schwelle, die hier fehlt.");
zeilen.push("");
zeilen.push("| Datei | Zeilen | Warum sie so gross ist |");
zeilen.push("|---|---|---|");
const bleibtZeilen = Object.entries(BLEIBT)
  .map(([pfad, grund]) => ({ pfad, grund, n: existsSync(join(ROOT, pfad)) ? zeilenZahl(join(ROOT, pfad)) : -1 }))
  .sort((a, b) => b.n - a.n);
for (const { pfad, grund, n } of bleibtZeilen) {
  zeilen.push(`| \`${pfad}\` | ${n === -1 ? "?" : n} | ${zelle(grund)} |`);
}
zeilen.push("");
zeilen.push("## Der laufende Zuschnitt");
zeilen.push("");
zeilen.push("Dateien unter der Schwelle, die trotzdem weiter geteilt werden - hier steht, was als");
zeilen.push("Naechstes passiert, nicht warum etwas bleibt.");
zeilen.push("");
zeilen.push("| Datei | Zeilen | Stand |");
zeilen.push("|---|---|---|");
for (const [pfad, grund] of Object.entries(ZUSCHNITT)) {
  const n = existsSync(join(ROOT, pfad)) ? zeilenZahl(join(ROOT, pfad)) : -1;
  zeilen.push(`| \`${pfad}\` | ${n === -1 ? "?" : n} | ${zelle(grund)} |`);
}
if (ohneKopf.length > 0) {
  zeilen.push("");
  zeilen.push("## Module ohne Kopfkommentar");
  zeilen.push("");
  zeilen.push("Jedes Modul nennt in seiner ersten Kommentarzeile seinen Zweck. Diese hier nicht:");
  zeilen.push("");
  for (const p of ohneKopf) zeilen.push(`- \`${p.slice(ROOT.length + 1).replace(/\\/g, "/")}\``);
}

const markdown = zeilen.join("\n") + "\n";
const vorhanden = existsSync(ZIEL) ? readFileSync(ZIEL, "utf8") : "";

if (process.argv.includes("--check")) {
  const normalisieren = (text) => text.replace(/\r\n/g, "\n");
  if (normalisieren(vorhanden) === normalisieren(markdown)) {
    console.log(
      `module: unveraendert (${storeDateien.length} store, ${httpDateien.length} http, ${appDateien.length} app; ${routenSumme} Routen)`,
    );
    process.exit(0);
  }
  // Ein Tor, das nur "weicht ab" sagt, ist im CI-Log nutzlos: dort steht die
  // Datei nicht zur Hand, und der naechste Schritt ist Raten. Am 25.10.2026
  // war genau das der Fall - `module:check` war lokal gruen und in der CI rot,
  // und die Meldung nannte keine Zeile. Deshalb nennt sie jetzt die erste
  // abweichende Zeile und die Zahl der Abweichungen.
  const soll = normalisieren(markdown).split("\n");
  const ist = normalisieren(vorhanden).split("\n");
  const abweichend = [];
  for (let i = 0; i < Math.max(soll.length, ist.length) && abweichend.length < 5; i++) {
    if (soll[i] !== ist[i]) abweichend.push({ zeile: i + 1, soll: soll[i], ist: ist[i] });
  }
  console.error("module: docs/current/module.md weicht vom Generator ab.");
  console.error(`  Zeilen: Datei ${ist.length}, Generator ${soll.length}`);
  for (const a of abweichend) {
    console.error(`  Z${a.zeile}`);
    console.error(`    Datei    : ${JSON.stringify((a.ist ?? "<fehlt>").slice(0, 160))}`);
    console.error(`    Generator: ${JSON.stringify((a.soll ?? "<fehlt>").slice(0, 160))}`);
  }
  console.error("Neu erzeugen: pnpm module:render");
  process.exit(1);
}

writeFileSync(ZIEL, markdown.split("\n").join(vorhanden.includes("\r\n") ? "\r\n" : "\n"), "utf8");
console.log(
  `module: ${storeDateien.length} store, ${httpDateien.length} http, ${appDateien.length} app, ${routenSumme} Routen -> docs/current/module.md`,
);
if (ohneKopf.length > 0) console.log(`  ohne Kopfkommentar: ${ohneKopf.length}`);
