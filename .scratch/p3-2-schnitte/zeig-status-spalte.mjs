// Wie druecken die Punkt-Tabellen ihren Status aus? Ohne das zu wissen, ist
// jede Regel geraten.
//
// Befund: die Tabelle hat die Spalten Nr. | Luecke | Ursache | Ansatz | Gate -
// es gibt KEINE Status-Spalte. Der Status steht im Anfang der dritten Zelle
// ("**geschlossen 21.10.2026**") oder als "**Eine Grenze der SSR-Quelle**".
import { readFileSync } from "node:fs";

const L = readFileSync("docs/fahrplan.md", "utf8").split(/\r?\n/);

// Abschnitte mit Punkt-Tabelle.
for (let i = 0; i < L.length; i++) {
  if (!/^### P\d-\d+/.test(L[i])) continue;
  const id = /^### (P\d-\d+)/.exec(L[i])[1];
  const rumpf = [];
  for (let j = i + 1; j < L.length && !/^### /.test(L[j]); j++) rumpf.push(L[j]);
  const punkte = rumpf.filter((l) => /^\| \d+b? \|/.test(l));
  if (punkte.length === 0) {
    console.log(`${id}: keine Punkt-Tabelle\n`);
    continue;
  }
  console.log(`===== ${id} (${punkte.length} Punkte) =====`);
  for (const p of punkte) {
    const zellen = p.split("|").map((c) => c.trim());
    // zellen[0] ist leer, [1] Nr, [2] Luecke, [3] Ursache
    const nr = zellen[1];
    const ursache = (zellen[3] ?? "").slice(0, 70);
    console.log(`  ${nr.padEnd(4)} ${ursache}`);
  }
  console.log("");
}
