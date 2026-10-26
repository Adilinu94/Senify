// Schneidet die beiden Asset-Routen aus `http-routes-sites.ts` heraus.
//
// Der Bereich ist gemessen, nicht geschaetzt:
//   `routenliste.mjs` sagt Route 11 = Z319-348, Route 12 = Z350-371.
//   Route 11 beginnt mit `  {` in Z319, Route 12 endet mit `  },` in Z371.
//   Die Leerzeile in Z372 trennt sie von Route 13 (Code-Payloads).
//
// Entfernt wird Z319..372 (beide Routen plus die Trennleerzeile danach),
// damit zwischen Route 10 und Route 13 genau eine Leerzeile steht.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "packages/engine/src/http-routes-sites.ts";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

// Selbstkontrolle: die Grenzen muessen genau das enthalten, was gemessen wurde.
const pruefe = (n, muss) => {
  if (!L[n - 1].includes(muss)) {
    console.error(`Z${n} enthaelt nicht "${muss}": ${JSON.stringify(L[n - 1])}`);
    process.exit(1);
  }
};
pruefe(319, "{");
pruefe(320, 'method: "POST"');
pruefe(321, '"assets", "upload-url"');
pruefe(350, "{");
pruefe(351, 'method: "GET"');
pruefe(352, '"assets"]');
pruefe(371, "},");
pruefe(372, "");

const vorher = L.length;
// Z319..372 = Index 318..371 (0-basiert), also 54 Zeilen.
const entfernt = L.splice(318, 372 - 319 + 1);
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`Entfernt: Z319-372 (${entfernt.length} Zeilen)`);
console.log(`Datei: ${vorher} -> ${L.length} Zeilen`);
console.log("");
console.log("Neue Nachbarschaft:");
for (let i = 315; i < 322; i++) console.log(`  ${i + 1}: ${L[i]?.slice(0, 90)}`);
