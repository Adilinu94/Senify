// Misst, wie sich eine Datei auf ihre Exporte und Funktionen verteilt.
//
// Zweck: eine Begruendung wie "eine Closure" oder "ein Fachgebiet" ist eine
// Behauptung. Dieses Skript zeigt die groessten Funktionen und die Zeilen, die
// auf oberster Ebene stehen - damit man sehen kann, ob eine Datei WIRKLICH eine
// Sache tut oder nur so aussieht.
import { readFileSync } from "node:fs";

const pfad = process.argv[2];
if (!pfad) {
  console.error("Aufruf: node messe-datei.mjs <pfad>");
  process.exit(1);
}

const L = readFileSync(pfad, "utf8").split(/\r?\n/);

// Funktionen auf oberster Ebene: `function x(`, `export function x(`,
// `export async function x(`, `const x = (` / `const x = function` (grob).
const start = [];
for (let i = 0; i < L.length; i++) {
  if (/^(export )?(async )?function [a-zA-Z0-9_]+/.test(L[i])) start.push(i);
  else if (/^(export )?const [a-zA-Z0-9_]+ = (async )?(\(|function)/.test(L[i])) start.push(i);
}

const grenzen = start.map((s, k) => (k + 1 < start.length ? start[k + 1] : L.length));
const bloecke = start.map((s, k) => {
  const name = /^(?:export )?(?:async )?(?:function |const )([a-zA-Z0-9_]+)/.exec(L[s])?.[1] ?? "?";
  return { name, zeile: s + 1, n: grenzen[k] - s };
});

const gesamt = bloecke.reduce((a, b) => a + b.n, 0);
console.log(`${pfad}  (${L.length} Zeilen)`);
console.log(`  Funktionen auf oberster Ebene: ${bloecke.length}, zusammen ${gesamt} Zeilen`);
console.log(`  Rest (Importe, Typen, Konstanten, Kommentare): ${L.length - gesamt} Zeilen`);
console.log("");
console.log("Die groessten:");
for (const b of [...bloecke].sort((a, b) => b.n - a.n).slice(0, 12)) {
  console.log(`  Z${String(b.zeile).padStart(5)}  ${String(b.n).padStart(4)}Z  ${b.name}`);
}
