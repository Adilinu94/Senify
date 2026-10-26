// Ersetzt den CSS-Block im Test per INDEX statt per Textvergleich - der
// Vergleich scheiterte an den Anfuehrungszeichen und Umlauten im Block.
import { readFileSync, writeFileSync } from "node:fs";

const test = "packages/engine/test/doku-konsistenz.test.ts";
const gen = "scripts/render-modules.mjs";

// ---- 1. Test: 68 -> 69 ----
const T = readFileSync(test, "utf8").split(/\r?\n/);
const i68 = T.findIndex((z) => z.includes('funktionen(capture), "capture-html.ts hat eine andere Zahl Funktionen").toBe(68)'));
if (i68 < 0) throw new Error("68-Zeile nicht gefunden");
T[i68] = T[i68].replace(".toBe(68);", ".toBe(69);");
// Kommentar davor einfuegen.
T.splice(
  i68,
  0,
  "    // 69 seit dem 26.10.2026: der Commit 539b533 (\"Der Page Loader ist keine",
  "    // Einblendung\") hat eine Funktion ergaenzt.",
);
console.log(`Test: capture-html 68 -> 69 (Z${i68 + 1}).`);

// ---- 2. Test: CSS-Block ankerbasiert ----
// Der Block beginnt bei der Zeile mit "Der CSS-Block: Z1902-2627 im Kommentar."
// und endet bei der Zeile mit 'zeilen[2626]'.
const a = T.findIndex((z) => z.includes("Der CSS-Block: Z1902-2627 im Kommentar"));
if (a < 0) throw new Error("CSS-Block-Kommentar nicht gefunden");
const b = T.findIndex((z, k) => k > a && z.includes("zeilen[2626]"));
if (b < 0) throw new Error("CSS-Block-Ende nicht gefunden");
console.log(`Test: CSS-Block Z${a + 1}..Z${b + 1} wird ersetzt.`);

const neu = [
  "    // Der CSS-Block wird ueber ANKER geprueft, nicht ueber Zeilennummern.",
  "    //",
  "    // Der erste Anlauf pruefte `zeilen[1901]` und `zeilen[2626]`. Zwei fremde",
  "    // Commits (7a5b838, 539b533) haben die Datei um 32 Zeilen verschoben - der",
  "    // Test wurde rot, obwohl die Aussage (\"der Block ist da und hat 21",
  "    // Funktionen\") stimmte. Ein Waechter, der bei jeder fremden Aenderung rot",
  "    // wird, wird abgeschaltet statt gelesen.",
  '    const captureZeilen = capture.split(/\\r?\\n/);',
  '    const start = captureZeilen.findIndex((z) => z.includes("order` is the rule"));',
  '    expect(start, "der CSS-Block beginnt nicht mehr mit seinem Kommentar").toBeGreaterThan(0);',
  '    const ende = captureZeilen.findIndex((z, i) => i > start && z.startsWith("function isLoopEntry("));',
  '    expect(ende, "hinter dem CSS-Block fehlt `isLoopEntry`").toBeGreaterThan(start);',
  "    const block = captureZeilen.slice(start, ende);",
  '    const imBlock = block.filter((z) => /^(?:export )?(?:async )?function /.test(z)).length;',
  '    expect(imBlock, "der CSS-Block hat eine andere Zahl Funktionen als die Begruendung nennt").toBe(21);',
];
T.splice(a, b - a + 1, ...neu);
writeFileSync(test, T.join("\r\n"), "utf8");
console.log(`Test: ${neu.length} Zeilen eingesetzt.`);

// ---- 3. Generator: Zeilenangabe entfernen ----
const G = readFileSync(gen, "utf8");
const neuG = G.replace("Der CSS-Block am Dateiende (Z1902-2627, 726 Zeilen, 21 Funktionen)", "Der CSS-Block am Dateiende (21 Funktionen)");
if (neuG === G) {
  console.log("Generator: Zeilenangabe stand nicht mehr da (oder anders formuliert) - pruefen.");
} else {
  writeFileSync(gen, neuG, "utf8");
  console.log("Generator: Zeilenangabe Z1902-2627 entfernt.");
}
