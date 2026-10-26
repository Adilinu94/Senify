// Sortiert die Arbeitsstand-Tabelle absteigend nach Datum - STABIL.
//
// Befund vom 26.10.2026: sechs Stellen standen falsch, alle aelter als meine
// Arbeit. Zwei Beispiele:
//   - Z679/680: 23.10. steht vor 24.10.
//   - Z760-770: der September/Oktober-Block steht teilweise aufsteigend
//     (29.09., 07.10., 09.10., 07.10., 08.10., 08.10., 09.10., 10.10.).
//
// Warum das zaehlt: die Ueberschrift heisst "Arbeitsstand". Wer den letzten
// Schritt sucht, liest von oben. Eine Tabelle, deren neueste Zeile in der Mitte
// steht, ist beim Nachschlagen wertlos - und sie behauptet eine Chronologie,
// die es nicht gibt.
//
// Sortiert wird STABIL: gleiche Tage behalten ihre Reihenfolge, weil "welcher
// Schritt kam zuerst" eine Aussage ist, die nur der Autor kennt.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/fahrplan.md";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const kopf = L.findIndex((z) => z.startsWith("## Arbeitsstand dieses Dokuments"));
const trenner = L.findIndex((z, i) => i > kopf && z.startsWith("|---"));
if (kopf < 0 || trenner < 0) {
  console.error("Tabellenkopf nicht gefunden");
  process.exit(1);
}

// Das Ende der Tabelle: die erste Leerzeile nach dem Trenner, an der keine
// Tabellenzeile mehr folgt.
let ende = trenner + 1;
while (ende < L.length && L[ende].startsWith("|")) ende++;

const zeilen = L.slice(trenner + 1, ende);
const ohneDatum = zeilen.filter((z) => !/^\| \d\d\.\d\d\.\d{4} \|/.test(z));
if (ohneDatum.length > 0) {
  console.error(`${ohneDatum.length} Zeilen ohne Datum - nicht sortierbar:`);
  for (const z of ohneDatum.slice(0, 3)) console.error(`  ${z.slice(0, 80)}`);
  process.exit(1);
}

const schluessel = (z) => {
  const m = /^\| (\d\d)\.(\d\d)\.(\d{4}) \|/.exec(z);
  return `${m[3]}-${m[2]}-${m[1]}`;
};

// STABIL sortieren: Array.prototype.sort ist in V8 stabil, aber wir machen es
// explizit, damit es nicht von der Engine abhaengt.
const indiziert = zeilen.map((z, i) => ({ z, i, k: schluessel(z) }));
indiziert.sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : a.i - b.i));
const sortiert = indiziert.map((x) => x.z);

const geaendert = sortiert.filter((z, i) => z !== zeilen[i]).length;
L.splice(trenner + 1, zeilen.length, ...sortiert);
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`Tabelle: ${zeilen.length} Zeilen, ${geaendert} an anderer Stelle.`);
console.log("");
console.log("Erste fuenf:");
for (const z of sortiert.slice(0, 5)) console.log(`  ${z.slice(0, 82)}`);
console.log("Letzte drei:");
for (const z of sortiert.slice(-3)) console.log(`  ${z.slice(0, 82)}`);
