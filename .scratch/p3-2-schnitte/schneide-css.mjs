// Schneidet das CSS-Fachmodul aus `capture-html.ts`.
//
// Gemessen: Z1902 (`type ParsedCssRule`) bis Z2627 (`}` von readTextPresets).
// Das sind 726 Zeilen und 20 Funktionen/Typen, die alle dasselbe tun: das
// Stylesheet der Quelle in Regeln zerlegen, Selektoren kompilieren, die
// Kaskade aufloesen, `var()` ersetzen und Text-Presets lesen.
//
// Was NICHT mitwandert und warum:
//   - `elementStyleToParts` (Z597) liest den INLINE-Style eines Elements; sie
//     gehoert zum HTML-Scan, nicht zum Stylesheet.
//   - `isLoopEntry` (Z2629) liest die Appear-Daten, nicht das CSS.
//   - `readAllCss` (Z1895) sammelt die Bloecke ein - sie wandert mit, weil sie
//     nur `readLinkedCss` ruft und sonst nichts tut.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "packages/framer-import/src/capture-html.ts";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const pruefe = (n, muss) => {
  if (!L[n - 1].includes(muss)) {
    console.error(`Z${n} enthaelt nicht "${muss}": ${JSON.stringify(L[n - 1])}`);
    process.exit(1);
  }
};
pruefe(1902, "order` is the rule's position");
pruefe(1904, "type ParsedCssRule");
pruefe(2627, "}");
pruefe(2629, "A loop entry in the appear JSON");

// Z1902..2627 -> Index 1901..2626.
const block = L.slice(1901, 2627);
writeFileSync(".scratch/p3-2-schnitte/css-block.txt", block.join("\n"), "utf8");

// Ersetzen durch nichts: die Funktionen werden importiert.
L.splice(1901, 2627 - 1902 + 1);
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`Block: ${block.length} Zeilen -> .scratch/p3-2-schnitte/css-block.txt`);
console.log(`capture-html.ts: jetzt ${L.length} Zeilen`);
console.log("");
console.log("Neue Nachbarschaft:");
for (let i = 1896; i < 1906; i++) console.log(`  ${i + 1}: ${L[i]?.slice(0, 90)}`);
