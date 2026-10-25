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
 */
const BLEIBT = {
  "packages/engine/src/store.ts":
    "vier fachübergreifende Transaktionen (`applyRedesignPlan`, `duplicateSiteWithPlan`, `duplicateAssetRecords`, `commitFramerImportPlan`), `replaceTables` und die Fassade; der Rest sind Delegaten",
  "packages/engine/src/http.ts": "Dispatcher und Routentabelle; fertig",
  "packages/app/public/app.js": "Router und Kommandoleiste; fertig",
  "packages/mcp/src/tools.ts":
    "die Werkzeug-Tabelle; ihre Reihenfolge ist der Vertrag (`server.ts` liest `TOOLS.map`), der Manifest-Generator folgt den `...X_TOOLS`-Spreizungen - ein weiterer Schnitt ist möglich und braucht den Manifest-Diff als Beweis",
  "packages/editor/src/inspector/inspector.ts":
    "eine Closure (`createInspector`), die DOM und Zustand gemeinsam hält",
  "packages/app/public/app-editor.js":
    "`mountCanvasView` haelt Canvas, Zustand und Ereignisse in einer Closure",
  "packages/app/public/app-references.js": "die Referenzen-Seite ohne die Karten; der Rest nach Schritt 59",
  "packages/engine/src/content.ts": "Sammlungen, Einträge und ihre Suche in einem Fachgebiet",
  "packages/engine/src/http-routes-sites.ts":
    "die verbleibenden 17 Site-Routen (Seiten, Vorschauen, Reviews, Redesign, Betrieb, Assets, Code-Payloads); der Zuschnitt läuft weiter, die nächste Gruppe ist Betrieb (Audit, Formulare, Benachrichtigungen)",
  "packages/engine/src/references-lifecycle.ts":
    "die Referenz-Pipeline: Analyse, Job-Lauf, Snapshot, Playwright-Aufnahme und Anwendung; der Capture-Treiber allein sind 250 Zeilen, und er teilt den Zustand mit dem Job-Lauf",
  "packages/engine/src/lifecycle.ts":
    "der Release-Lebenszyklus in einem Fachgebiet: Revision, Re-Bake, Veroeffentlichung, Preview und Review gehoeren zusammen, weil ein Release ohne die anderen drei nicht entsteht; ein Schnitt muesste die gemeinsame Transaktion teilen",
  "packages/engine/src/forms.ts": "Formulare, Einsendungen und der CSV-Export",
  "packages/engine/src/media.ts": "Assets, Ableitungen und Ordner",
  "packages/engine/src/types.ts": "die öffentlichen Typen der Engine; keine Logik",
  "packages/framer-import/src/capture-html.ts": "der HTML-Capture des Imports",
  "packages/framer-import/src/mapper.ts": "die Abbildung Framer nach NodeTree",
  "packages/editor/src/canvas/canvas.ts": "die Bühne des Editors",
  "packages/editor/src/inspector/model.ts": "das Modell des Inspektors",
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
zeilen.push("Fachmodule tragen die Tabellen. Diese Dateien reissen eine Zeilenschwelle; jede Zeile");
zeilen.push("hier nennt den Grund - eine Entscheidung, keine Messung. Die Zeilenzahl selbst wird");
zeilen.push("beim Erzeugen gemessen.");
zeilen.push("");
zeilen.push("| Datei | Zeilen | Warum sie so gross ist |");
zeilen.push("|---|---|---|");
const bleibtZeilen = Object.entries(BLEIBT)
  .map(([pfad, grund]) => ({ pfad, grund, n: existsSync(join(ROOT, pfad)) ? zeilenZahl(join(ROOT, pfad)) : -1 }))
  .sort((a, b) => b.n - a.n);
for (const { pfad, grund, n } of bleibtZeilen) {
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
  console.error(
    "module: docs/current/module.md weicht vom Generator ab.\n" + "Neu erzeugen: pnpm module:render",
  );
  process.exit(1);
}

writeFileSync(ZIEL, markdown.split("\n").join(vorhanden.includes("\r\n") ? "\r\n" : "\n"), "utf8");
console.log(
  `module: ${storeDateien.length} store, ${httpDateien.length} http, ${appDateien.length} app, ${routenSumme} Routen -> docs/current/module.md`,
);
if (ohneKopf.length > 0) console.log(`  ohne Kopfkommentar: ${ohneKopf.length}`);
