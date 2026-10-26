// Misst, welche Namen ein Block aus `capture-html.ts` von aussen braucht.
import { readFileSync } from "node:fs";

const L = readFileSync("packages/framer-import/src/capture-html.ts", "utf8").split(/\r?\n/);
const von = Number(process.argv[2]);
const bis = Number(process.argv[3]);
const block = L.slice(von - 1, bis).join("\n");

// Alle Funktionen/Typen/Konstanten auf oberster Ebene.
const namen = [];
for (const z of L) {
  const m = /^(?:export )?(?:async )?(?:function|const|type|interface) ([a-zA-Z_][a-zA-Z0-9_]*)/.exec(z);
  if (m) namen.push(m[1]);
}

// Welche davon definiert der Block selbst?
const imBlock = new Set();
for (let i = von - 1; i < bis; i++) {
  const m = /^(?:export )?(?:async )?(?:function|const|type|interface) ([a-zA-Z_][a-zA-Z0-9_]*)/.exec(L[i]);
  if (m) imBlock.add(m[1]);
}

// Welche fremden Namen kommen im Block vor?
const fremd = namen.filter((n) => !imBlock.has(n) && new RegExp(`\\b${n}\\b`).test(block));
console.log(`Block Z${von}-${bis}: ${bis - von + 1} Zeilen, ${imBlock.size} eigene Namen`);
console.log(`Fremde Namen (${fremd.length}):`);
for (const n of fremd) console.log(`  ${n}`);

// Importe, die der Block braucht.
const importe = [];
for (let i = 0; i < Math.min(120, L.length); i++) {
  if (/^import /.test(L[i])) importe.push(L[i]);
  if (/^\} from "/.test(L[i])) importe.push(L[i]);
}
console.log("");
console.log("Import-Zeilen im Kopf:");
for (const z of importe) console.log(`  ${z}`);
