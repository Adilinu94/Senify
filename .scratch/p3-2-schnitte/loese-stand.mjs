// Loest den Rebase-Konflikt in `docs/current/stand.md`.
//
// Beide Seiten sind berechtigt:
//   HEAD (von #137): der Bericht, was DIESER Branch geschnitten hat.
//   Mein Commit    : der korrigierte R12-Absatz, der keine handgepflegten
//                    Zahlen mehr traegt und auf `module.md` verweist.
//
// Die alte Fassung meines Absatzes ("drei grosse Dateien") faellt weg - sie
// ist genau die Aussage, die die vollstaendige Messung widerlegt hat.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/current/stand.md";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const start = L.findIndex((z) => z.startsWith("<<<<<<<"));
if (start < 0) {
  console.error("kein Konflikt gefunden");
  process.exit(1);
}
const mitte = L.findIndex((z, i) => i > start && z.startsWith("======="));
const ende = L.findIndex((z, i) => i > mitte && z.startsWith(">>>>>>>"));
if (mitte < 0 || ende < 0) {
  console.error("Konfliktmarker unvollstaendig");
  process.exit(1);
}

const head = L.slice(start + 1, mitte); // der Branch-Bericht von #137
const mein = L.slice(mitte + 1, ende); // mein korrigierter Absatz

// Der Branch-Bericht endet mit einer Leerzeile; mein Absatz beginnt mit
// "Danach verbleibt ...". Beides bleibt, getrennt durch eine Leerzeile.
const neu = [...head.filter((z, i) => !(i === head.length - 1 && z === "")), "", ...mein];

L.splice(start, ende - start + 1, ...neu);
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`${start + 1}..${ende + 1} ersetzt.`);
console.log("");
console.log("Ergebnis:");
for (const z of neu) console.log(`  ${z.slice(0, 150)}`);
