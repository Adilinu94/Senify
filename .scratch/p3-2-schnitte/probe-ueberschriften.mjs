// Probe mit korrigierter Ueberschriften-Regex.
//
// Befund: `doku-konsistenz.test.ts` prueft
//   /^### (P\d-\d+) .*?[---] (offen|geschlossen)\b/
// Die Ueberschriften im Fahrplan schreiben aber "·" (U+00B7) als Trenner und
// "—" (U+2014) vor dem Status. `[---]` ist eine Zeichenklasse aus "-", "-",
// "-" - also nur der ASCII-Bindestrich. Damit trifft die Regel NUR P3-2 (die
// einzige Ueberschrift mit ASCII-Strichen) und ist fuer alle anderen blind.
//
// Diese Probe zeigt, was bei korrekter Regex herauskommt.
import { readFileSync } from "node:fs";

const fahrplan = readFileSync("docs/fahrplan.md", "utf8").split(/\r?\n/);

// Trenner: "·", "-" oder "--"; Statuswort nach einem Gedankenstrich, einem
// Bindestrich oder direkt.
const KOPF = /^### (P\d-\d+)\s*[·-]+\s*(.+?)\s*(?:—|–|-{1,2})\s*(offen|geschlossen)\b/;

let abschnitte = 0;
const abweichend = [];
for (let i = 0; i < fahrplan.length; i++) {
  const m = KOPF.exec(fahrplan[i] ?? "");
  if (m === null) continue;
  abschnitte++;
  const [, id, titel, status] = m;
  const rumpf = [];
  for (let j = i + 1; j < fahrplan.length && !/^### /.test(fahrplan[j] ?? ""); j++) rumpf.push(fahrplan[j] ?? "");
  const punkte = rumpf.filter((l) => /^\| \d+b? \|/.test(l));
  if (punkte.length === 0) {
    console.log(`${id.padEnd(6)} KEINE Punkt-Tabelle - Ueberschrift ist die einzige Quelle: "${status}"`);
    continue;
  }
  const offen = punkte.filter((l) => !l.includes("geschlossen"));
  console.log(
    `${id.padEnd(6)} Kopf="${status.padEnd(12)}" ${punkte.length} Punkte, ${offen.length} ohne "geschlossen"` +
      (status === "geschlossen" && offen.length > 0 ? "   <== WIDERSPRUCH" : ""),
  );
  if (status === "geschlossen" && offen.length > 0) {
    for (const o of offen) abweichend.push(`${id}: ${o.slice(0, 110)}`);
  }
  if (status === "offen" && offen.length === 0) {
    abweichend.push(`${id}: Kopf "offen", aber alle ${punkte.length} Punkte geschlossen`);
  }
}

console.log(`\n${abschnitte} Abschnitte erkannt (die alte Regex erkannte 1).`);
console.log(`${abweichend.length} Widersprueche:`);
for (const a of abweichend) console.log(`  ${a}`);
