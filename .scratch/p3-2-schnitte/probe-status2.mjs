// Verfeinerung: drei Klassen, nicht zwei.
//
// Punkt 1 in P3-7 sagt "Eine Grenze der SSR-Quelle, keine Import-Luecke" und
// im Ansatz "beides ist eine Produktentscheidung". Das ist keine offene
// Arbeit, sondern eine bewusste Grenze - dieselbe Unterscheidung, die das
// Risiko-Register mit "offen / zu / grenze" trifft.
//
// Punkt 15 dagegen sagt "geloest" fuer last-studio und "bleibt offen" fuer
// unifiersofjapan. "Geloest" beschreibt einen Teil, nicht den Punkt.
import { readFileSync } from "node:fs";

const L = readFileSync("docs/fahrplan.md", "utf8").split(/\r?\n/);
const KOPF = /^### (P\d-\d+)\s*[·-]+\s*(.*?)\s*[—–-]{1,2}\s*(offen|geschlossen)\b/;

/** Drei Klassen: zu, grenze, offen. */
function punktStatus(zeile) {
  const zellen = zeile.split("|").map((c) => c.trim());
  const ursache = zellen[3] ?? "";
  if (/^\*\*geschlossen\b/.test(ursache)) return "zu";
  // Bewusste Grenze: die Ursache sagt, dass es keine Luecke IST.
  if (/keine Import-L(?:ü|ue)cke|Grenze der .*Quelle|Produktentscheidung/i.test(ursache)) return "grenze";
  return "offen";
}

for (let i = 0; i < L.length; i++) {
  const m = KOPF.exec(L[i] ?? "");
  if (m === null) continue;
  const [, id, , kopfStatus] = m;
  const rumpf = [];
  for (let j = i + 1; j < L.length && !/^### /.test(L[j] ?? ""); j++) rumpf.push(L[j] ?? "");
  const punkte = rumpf.filter((l) => /^\| \d+b? \|/.test(l));
  if (punkte.length === 0) continue;

  const nach = { zu: [], grenze: [], offen: [] };
  for (const p of punkte) {
    const nr = p.split("|")[1].trim();
    nach[punktStatus(p)].push(nr);
  }
  console.log(
    `${id}: Kopf "${kopfStatus}" | zu: ${nach.zu.length} | grenze: ${nach.grenze.length} | offen: ${nach.offen.length}` +
      (nach.offen.length > 0 ? `  -> offen: ${nach.offen.join(", ")}` : "") +
      (nach.grenze.length > 0 ? `  -> grenze: ${nach.grenze.join(", ")}` : ""),
  );
}
