// Misst GENAU, welche Namen der Control-Block (Z461-854) aus der Closure
// braucht. Erst wenn diese Liste kurz und stabil ist, ist der Schnitt sicher.
import { readFileSync } from "node:fs";

const L = readFileSync("packages/editor/src/inspector/inspector.ts", "utf8").split(/\r?\n/);
const block = L.slice(460, 854).join("\n"); // Z461..Z854

// Alle Bezeichner im Block, die KEINE lokalen Variablen sind.
// Grob: alle Aufrufe `name(` und alle freien Referenzen auf Closure-Namen.
const lokal = new Set();
for (const m of block.matchAll(/^\s{2,4}(?:const|let|function) ([a-zA-Z_][a-zA-Z0-9_]*)/gm)) lokal.add(m[1]);
for (const m of block.matchAll(/\(([a-zA-Z_][a-zA-Z0-9_,\s:?\[\]<>|]*)\)\s*(?::\s*[^{]+)?\{/g)) {
  for (const p of m[1].split(",")) {
    const n = p.trim().split(/[:\s]/)[0];
    if (n) lokal.add(n);
  }
}
for (const m of block.matchAll(/^\s{4,6}const ([a-zA-Z_][a-zA-Z0-9_]*)/gm)) lokal.add(m[1]);

// Kandidaten: Bezeichner, die im ganzen File auf Ebene 2 als const/let/function
// definiert sind (die Closure) und im Block vorkommen.
const closure = [];
for (const z of L) {
  const m = /^  (?:const|let|function) ([a-zA-Z_][a-zA-Z0-9_]*)/.exec(z);
  if (m) closure.push(m[1]);
}

const gebraucht = closure.filter((n) => new RegExp(`\\b${n}\\b`).test(block));
console.log(`Control-Block Z461-854: ${block.split("\n").length} Zeilen`);
console.log(`Closure-Namen, die er braucht: ${gebraucht.length}`);
for (const n of gebraucht) console.log(`  ${n}`);
