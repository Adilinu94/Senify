// Prueft, welche Renderer WIRKLICH nur `doc` brauchen - also ohne Closure
// auskaemen. Das ist die Frage, die ueber den Schnitt entscheidet: eine
// "Fabrik", die sechs Rueckrufe durchreicht, ist keine Naht, sondern eine
// Verschiebung mit mehr Parametern.
import { readFileSync } from "node:fs";

const L = readFileSync("packages/editor/src/inspector/inspector.ts", "utf8").split(/\r?\n/);

// Alle `function render…(` auf Ebene 2 mit ihren Zeilenbereichen.
const starts = [];
for (let i = 0; i < L.length; i++) {
  if (/^  function render[a-zA-Z0-9_]*\(/.test(L[i])) starts.push(i);
}
const grenzen = starts.map((s, k) => (k + 1 < starts.length ? starts[k + 1] : L.length));

// Namen, die im File auf Ebene 2 definiert sind (die Closure).
const closure = new Set();
for (const z of L) {
  const m = /^  (?:const|let|function) ([a-zA-Z_][a-zA-Z0-9_]*)/.exec(z);
  if (m) closure.add(m[1]);
}

// Namen, die als IMPORTE hereinkommen.
const importe = new Set();
let imImport = false;
for (const z of L) {
  if (/^import \{/.test(z)) imImport = true;
  if (imImport) {
    for (const m of z.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)) {
      if (!["import", "from", "type"].includes(m[1])) importe.add(m[1]);
    }
  }
  if (imImport && /from "/.test(z)) imImport = false;
}

console.log("Renderer, die NUR an `doc` (und Importen) haengen:");
for (let k = 0; k < starts.length; k++) {
  const name = /function (render[a-zA-Z0-9_]*)/.exec(L[starts[k]])[1];
  const text = L.slice(starts[k], grenzen[k]).join("\n");
  // Welche Closure-Namen (ausser dem Renderer selbst) kommen vor?
  const fremd = [...closure].filter((n) => n !== name && new RegExp(`\\b${n}\\b`).test(text));
  // Welche davon sind wieder Renderer (also Geschwister)?
  const geschwister = fremd.filter((n) => n.startsWith("render"));
  const rest = fremd.filter((n) => !n.startsWith("render"));
  const marke = rest.length <= 1 ? "  <== NAH an eigenstaendig" : "";
  console.log(`${name.padEnd(20)} ${String(grenzen[k] - starts[k]).padStart(4)}Z  fremd: ${rest.join(", ") || "-"}${geschwister.length ? `  (Geschwister: ${geschwister.join(", ")})` : ""}${marke}`);
}
