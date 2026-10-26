// Schneidet die 23 Referenz-Werkzeuge aus `tools.ts` in ein eigenes Modul.
//
// Gemessen: der Block reicht von Z1543 (`{` vor `analyze_reference`) bis
// Z2487 (`},` nach `get_design_contract`). 945 Zeilen, 23 Werkzeuge.
// Danach folgt `set_design_contract` - das gehoert zum Design-Vertrag und
// BLEIBT in `tools.ts`.
//
// Ersetzt wird der Block durch `...REFERENZ_TOOLS,` an genau derselben
// Stelle. Die Reihenfolge in `TOOLS` ist der Vertrag (`server.ts` liest
// `TOOLS.map`), und der Manifest-Generator folgt den Spreizungen: eine
// Spreizung weiter unten wuerde die Reihenfolge aendern.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "packages/mcp/src/tools.ts";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const pruefe = (n, muss) => {
  if (!L[n - 1].includes(muss)) {
    console.error(`Z${n} enthaelt nicht "${muss}": ${JSON.stringify(L[n - 1])}`);
    process.exit(1);
  }
};
pruefe(1542, "...MEDIEN_TOOLS,");
pruefe(1543, "{");
pruefe(1544, 'name: "analyze_reference"');
pruefe(2487, "},");
pruefe(2488, "{");
pruefe(2489, 'name: "set_design_contract"');

// Der Block: Index 1542..2486 (Z1543..2487).
const block = L.slice(1542, 2487);
writeFileSync(".scratch/p3-2-schnitte/referenz-block.txt", block.join("\n"), "utf8");

// Ersetzen durch die Spreizung.
L.splice(1542, 2487 - 1543 + 1, "  ...REFERENZ_TOOLS,");
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`Block: ${block.length} Zeilen ausgeschnitten -> .scratch/p3-2-schnitte/referenz-block.txt`);
console.log(`tools.ts: jetzt ${L.length} Zeilen`);
console.log("");
console.log("Neue Nachbarschaft:");
for (let i = 1539; i < 1547; i++) console.log(`  ${i + 1}: ${L[i]?.slice(0, 90)}`);
