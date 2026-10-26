// Misst, welche Closure-Variablen die Renderer in `inspector.ts` wirklich
// brauchen. Das entscheidet, ob eine Gruppe als Fabrik herausziehbar ist.
//
// Eine Closure ist keine Mauer: wenn ein Renderer nur `h`, `doc` und einen
// Commit-Rueckruf braucht, laesst er sich als Funktion mit Parametern
// schreiben. Wenn er `selectedId`, `state` und drei Geschwister-Renderer
// braucht, nicht.
import { readFileSync } from "node:fs";

const L = readFileSync("packages/editor/src/inspector/inspector.ts", "utf8").split(/\r?\n/);

// Die Renderer-Gruppe: Z461 (renderNumber) bis Z1130 (Ende renderDimensions
// / vor renderGaps). Genauer: alle `function render*` auf Ebene 2.
const starts = [];
for (let i = 0; i < L.length; i++) {
  if (/^  (async )?function render[a-zA-Z0-9_]*\(/.test(L[i])) starts.push(i);
}
const grenzen = starts.map((s, k) => (k + 1 < starts.length ? starts[k + 1] : L.length));

// Variablen der aeusseren Closure (Einrueckung 2, `const`/`let`).
const aussen = [];
for (const z of L) {
  const m = /^  (?:const|let) ([a-zA-Z_][a-zA-Z0-9_]*)/.exec(z);
  if (m) aussen.push(m[1]);
}

console.log(`${starts.length} Renderer, ${aussen.length} Closure-Variablen`);
console.log("");

const genutzt = new Map();
for (let k = 0; k < starts.length; k++) {
  const name = /function (render[a-zA-Z0-9_]*)/.exec(L[starts[k]])[1];
  const text = L.slice(starts[k], grenzen[k]).join("\n");
  const treffer = aussen.filter((v) => new RegExp(`\\b${v}\\b`).test(text));
  genutzt.set(name, treffer);
  console.log(`${name.padEnd(22)} ${String(grenzen[k] - starts[k]).padStart(4)}Z  ${treffer.join(", ") || "(nur Parameter)"}`);
}

// Welche Variablen braucht KEIN Renderer? Die sind frei.
const alleGenutzt = new Set([...genutzt.values()].flat());
const frei = aussen.filter((v) => !alleGenutzt.has(v));
console.log("");
console.log(`Closure-Variablen, die kein Renderer braucht: ${frei.length}`);
console.log(`  ${frei.join(", ")}`);
