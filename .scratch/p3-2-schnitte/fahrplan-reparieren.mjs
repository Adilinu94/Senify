// Repariert die Arbeitsstand-Tabelle vollstaendig.
//
// Befund vom 26.10.2026, drei Defekte:
//   1. Eine LEERZEILE mitten in der Tabelle (Z664). Markdown beendet dort die
//      Tabelle; alle folgenden Zeilen standen ausserhalb.
//   2. Zwei ueberzaehlige Trenner (Z669, Z671) - dieselbe Wirkung.
//   3. Die Datumsfolge war an sechs Stellen nicht absteigend.
//
// Alle drei haben dieselbe Folge: die Tabelle behauptet eine Chronologie, die
// sie nicht hat. Der neue Waechter liest ueber die Grenzen hinweg und hat es
// gefunden.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/fahrplan.md";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const kopf = L.findIndex((z) => z.startsWith("## Arbeitsstand dieses Dokuments"));
if (kopf < 0) { console.error("Arbeitsstand nicht gefunden"); process.exit(1); }
const trenner = L.findIndex((z, i) => i > kopf && z.startsWith("|---"));
if (trenner < 0) { console.error("Trennzeile nicht gefunden"); process.exit(1); }

// Das Ende des Abschnitts: die naechste Ueberschrift.
let abschnittEnde = L.length;
for (let i = trenner + 1; i < L.length; i++) {
  if (/^## /.test(L[i])) { abschnittEnde = i; break; }
}

// Alle Zeilen zwischen Trenner und Abschnittsende einsammeln: Tabellenzeilen
// und (zu entfernende) Leerzeilen/Trenner.
const koerper = L.slice(trenner + 1, abschnittEnde);
const zeilen = koerper.filter((z) => /^\| \d\d\.\d\d\.\d{4} \|/.test(z));
const verworfen = koerper.length - zeilen.length;

console.log(`Koerper: ${koerper.length} Zeilen, davon ${zeilen.length} Tabellenzeilen, ${verworfen} Leerzeilen/Trenner.`);

// Stabil absteigend sortieren.
const schluessel = (z) => {
  const m = /^\| (\d\d)\.(\d\d)\.(\d{4}) \|/.exec(z);
  return `${m[3]}-${m[2]}-${m[1]}`;
};
const indiziert = zeilen.map((z, i) => ({ z, i, k: schluessel(z) }));
indiziert.sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : a.i - b.i));
const sortiert = indiziert.map((x) => x.z);

const verschoben = sortiert.filter((z, i) => z !== zeilen[i]).length;
L.splice(trenner + 1, koerper.length, ...sortiert, "");
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`${verschoben} Zeilen an anderer Stelle, ${verworfen} Zeilen entfernt.`);
console.log("");
console.log(`Tabelle: ${sortiert.length} Eintraege, von ${schluessel(sortiert[0])} bis ${schluessel(sortiert[sortiert.length - 1])}.`);
