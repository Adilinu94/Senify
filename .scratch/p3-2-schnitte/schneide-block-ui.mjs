import { readFileSync, writeFileSync } from "node:fs";

// Schneidet einen Zeilenblock (Zeilenbezug, nicht Routenbezug) in ein eigenes
// ES-Modul und haengt am Ende die noetigen Exporte an. Fuer die Oberflaeche:
// dort sind die Grenzen Funktionen, nicht Tabellenzeilen.
//
// Aufruf: node schneide-block-ui.mjs <datei> <von> <bis> <ziel> <exportName>
const [, , datei, vonS, bisS, ziel, exportName] = process.argv;
const von = Number(vonS);
const bis = Number(bisS);
if (!datei || !Number.isInteger(von) || !Number.isInteger(bis) || !ziel) {
  console.error("Aufruf: node schneide-block-ui.mjs <datei> <von> <bis> <ziel>");
  process.exit(1);
}

const roh = readFileSync(datei, "utf8");
const L = roh.split(/\r?\n/);
const block = L.slice(von - 1, bis);

// --- Pruefung: Klammerbilanz und kein offener Block am Rand
let bilanz = 0;
for (const z of block) for (const c of z) {
  if (c === "{") bilanz++;
  else if (c === "}") bilanz--;
}
console.log(`Block Z${von}-${bis} (${block.length} Zeilen), Klammerbilanz ${bilanz}`);
if (bilanz !== 0) {
  console.error("Klammerbilanz ungleich 0 - der Schnitt ist falsch.");
  process.exit(1);
}
if (/^\s*$/.test(block[0]) || /^\s*$/.test(block[block.length - 1])) {
  console.error("Der Block beginnt oder endet mit einer Leerzeile.");
  process.exit(1);
}

// --- Welche exportierten Namen definiert der Block?
const definiert = [...block.join("\n").matchAll(/^(?:export )?(?:async )?function (\w+)/gm)].map((m) => m[1]);
console.log(`  definiert: ${definiert.join(", ") || "(nichts)"}`);

// --- Welche Namen aus der Quelldatei benutzt der Block?
const importZeilen = L.filter((z) => /^import /.test(z));
console.log(`  Importe der Quelldatei: ${importZeilen.length} Zeilen`);

writeFileSync(ziel, block.join("\n") + "\n", "utf8");
console.log(`  geschrieben: ${ziel}`);

const neu = [...L.slice(0, von - 1), ...L.slice(bis)];
// Die Leerzeile vor dem Schnitt bleibt einmal stehen.
while (neu.length > 1 && neu[von - 2] === "" && neu[von - 1] === "") neu.splice(von - 1, 1);
writeFileSync(datei, neu.join("\n"), "utf8");
console.log(`  ${datei}: ${L.length} -> ${neu.length} Zeilen`);

if (exportName) console.log(`  Exporte fuer die Quelldatei: ${exportName}`);
