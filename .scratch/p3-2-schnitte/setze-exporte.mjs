import { readFileSync, writeFileSync } from "node:fs";

// Setzt `export` vor die FUNKTIONSDEKLARATION - auch wenn die Signatur ueber
// mehrere Zeilen geht. Der erste Anlauf ersetzte nur die Zeile mit `function`
// und zerstoerte damit die Fortsetzung (`refsRenderCards(\n    gallery...`):
// die oeffnende Klammer fiel weg, die Parameterzeile stand ohne Kopf da.
// Deshalb wird nur das Wort `function` gesetzt, der Rest der Signatur bleibt.
//
// Aufruf: node setze-exporte.mjs <datei> <name> [name ...]
const [datei, ...namen] = process.argv.slice(2);
if (!datei || namen.length === 0) {
  console.error("Aufruf: node setze-exporte.mjs <datei> <name> [name ...]");
  process.exit(1);
}
const L = readFileSync(datei, "utf8").split(/\r?\n/);
const gesetzt = [];
for (let i = 0; i < L.length; i++) {
  const m = /^function (\w+)/.exec(L[i]);
  if (m && namen.includes(m[1])) {
    L[i] = L[i].replace(/^function /, "export function ");
    gesetzt.push(m[1]);
  }
}
writeFileSync(datei, L.join("\n"), "utf8");
const fehlend = namen.filter((n) => !gesetzt.includes(n));
console.log(`${datei}: ${gesetzt.length} Exporte gesetzt (${gesetzt.join(", ")})`);
if (fehlend.length > 0) console.log(`  nicht gefunden: ${fehlend.join(", ")}`);
