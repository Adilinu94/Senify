// Misst, welche lokalen Helfer ein Block aus `tools.ts` benutzt - und welche
// nur er benutzt.
//
// Der Grund: `tools.ts` ist keine flache Liste. Die Werkzeuge rufen lokale
// Helfer (`requireString`, `objectSchema`, `styleValue` …), und ein Schnitt,
// der einen Helfer mitnimmt, den 40 andere Werkzeuge brauchen, waere kein
// Schnitt, sondern eine Verschiebung.
import { readFileSync } from "node:fs";

const datei = "packages/mcp/src/tools.ts";
const L = readFileSync(datei, "utf8").split(/\r?\n/);

const von = Number(process.argv[2]);
const bis = Number(process.argv[3]);
if (!Number.isInteger(von) || !Number.isInteger(bis)) {
  console.error("Aufruf: node messe-helfer.mjs <von> <bis>");
  process.exit(1);
}

const block = L.slice(von - 1, bis).join("\n");
const rest = [...L.slice(0, von - 1), ...L.slice(bis)].join("\n");

// Lokale Funktionen/Konstanten auf oberster Ebene.
const namen = [];
for (const z of L) {
  const m = /^(?:function|const|type) ([a-zA-Z_][a-zA-Z0-9_]*)/.exec(z);
  if (m) namen.push(m[1]);
}

const imBlock = [];
const nurBlock = [];
const beiden = [];
for (const n of namen) {
  const re = new RegExp(`\\b${n}\\b`);
  const a = re.test(block);
  const b = re.test(rest);
  if (a && b) beiden.push(n);
  else if (a) nurBlock.push(n);
}

imBlock.push(...beiden, ...nurBlock);

console.log(`Block Z${von}-${bis}: ${bis - von + 1} Zeilen`);
console.log("");
console.log(`Nur im Block (wandert mit): ${nurBlock.length}`);
for (const n of nurBlock) console.log(`  ${n}`);
console.log("");
console.log(`Auch im Rest (bleibt, muss importiert werden): ${beiden.length}`);
console.log(`  ${beiden.join(", ")}`);
