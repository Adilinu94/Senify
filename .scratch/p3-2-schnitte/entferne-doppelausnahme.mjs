// Entfernt die zeilenweite "bericht"-Ausnahme aus der Probe - sie steht
// inzwischen positionsbezogen in der Schleife. Zwei Ausnahmen derselben
// Absicht sind eine zu viel: die zeilenweite macht R12 stumm.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = ".scratch/p3-2-schnitte/probe-regel.mjs";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const start = L.findIndex((z) => z.includes("Ausnahmen, die den Satz zu einem BERICHT"));
if (start < 0) throw new Error("Block nicht gefunden");
// Block reicht bis einschliesslich `if (bericht) continue;`
let ende = start;
while (ende < L.length && !L[ende].includes("if (bericht) continue;")) ende++;
if (ende >= L.length) throw new Error("Blockende nicht gefunden");

const entfernt = L.splice(start, ende - start + 1);
writeFileSync(pfad, L.join("\r\n"), "utf8");
console.log(`${entfernt.length} Zeilen entfernt.`);
console.log("");
console.log("Kontrolle:");
for (let i = Math.max(0, start - 3); i < start + 8; i++) console.log(`  ${L[i]}`);
