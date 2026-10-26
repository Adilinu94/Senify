// Belegt, welcher der beiden behaupteten Defekte WIRKLICH vorliegt.
//
// Behauptung 1 (falsch): die Regex kenne nur den ASCII-Bindestrich.
//   Sie lautet /^### (P\d-\d+) .*?[-\u2013\u2014] (offen|geschlossen)\b/ -
//   sie kennt alle drei Striche und TRAF P3-7 vor der Aenderung.
//
// Behauptung 2 (richtig): `!l.includes("geschlossen")` liest das Wort
//   irgendwo in der Zeile. Punkt 15 enthaelt "bleibt offen" UND spaeter
//   "geschlossen" - und galt damit als erledigt.
//
// Zusatzbefund: die Regex kennt kein "teilweise geschlossen". Nach meiner
// Korrektur wuerde sie P3-7 also GAR NICHT mehr pruefen - ein neues Loch.
import { readFileSync } from "node:fs";

const L = readFileSync("docs/fahrplan.md", "utf8").split(/\r?\n/);

const ALT = /^### (P\d-\d+) .*?[-\u2013\u2014] (offen|geschlossen)\b/;
const mitPunkt = (i) => {
  const rumpf = [];
  for (let j = i + 1; j < L.length && !/^### /.test(L[j] ?? ""); j++) rumpf.push(L[j] ?? "");
  return rumpf.filter((l) => /^\| \d+b? \|/.test(l));
};

console.log("=== Was die alte Regex mit dem heutigen Stand macht ===");
for (let i = 0; i < L.length; i++) {
  if (!/^### P\d-\d+/.test(L[i] ?? "")) continue;
  const m = ALT.exec(L[i] ?? "");
  const punkte = mitPunkt(i);
  if (!m) {
    console.log(`  ${/^### (P\d-\d+)/.exec(L[i])[1]}: NICHT geprueft (Status paßt nicht ins Muster)`);
    continue;
  }
  const offen = punkte.filter((l) => !l.includes("geschlossen"));
  console.log(
    `  ${m[1]}: geprueft, Kopf="${m[2]}", ${punkte.length} Punkte, ${offen.length} ohne das Wort`,
  );
}

console.log("\n=== Punkt 15: beide Woerter in einer Zeile ===");
const p15 = L.find((z) => z.startsWith("| 15 |"));
console.log(`  enthaelt "bleibt offen":     ${/bleibt offen/.test(p15)}`);
console.log(`  enthaelt "geschlossen":      ${/geschlossen/.test(p15)}`);
console.log(`  -> gilt mit .includes() als: ${p15.includes("geschlossen") ? "GESCHLOSSEN (falsch)" : "offen"}`);
