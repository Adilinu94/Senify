import { readFileSync, writeFileSync } from "node:fs";

// Schneidet einen Block aus einer Route-Tabelle in ein eigenes Modul.
//
// Aufruf:
//   node schneide-route-block.mjs <quelldatei> <ziel> <vonRoute> <bisRoute> <exportName> <kopfdatei>
//
// `kopfdatei` ist eine Textdatei mit dem Modulkopf (Kommentar + Importe +
// optionaler Helfer). Sie steht getrennt, weil der Kopf Inhalt ist, nicht
// Mechanik - das Werkzeug soll ihn nicht erfinden.
//
// Vor dem Schreiben geprueft (nach drei Fehlversuchen bei Schritt 56):
//   1. Klammerbilanz des Blocks ist 0.
//   2. Der Block enthaelt keine Funktionsdeklaration auf Spalte 0.
//   3. Der Anker ist die Klammerzeile `  },` der letzten Route.
//   4. Ein Kommentar direkt ueber der ersten Route wandert mit.
const [, , quelle, ziel, vonS, bisS, exportName, kopfPfad] = process.argv;
const vonNr = Number(vonS);
const bisNr = Number(bisS);
if (!quelle || !ziel || !Number.isInteger(vonNr) || !Number.isInteger(bisNr) || !exportName) {
  console.error("Aufruf: node schneide-route-block.mjs <quelle> <ziel> <von> <bis> <exportName> [kopfdatei]");
  process.exit(1);
}

const roh = readFileSync(quelle, "utf8");
const hatCRLF = roh.includes("\r\n");
const L = roh.split(/\r?\n/);

const starts = [];
for (let i = 0; i < L.length; i++) if (/^ {2}\{$/.test(L[i])) starts.push(i);

const routen = starts.map((s, k) => {
  const grenze = k + 1 < starts.length ? starts[k + 1] : L.length;
  let ende = grenze - 1;
  while (ende > s && !/^ {2}\},?$/.test(L[ende])) ende--;
  return { nr: k + 1, start: s, ende };
});

const gewaehlt = routen.filter((r) => r.nr >= vonNr && r.nr <= bisNr);
if (gewaehlt.length !== bisNr - vonNr + 1) {
  console.error(`Erwartet ${bisNr - vonNr + 1} Routen, gefunden ${gewaehlt.length}`);
  process.exit(1);
}
const von = gewaehlt[0].start;
const bis = gewaehlt[gewaehlt.length - 1].ende;

let kopfKommentar = von;
while (kopfKommentar > 0 && /^ {2}\/\//.test(L[kopfKommentar - 1])) kopfKommentar--;

const block = L.slice(von, bis + 1);
let bilanz = 0;
for (const z of block) for (const c of z) {
  if (c === "{") bilanz++;
  else if (c === "}") bilanz--;
}
console.log(`Block Z${von + 1}-${bis + 1} (${block.length} Zeilen), Klammerbilanz ${bilanz}`);
if (bilanz !== 0) {
  console.error("Klammerbilanz ungleich 0 - der Schnitt ist falsch.");
  process.exit(1);
}
if (kopfKommentar < von) console.log(`  Kopfkommentar Z${kopfKommentar + 1}-${von} wandert mit`);

const verdacht = L.slice(kopfKommentar, bis + 1).filter((z) => /^(export )?(async )?function |^const \w+ = /.test(z));
if (verdacht.length > 0) {
  console.error("Der Block enthaelt eine Deklaration:", verdacht);
  process.exit(1);
}
if (!/^ {2}\},$/.test(L[bis])) {
  console.error(`Anker Z${bis + 1} ist nicht "  },": ${JSON.stringify(L[bis])}`);
  process.exit(1);
}

const kopf = kopfPfad ? readFileSync(kopfPfad, "utf8").split(/\r?\n/) : [];
const inhalt = [...kopf, `export const ${exportName}: Route[] = [`, ...L.slice(kopfKommentar, bis + 1), "];", ""];
writeFileSync(ziel, hatCRLF ? inhalt.join("\r\n") : inhalt.join("\n"), "utf8");

const neu = [...L.slice(0, kopfKommentar), ...L.slice(bis + 1)];
// Doppelte Leerzeile an der Naht zusammenziehen.
if (neu[kopfKommentar - 1] === "" && neu[kopfKommentar] === "") neu.splice(kopfKommentar, 1);
if (neu[kopfKommentar] === "" && neu[kopfKommentar + 1] === "") neu.splice(kopfKommentar + 1, 1);
writeFileSync(quelle, neu.join("\n"), "utf8");

console.log(`  geschrieben: ${ziel} (${inhalt.length} Zeilen)`);
console.log(`  ${quelle}: ${L.length} -> ${neu.length} Zeilen, ${routen.length - gewaehlt.length} Routen bleiben`);
