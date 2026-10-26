// Entfernt die beiden ueberzaehligen Tabellentrenner im Arbeitsstand und
// sortiert die Tabelle dann stabil nach Datum.
//
// Befund vom 26.10.2026: die Tabelle ist an zwei Stellen durch ein
// `|---|---|` unterbrochen (Z669, Z671). Markdown beendet die Tabelle dort und
// beginnt eine neue - die Zeilen dazwischen gehoeren zu keiner Tabelle mehr
// und die Chronologie ist zerrissen. Der Datums-Waechter hat es gefunden,
// weil er ueber die Trenner hinweg las.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/fahrplan.md";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const kopf = L.findIndex((z) => z.startsWith("## Arbeitsstand dieses Dokuments"));
if (kopf < 0) {
  console.error("Arbeitsstand nicht gefunden");
  process.exit(1);
}
// Das Ende des Abschnitts: die naechste Ueberschrift.
let abschnittEnde = L.length;
for (let i = kopf + 1; i < L.length; i++) {
  if (/^## /.test(L[i])) { abschnittEnde = i; break; }
}

// Ueberzaehlige Trenner entfernen: der ERSTE bleibt (er gehoert zum Kopf),
// alle weiteren fliegen raus.
const trenner = [];
for (let i = kopf; i < abschnittEnde; i++) {
  if (L[i].startsWith("|---")) trenner.push(i);
}
if (trenner.length <= 1) {
  console.log(`Nur ${trenner.length} Trenner - nichts zu tun.`);
} else {
  console.log(`Trenner an Z${trenner.map((i) => i + 1).join(", Z")} - entferne ${trenner.length - 1}.`);
  for (let k = trenner.length - 1; k >= 1; k--) L.splice(trenner[k], 1);
}

// Jetzt die Tabelle neu bestimmen und stabil sortieren.
const kopf2 = L.findIndex((z) => z.startsWith("## Arbeitsstand dieses Dokuments"));
const trenner2 = L.findIndex((z, i) => i > kopf2 && z.startsWith("|---"));
let ende = trenner2 + 1;
while (ende < L.length && L[ende].startsWith("|")) ende++;

const zeilen = L.slice(trenner2 + 1, ende);
const ohneDatum = zeilen.filter((z) => !/^\| \d\d\.\d\d\.\d{4} \|/.test(z));
console.log(`${zeilen.length} Tabellenzeilen, ${ohneDatum.length} ohne Datum.`);
for (const z of ohneDatum.slice(0, 3)) console.log(`  ohne Datum: ${z.slice(0, 80)}`);

const schluessel = (z) => {
  const m = /^\| (\d\d)\.(\d\d)\.(\d{4}) \|/.exec(z);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "0000-00-00";
};
const indiziert = zeilen.map((z, i) => ({ z, i, k: schluessel(z) }));
indiziert.sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : a.i - b.i));
const sortiert = indiziert.map((x) => x.z);

const geaendert = sortiert.filter((z, i) => z !== zeilen[i]).length;
L.splice(trenner2 + 1, zeilen.length, ...sortiert);
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`${geaendert} Zeilen an anderer Stelle.`);
console.log("");
console.log("Erste vier:");
for (const z of sortiert.slice(0, 4)) console.log(`  ${z.slice(0, 80)}`);
console.log("Letzte zwei:");
for (const z of sortiert.slice(-2)) console.log(`  ${z.slice(0, 80)}`);
