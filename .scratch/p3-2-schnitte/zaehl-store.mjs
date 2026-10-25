// Zaehlt die Methoden von store.ts und wie viele davon reine Delegaten sind.
//
// Der Kommentar in `doku-konsistenz.test.ts` nennt "211 von 235 Delegaten" -
// eine Zahl, die seit dem 23.10.2026 nicht nachgezogen wurde. Eine Zahl in
// einem Kommentar ist eine Behauptung wie jede andere; wenn sie driftet,
// verliert der Kommentar seine Aufgabe (zu erklaeren, warum die Datei so
// gross sein darf).
//
// Gezaehlt wird: jede Methode auf Klassenebene (Zeile beginnt mit zwei
// Leerzeichen, dann optional `async`, dann ein Name, dann `(`). Delegat ist
// sie, wenn ihr Koerper ausschliesslich `return this.#x.y(...)` (ggf. mit
// `await`) ist - auch ueber mehrere Zeilen.
import { readFileSync } from "node:fs";

const datei = process.argv[2] ?? "packages/engine/src/store.ts";
const L = readFileSync(datei, "utf8").split(/\r?\n/);

const start = [];
for (let i = 0; i < L.length; i++) {
  if (/^ {2}(async )?[a-zA-Z#][a-zA-Z0-9_]*\s*\(/.test(L[i])) start.push(i);
}

const methoden = start.map((s, k) => {
  const grenze = k + 1 < start.length ? start[k + 1] : L.length;
  // Die Methode endet an der Zeile mit genau zwei Leerzeichen und `}`.
  let ende = s;
  for (let i = s; i < grenze; i++) {
    if (/^ {2}\}/.test(L[i])) { ende = i; break; }
    ende = i;
  }
  const koerper = L.slice(s + 1, ende).filter((z) => z.trim() !== "" && !z.trim().startsWith("//"));
  return { name: L[s].trim(), koerper, zeilen: ende - s + 1 };
});

const delegat = methoden.filter((m) => {
  if (m.koerper.length === 0) return false;
  // Ein Delegat hat genau eine Anweisung: return [await] this.#x.y(...);
  // Sie darf ueber mehrere Zeilen laufen.
  const text = m.koerper.join(" ").trim();
  return /^return (await )?this\.#[a-zA-Z0-9]+\.[a-zA-Z0-9_]+\(.*\);?$/.test(text);
});

console.log(`${datei}`);
console.log(`  Methoden:   ${methoden.length}`);
console.log(`  Delegaten:  ${delegat.length}`);
console.log(`  eigene:     ${methoden.length - delegat.length}`);
console.log("");
console.log("Die eigenen (nicht delegierten) Methoden:");
for (const m of methoden) {
  if (!delegat.includes(m)) console.log(`  Z${start[methoden.indexOf(m)] + 1}  ${m.zeilen}Z  ${m.name.slice(0, 70)}`);
}
