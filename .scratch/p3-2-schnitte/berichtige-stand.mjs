// Ersetzt in `docs/current/stand.md` den Absatz ueber die drei grossen
// Dateien. Indexbasiert statt per Textvergleich: der Absatz traegt Umlaute
// (gross, fachuebergreifend), und ein Vergleich ueber die ganze Zeile scheitert
// an der Kodierung. Die Anker sind reines ASCII.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/current/stand.md";
const roh = readFileSync(pfad, "utf8");
const L = roh.split(/\r?\n/);

const zeileNr = L.findIndex((z) => z.startsWith("Danach verbleibt die Modulaufteilung"));
if (zeileNr < 0) {
  console.error("Absatz nicht gefunden");
  process.exit(1);
}

const alt = L[zeileNr];
// `store.ts` steht am Anfang, der Rest der Aufzaehlung folgt. Der Teil, der
// ersetzt wird, reicht bis zum Komma vor der naechsten Datei.
const anfang = alt.indexOf("`store.ts` (");
const ende = alt.indexOf("), `packages/mcp/src/tools.ts`");
if (anfang < 0 || ende < 0 || ende < anfang) {
  console.error(`Anker nicht gefunden (anfang=${anfang}, ende=${ende})`);
  process.exit(1);
}

const storeTeil =
  "`store.ts` (**inhaltlich fertig** \u2014 202 von 244 Methoden sind Delegaten, " +
  "gemessen und durch `doku-konsistenz.test.ts` festgehalten; die vier " +
  "fach\u00fcbergreifenden Transaktionen und `replaceTables` bleiben nach ADR-0019";

// Das schliessende ")" steht im Anker, also bis `ende + 1` ersetzen.
const neu = alt.slice(0, anfang) + storeTeil + alt.slice(ende + 1);

// Und den Routen-Zuschnitt ergaenzen, direkt vor dem R8-Satz.
const r8 = neu.indexOf(" R8 (MCP-Vertr");
if (r8 < 0) {
  console.error("R8-Anker nicht gefunden");
  process.exit(1);
}
const routenSatz =
  " Dazu l\u00e4uft der Zuschnitt der Routen-Tabelle (`http-routes-sites.ts`: " +
  "1 205 \u2192 461 Zeilen \u00fcber sieben Schnitte; der Bestand steht in " +
  "`docs/current/module.md`).";

L[zeileNr] = neu.slice(0, r8) + routenSatz + neu.slice(r8);
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log("alt :", alt.length, "Zeichen");
console.log("neu :", L[zeileNr].length, "Zeichen");
console.log("");
console.log(L[zeileNr].slice(0, 460));
