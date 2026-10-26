// Korrigiert die mapper.ts-Begruendung nach dem fremden Commit 7a5b838
// ("Animationen: der Abgriff am laufenden Browser ist gebaut").
//
// Der Commit hat `mapper.ts` um 190 Zeilen erweitert (+ drei Funktionen:
// `appearStyleRulesOf`, `ruleFamilyWeights` und die Anbindung an den
// Browser-Abgriff). Die Begruendung im Bericht und die Zahlen im Waechter
// stammen vom Stand davor.
//
// Gemessen am 26.10.2026 nach dem Commit:
//   mapper.ts   2 032 Zeilen (vorher 1 819), 57 Funktionen (vorher 54)
//   mapNode       336 Zeilen (vorher 289)
//   capture-html  2 726 Zeilen, 68 Funktionen  (unveraendert)
import { readFileSync, writeFileSync } from "node:fs";

// ---- 1. Der Generator (Begruendung) ----
const gen = "scripts/render-modules.mjs";
const g = readFileSync(gen, "utf8");
const altText =
  "die Abbildung Framer nach NodeTree. **Gemessen am 26.10.2026:** 54 Funktionen, und `mapNode` allein sind 289 Zeilen. Sie liest dieselben Tabellen wie `mapDocument` und die Zustaende des Mappers - ein Schnitt muesste diese als Parameter durchreichen";
const neuText =
  "die Abbildung Framer nach NodeTree. **Gemessen am 26.10.2026:** 57 Funktionen, und `mapNode` allein sind 336 Zeilen. Sie liest dieselben Tabellen wie `mapDocument` und die Zustaende des Mappers - ein Schnitt muesste diese als Parameter durchreichen. Die Datei ist am 26.10.2026 um 190 Zeilen gewachsen (Browser-Abgriff der Animationen, `appearStyleRulesOf` und `ruleFamilyWeights`): der Abgriff liefert die Daten, die Abbildung auf den NodeTree bleibt hier";

if (!g.includes(altText)) {
  console.error("Generator: Suchtext nicht gefunden");
  process.exit(1);
}
writeFileSync(gen, g.replace(altText, neuText), "utf8");
console.log("render-modules.mjs: mapper-Begruendung auf 57 / 336 / 2032 gebracht.");

// ---- 2. Der Waechter ----
const test = "packages/engine/test/doku-konsistenz.test.ts";
const t = readFileSync(test, "utf8");
const altTest = 'expect(funktionen(mapper), "mapper.ts hat eine andere Zahl Funktionen").toBe(54);';
const neuTest =
  '// 57 seit dem 26.10.2026: der fremde Commit 7a5b838 (Browser-Abgriff der\n' +
  "    // Animationen) hat drei Funktionen ergaenzt. Der Waechter hat es sofort\n" +
  "    // gemeldet - genau dafuer steht er hier. Der Bericht nennt dieselbe Zahl.\n" +
  '    expect(funktionen(mapper), "mapper.ts hat eine andere Zahl Funktionen").toBe(57);';
if (!t.includes(altTest)) {
  console.error("Test: Suchtext nicht gefunden");
  process.exit(1);
}
let t2 = t.replace(altTest, neuTest);
t2 = t2.replace(
  'expect(module).toContain("289 Zeilen");',
  '// `mapNode` ist mit der Datei gewachsen (289 -> 336).\n    expect(module).toContain("336 Zeilen");',
);
writeFileSync(test, t2, "utf8");
console.log("doku-konsistenz.test.ts: 54 -> 57, 289 -> 336.");
