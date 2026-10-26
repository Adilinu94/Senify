// Baut `tools-referenzen.ts` aus dem ausgeschnittenen Block.
//
// Der Block stammt aus `tools.ts` und stand dort auf Einrueckungsebene 2
// (`    name: "…"`), weil er ein Element eines Arrays war. Im neuen Modul ist
// er der Inhalt von `export const REFERENZ_TOOLS = [ … ]` - dieselbe Ebene.
// Es muss also NICHTS verschoben werden; nur Kopf und Fuss kommen dazu.
//
// Die Importe werden aus den tatsaechlichen Aufrufen im Block abgeleitet,
// nicht geraten: `messe-aufrufe.mjs` hat sie gemessen.
import { readFileSync, writeFileSync } from "node:fs";

const block = readFileSync(".scratch/p3-2-schnitte/referenz-block.txt", "utf8").split(/\r?\n/);

// Fuehrende Leerzeilen weg.
while (block.length > 0 && block[0].trim() === "") block.shift();
while (block.length > 0 && block[block.length - 1].trim() === "") block.pop();

const kopf = `// Die dreiundzwanzig Referenz-Werkzeuge: Analysieren, Sammeln, Zuweisen,
// Profil bearbeiten, Design-Vertrag lesen, Dokumente.
//
// Der Zuschnitt aus \`tools.ts\` (Schritt 71). Der Block war zusammenhaengend:
// \`analyze_reference\` bis \`get_design_contract\`, 945 Zeilen.
// \`set_design_contract\` blieb dort - es gehoert zum Design-Vertrag, nicht zur
// Referenz-Sammlung.
//
// **Warum diese Gruppe.** Alle dreiundzwanzig teilen ein Fachgebiet: eine
// Referenz wird analysiert, in Sammlungen gelegt, zugewiesen, in Revisionen
// gefuehrt und ueber Briefings und Dokumente beschrieben. Sie definieren
// KEINEN lokalen Helfer (gemessen: 0 auf oberster Ebene); ihre 17 gemeinsamen
// Aufrufe (\`objectSchema\`, \`requireString\`, \`optionalString\`,
// \`SenifyError\` …) stehen in \`tools-support.ts\` und \`tools-schemas.ts\`.
//
// **Die Reihenfolge bleibt Vertrag.** \`server.ts\` gibt \`TOOLS.map(...)\` an
// den Client, und der Manifest-Generator folgt den Spreizungen. Deshalb
// ersetzt \`...REFERENZ_TOOLS,\` in \`tools.ts\` den Block an GENAU derselben
// Stelle - zwischen den Medien-Werkzeugen und \`set_design_contract\`.

import type { ToolDefinition } from "./types.ts";
import {
  objectSchema,
  optionalBoolean,
  optionalNullableString,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireArray,
  requireRecord,
  requireString,
  tokenName,
} from "./tools-support.ts";

export const REFERENZ_TOOLS: ToolDefinition[] = [`;

const text = [kopf, ...block, "];", ""].join("\n");
writeFileSync("packages/mcp/src/tools-referenzen.ts", text, "utf8");

console.log(`tools-referenzen.ts: ${text.split("\n").length} Zeilen`);
console.log(`Block: ${block.length} Zeilen`);
console.log("");
console.log("Erste Zeilen:");
for (const z of block.slice(0, 4)) console.log(`  ${z}`);
console.log("Letzte Zeilen:");
for (const z of block.slice(-3)) console.log(`  ${z}`);
