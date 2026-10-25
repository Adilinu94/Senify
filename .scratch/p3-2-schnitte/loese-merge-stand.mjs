// Loest den Merge-Konflikt in `docs/current/stand.md`.
//
// Beide Seiten sind berechtigt:
//   HEAD        : mein korrigierter R12-Absatz (keine handgepflegten Zahlen,
//                 Verweis auf `module.md`).
//   origin/master: der Branch-Bericht von #137 (was dort geschnitten wurde).
//
// Behalten werden der Branch-Bericht UND mein Absatz. Der alte Absatz
// ("drei grosse Dateien") faellt weg - er ist die Aussage, die die
// vollstaendige Messung widerlegt hat.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/current/stand.md";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const start = L.findIndex((z) => z.startsWith("<<<<<<<"));
const mitte = L.findIndex((z, i) => i > start && z.startsWith("======="));
const ende = L.findIndex((z, i) => i > mitte && z.startsWith(">>>>>>>"));
if (start < 0 || mitte < 0 || ende < 0) {
  console.error("Konfliktmarker unvollstaendig");
  process.exit(1);
}

const mein = L.slice(start + 1, mitte); // mein R12-Absatz (zwei Absaetze)
const master = L.slice(mitte + 1, ende); // Branch-Bericht + alter Absatz

// Aus der Master-Seite nur den Branch-Bericht nehmen: er endet an der
// Leerzeile vor "Danach verbleibt die Modulaufteilung von drei".
const berichtEnde = master.findIndex((z) => z.startsWith("Danach verbleibt die Modulaufteilung von drei"));
const bericht = berichtEnde < 0 ? master : master.slice(0, berichtEnde);

const neu = [...bericht.filter((z, i) => !(i === bericht.length - 1 && z === "")), "", ...mein];

L.splice(start, ende - start + 1, ...neu);
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`${start + 1}..${ende + 1} ersetzt (${neu.length} Zeilen).`);
console.log("");
for (const z of L.slice(start, start + neu.length + 1)) console.log(`  ${z.slice(0, 130)}`);
