// Verschiebt die vier 26.10.-Eintraege an den ANFANG der Arbeitsstand-Tabelle.
//
// Der Fehler: ich hatte sie vor den Schritt-67-Eintrag (25.10.) gesetzt. Damit
// stand die Tabelle in der Folge ... 25.10., 26.10., 25.10. ... - und der neue
// Waechter "haelt die Arbeitsstand-Tabelle in absteigender Datumsfolge" hat es
// gefunden. Die neueste Zeile gehoert direkt unter den Tabellenkopf.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/fahrplan.md";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

// Die vier Eintraege finden (sie beginnen mit "| 26.10.2026 | P3-2 Schritt 7").
const meine = [];
const rest = [];
for (const z of L) {
  if (/^\| 26\.10\.2026 \| P3-2 Schritt 7[01]/.test(z) || /^\| 26\.10\.2026 \| P3-2 Schritt 6[89]/.test(z)) {
    meine.push(z);
  } else {
    rest.push(z);
  }
}
if (meine.length !== 4) {
  console.error(`erwartet 4 Eintraege, gefunden ${meine.length}`);
  process.exit(1);
}

// Reihenfolge: 71, 70, 69, 68 (neueste zuerst).
meine.sort((a, b) => {
  const nr = (z) => Number(/P3-2 Schritt (\d+)/.exec(z)?.[1] ?? 0);
  return nr(b) - nr(a);
});

// Einfuegen direkt nach der Trennzeile der Tabelle.
const kopf = rest.findIndex((z) => z.startsWith("## Arbeitsstand dieses Dokuments"));
const trenner = rest.findIndex((z, i) => i > kopf && z.startsWith("|---"));
if (kopf < 0 || trenner < 0) {
  console.error("Tabellenkopf nicht gefunden");
  process.exit(1);
}
rest.splice(trenner + 1, 0, ...meine);
writeFileSync(pfad, rest.join("\r\n"), "utf8");

console.log(`Vier Eintraege nach Z${trenner + 1} (Trennzeile) eingefuegt.`);
console.log("");
for (let i = trenner; i <= trenner + 6; i++) console.log(`  ${i + 1}: ${rest[i].slice(0, 85)}`);
