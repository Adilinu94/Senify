// Welche Helfer ruft ein Block aus `tools.ts` auf, und wo sind sie definiert?
//
// `tools.ts` importiert seine Helfer aus `tools-support.ts` und
// `tools-schemas.ts`; lokal definiert ist fast nichts. Dieses Skript zaehlt
// die AUFRUFE im Block und vergleicht sie mit dem Rest - so wird sichtbar,
// ob der Block eigenstaendig ist oder an einem gemeinsamen Helfer haengt.
import { readFileSync } from "node:fs";

const L = readFileSync("packages/mcp/src/tools.ts", "utf8").split(/\r?\n/);
const von = Number(process.argv[2]);
const bis = Number(process.argv[3]);
const block = L.slice(von - 1, bis).join("\n");
const rest = [...L.slice(0, von - 1), ...L.slice(bis)].join("\n");

// Alle Aufrufe `name(` im Block, ohne Sprachschluesselwoerter.
const aufrufe = new Set();
for (const m of block.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\(/g)) {
  const n = m[1];
  if (["if", "for", "while", "switch", "catch", "return", "typeof", "function", "async", "await", "new", "import", "require", "String", "Number", "Boolean", "Object", "Array", "JSON", "Math", "Promise", "Set", "Map"].includes(n)) continue;
  aufrufe.add(n);
}

console.log(`Block Z${von}-${bis}: ${bis - von + 1} Zeilen, ${aufrufe.size} verschiedene Aufrufe`);
console.log("");

const nurBlock = [];
const beiden = [];
for (const n of [...aufrufe].sort()) {
  if (new RegExp(`\\b${n}\\(`).test(rest)) beiden.push(n);
  else nurBlock.push(n);
}

console.log(`Nur im Block: ${nurBlock.length}`);
for (const n of nurBlock) console.log(`  ${n}`);
console.log("");
console.log(`Auch im Rest: ${beiden.length}`);
console.log(`  ${beiden.join(", ")}`);
