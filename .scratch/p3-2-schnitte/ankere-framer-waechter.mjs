// Macht den Framer-Waechter ankerbasiert statt zeilennummernabhaengig.
//
// Befund vom 26.10.2026: der Test prueft
//   expect(zeilen[1901], "der CSS-Block beginnt nicht mehr in Z1902")...
//   expect(zeilen[2626], "der CSS-Block endet nicht mehr in Z2627").toBe("}")
// Zwei fremde Commits (7a5b838, 539b533) haben die Datei um 32 Zeilen
// verschoben - der Block beginnt jetzt in Z1934. Die Begruendung ist richtig,
// nur ihre Verankerung war es nicht.
//
// Ein Waechter, der bei jeder fremden Aenderung rot wird, obwohl die Aussage
// stimmt, ist ein Wartungsgrund - und wird abgeschaltet. Er soll pruefen, ob
// der Block NOCH DA ist, nicht auf welcher Zeilennummer er liegt.
import { readFileSync, writeFileSync } from "node:fs";

const test = "packages/engine/test/doku-konsistenz.test.ts";
const gen = "scripts/render-modules.mjs";

// ---- 1. Der Test: Anker statt Zeilennummern ----
const t = readFileSync(test, "utf8");

const altTest =
  '    // Der CSS-Block: Z1902-2627 im Kommentar. Geprueft wird, dass er noch dort\n' +
  '    // liegt - verschiebt jemand die Datei, ist die Begruendung falsch.\n' +
  '    const zeilen = capture.split(/\\r?\\n/);\n' +
  '    expect(zeilen[1901], "der CSS-Block beginnt nicht mehr in Z1902").toContain("order` is the rule\'s position");\n' +
  '    expect(zeilen[2626], "der CSS-Block endet nicht mehr in Z2627").toBe("}");';

const neuTest =
  '    // Der CSS-Block wird ueber ANKER geprueft, nicht ueber Zeilennummern.\n' +
  '    //\n' +
  '    // Der erste Anlauf pruefte `zeilen[1901]` und `zeilen[2626]`. Zwei fremde\n' +
  '    // Commits (7a5b838, 539b533) haben die Datei um 32 Zeilen verschoben - der\n' +
  '    // Test wurde rot, obwohl die Aussage ("der Block ist da und hat 21\n' +
  '    // Funktionen") stimmte. Ein Waechter, der bei jeder fremden Aenderung rot\n' +
  '    // wird, wird abgeschaltet statt gelesen.\n' +
  '    const captureZeilen = capture.split(/\\r?\\n/);\n' +
  '    const start = captureZeilen.findIndex((z) => z.includes("order` is the rule\'s position"));\n' +
  '    expect(start, "der CSS-Block beginnt nicht mehr mit seinem Kommentar").toBeGreaterThan(0);\n' +
  '    const ende = captureZeilen.findIndex((z, i) => i > start && z.startsWith("function isLoopEntry("));\n' +
  '    expect(ende, "hinter dem CSS-Block fehlt `isLoopEntry`").toBeGreaterThan(start);\n' +
  '    const block = captureZeilen.slice(start, ende);\n' +
  '    // 21 Funktionen im Block - die Zahl, die die Begruendung nennt.\n' +
  '    const imBlock = block.filter((z) => /^(?:export )?(?:async )?function /.test(z)).length;\n' +
  '    expect(imBlock, "der CSS-Block hat eine andere Zahl Funktionen als die Begruendung nennt").toBe(21);';

if (!t.includes(altTest)) {
  console.error("Test: Anker-Block nicht gefunden");
  process.exit(1);
}
let t2 = t.replace(altTest, neuTest);
t2 = t2.replace(
  'expect(funktionen(capture), "capture-html.ts hat eine andere Zahl Funktionen").toBe(68);',
  '// 69 seit dem 26.10.2026: der Commit 539b533 ("Der Page Loader ist keine\n' +
  '    // Einblendung") hat eine Funktion ergaenzt.\n' +
  '    expect(funktionen(capture), "capture-html.ts hat eine andere Zahl Funktionen").toBe(69);',
);
writeFileSync(test, t2, "utf8");
console.log("Test: Anker statt Zeilennummern, 68 -> 69.");

// ---- 2. Der Generator: Zeilenangabe im Text entfernen ----
const g = readFileSync(gen, "utf8");
const altGen =
  "Der CSS-Block am Dateiende (Z1902-2627, 726 Zeilen, 21 Funktionen) sieht wie ein eigenes Fachgebiet aus";
const neuGen =
  "Der CSS-Block am Dateiende (21 Funktionen) sieht wie ein eigenes Fachgebiet aus";
if (!g.includes(altGen)) {
  console.error("Generator: Suchtext nicht gefunden");
  process.exit(1);
}
writeFileSync(gen, g.replace(altGen, neuGen), "utf8");
console.log("Generator: Zeilenangabe Z1902-2627 entfernt (sie wandert mit jedem Commit).");
