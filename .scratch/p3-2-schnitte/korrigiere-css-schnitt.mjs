// Korrigiert den Schnitt: `applyClassRules` bleibt in `capture-html.ts`.
//
// Der erste Anlauf hat sie mitgenommen, und `typecheck` hat sofort gezeigt,
// warum das falsch war: die Funktion liest `SPACED_TEXT`, `KEEPS_SPACES`,
// `FRAMER_TEXT_PROPS`, `IrInteraction` und `IrVisual` - also den ZUSTAND des
// Captures und die Typen des Baums. Sie wendet CSS auf den Baum an; das CSS
// selbst zu lesen ist eine andere Aufgabe.
//
// Das ist die Grenze: `capture-css.ts` beantwortet "welcher Wert gilt fuer
// diesen Selektor", `applyClassRules` beantwortet "was davon gilt fuer diesen
// Knoten". Die zweite Frage braucht den Baum.
//
// Vorgehen: die Funktion aus `capture-css.ts` herausschneiden und in
// `capture-html.ts` an ihrer alten Stelle wieder einsetzen.
import { readFileSync, writeFileSync } from "node:fs";

const cssPfad = "packages/framer-import/src/capture-css.ts";
const htmlPfad = "packages/framer-import/src/capture-html.ts";

const CSS = readFileSync(cssPfad, "utf8").split(/\r?\n/);
const HTML = readFileSync(htmlPfad, "utf8").split(/\r?\n/);

// --- 1. applyClassRules aus capture-css.ts herausschneiden ---
const start = CSS.findIndex((z) => z.startsWith("export function applyClassRules("));
if (start < 0) { console.error("applyClassRules nicht gefunden"); process.exit(1); }
// Ende: die naechste Top-Level-Deklaration.
let ende = start + 1;
while (ende < CSS.length && !/^(export )?(async )?(function|const|type) /.test(CSS[ende])) ende++;
// Die Leerzeilen davor/danach bereinigen.
let endeBereinigt = ende;
while (endeBereinigt > start && CSS[endeBereinigt - 1].trim() === "") endeBereinigt--;

const funktion = CSS.slice(start, endeBereinigt);
// Aus der Export-Fassung die interne Fassung machen.
funktion[0] = funktion[0].replace("export function ", "function ");

CSS.splice(start, endeBereinigt - start);
writeFileSync(cssPfad, CSS.join("\r\n"), "utf8");
console.log(`applyClassRules: ${funktion.length} Zeilen aus capture-css.ts entfernt.`);

// --- 2. In capture-html.ts wieder einsetzen ---
// An der Stelle, wo sie stand: direkt nach `readAllCss`.
const anker = HTML.findIndex((z) => z.startsWith("function readAllCss("));
if (anker < 0) { console.error("readAllCss nicht gefunden"); process.exit(1); }
let einfg = anker + 1;
while (einfg < HTML.length && HTML[einfg] !== "}") einfg++;
einfg++; // hinter die schliessende Klammer

HTML.splice(einfg, 0, "", ...funktion);
writeFileSync(htmlPfad, HTML.join("\r\n"), "utf8");
console.log(`applyClassRules: ${funktion.length} Zeilen in capture-html.ts eingesetzt (nach Z${einfg}).`);

// --- 3. Import in capture-html.ts anpassen ---
const text = readFileSync(htmlPfad, "utf8");
writeFileSync(
  htmlPfad,
  text.replace(
    'import { applyClassRules, fontFaceStyles, readLinkedCss, readTextPresets } from "./capture-css.ts";',
    'import { fontFaceStyles, readLinkedCss, readTextPresets } from "./capture-css.ts";',
  ),
  "utf8",
);
console.log("Import korrigiert: applyClassRules kommt wieder aus dieser Datei.");
