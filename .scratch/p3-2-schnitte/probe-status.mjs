// Probe: Status aus dem ANFANG der dritten Zelle lesen - nicht irgendwo in
// der Zeile, und nicht mit einer Regex, die nur ASCII-Striche kennt.
//
// Zwei Defekte der alten Fassung, beide belegt:
//
//   1. /^### (P\d-\d+) .*?[---] (offen|geschlossen)\b/
//      Die Ueberschriften schreiben "·" (U+00B7) als Trenner und "—"
//      (U+2014) vor dem Status. `[---]` ist eine Zeichenklasse aus drei
//      Bindestrichen, trifft also nur P3-2. Gegenprobe: P3-1 auf "offen"
//      gesetzt -> Test blieb gruen.
//
//   2. `punkte.filter((l) => !l.includes("geschlossen"))`
//      P3-7 Punkt 15 sagt "`unifiersofjapan` bleibt offen bei 14,73 %" und
//      enthaelt spaeter das Wort "geschlossen" - gilt damit als erledigt.
//      Punkt 1 nennt "das X-Logo ist **geschlossen**", waehrend die Sterne
//      fehlen.
//
// Die neue Regel liest den Status dort, wo er steht: am Anfang der
// Ursachen-Zelle. "**geschlossen (21.10.2026)**" ist zu, alles andere nicht.
import { readFileSync } from "node:fs";

const L = readFileSync("docs/fahrplan.md", "utf8").split(/\r?\n/);

/** Ueberschrift: Trenner ist "·" oder "-", Status nach "—", "–" oder "-". */
const KOPF = /^### (P\d-\d+)\s*[·-]+\s*(.*?)\s*[—–-]{1,2}\s*(offen|geschlossen)\b/;

/**
 * Status einer Punktzeile: die dritte Zelle (Ursache) muss MIT "geschlossen"
 * beginnen. Steht dort "Eine Grenze ..." oder "gelöst", ist der Punkt nicht
 * geschlossen - "gelöst" beschreibt einen Teil, nicht den ganzen Punkt.
 */
function punktStatus(zeile) {
  const zellen = zeile.split("|").map((c) => c.trim());
  const ursache = zellen[3] ?? "";
  return /^\*\*geschlossen\b/.test(ursache) ? "zu" : "offen";
}

let abschnitte = 0;
const befund = [];
for (let i = 0; i < L.length; i++) {
  const m = KOPF.exec(L[i] ?? "");
  if (m === null) continue;
  const [, id, , kopfStatus] = m;
  const rumpf = [];
  for (let j = i + 1; j < L.length && !/^### /.test(L[j] ?? ""); j++) rumpf.push(L[j] ?? "");
  const punkte = rumpf.filter((l) => /^\| \d+b? \|/.test(l));

  abschnitte++;
  if (punkte.length === 0) {
    befund.push(`${id}: Kopf "${kopfStatus}", aber keine Punkt-Tabelle - Ueberschrift ist die einzige Quelle`);
    continue;
  }
  const offen = punkte.filter((p) => punktStatus(p) === "offen");
  const zeile = `${id}: Kopf "${kopfStatus}", ${punkte.length} Punkte, ${offen.length} offen`;
  befund.push(zeile);

  if (kopfStatus === "geschlossen" && offen.length > 0) {
    for (const o of offen) {
      const nr = o.split("|")[1].trim();
      befund.push(`   WIDERSPRUCH Punkt ${nr}: ${(o.split("|")[3] ?? "").trim().slice(0, 80)}`);
    }
  }
  if (kopfStatus === "offen" && offen.length === 0) {
    befund.push(`   WIDERSPRUCH: Kopf offen, aber alle ${punkte.length} Punkte sind zu`);
  }
}

console.log(befund.join("\n"));
console.log(`\n${abschnitte} Abschnitte erkannt (die alte Regex erkannte 1).`);
