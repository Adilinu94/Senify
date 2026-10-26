// Entfernt den ALTEN R12-Absatz ("drei grosse Dateien") aus `stand.md`.
//
// Er steht nach der Konfliktaufloesung doppelt: einmal aus der HEAD-Seite
// (#137, unveraendert uebernommen) und einmal als meine Korrektur. Die alte
// Fassung ist genau die Aussage, die die vollstaendige Messung widerlegt hat -
// sie nennt eine Auswahl und handgepflegte Zahlen.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/current/stand.md";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

// Der alte Absatz beginnt mit "Danach verbleibt die Modulaufteilung von drei"
// und endet an der Leerzeile davor/danach.
const alt = L.findIndex((z) => z.startsWith("Danach verbleibt die Modulaufteilung von drei"));
if (alt < 0) {
  console.error("der alte Absatz steht nicht mehr da");
  process.exit(1);
}
const neu = L.findIndex((z) => z.startsWith("Danach verbleibt die Modulaufteilung (R12)"));
if (neu < 0) {
  console.error("der neue Absatz fehlt");
  process.exit(1);
}

// Der alte Absatz ist eine Zeile; die Leerzeile danach gehoert zu ihm.
const ende = alt + 1 < L.length && L[alt + 1] === "" ? alt + 1 : alt;
L.splice(alt, ende - alt + 1);
writeFileSync(pfad, L.join("\r\n"), "utf8");

const i = L.findIndex((z) => z.startsWith("Danach verbleibt die Modulaufteilung (R12)"));
console.log(`Alter Absatz entfernt (Zeile ${alt + 1}).`);
console.log(`Neuer Absatz steht jetzt in Zeile ${i + 1}.`);
console.log("");
console.log("Kontext:");
for (const z of L.slice(Math.max(0, i - 4), i + 5)) console.log(`  ${z.slice(0, 140)}`);
