// Prueft die ECHTE Regex aus dem Test gegen die echten Ueberschriften.
// Ich hatte behauptet, sie treffe nur P3-2 - das muss belegt werden, nicht
// geglaubt.
import { readFileSync } from "node:fs";

const L = readFileSync("docs/fahrplan.md", "utf8").split(/\r?\n/);
const KOPF = /^### (P\d-\d+) .*?[-\u2013\u2014] (offen|geschlossen)\b/;

console.log("Regex aus dem Test: /^### (P\\d-\\d+) .*?[-\\u2013\\u2014] (offen|geschlossen)\\b/\n");
let treffer = 0;
for (const z of L) {
  if (!/^### P\d-\d+/.test(z)) continue;
  const m = KOPF.exec(z);
  treffer++;
  console.log(`${m ? "TRIFFT " : "daneben"} ${JSON.stringify(z.slice(0, 80))}`);
  if (m) console.log(`         -> id=${m[1]} status=${m[2]}`);
}
console.log(`\n${treffer} Ueberschriften geprueft.`);
