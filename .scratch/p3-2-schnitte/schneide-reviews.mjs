// Schneidet Vorschauen (Route 7+8) und Reviews (Route 9+10) aus
// `http-routes-sites.ts`.
//
// Gemessen: Route 7 = Z220-245, Route 8 = Z247-262, Route 9 = Z264-291,
// Route 10 = Z293-317. Entfernt wird Z220..318 (die vier Routen plus die
// Trennleerzeile in Z318), damit zwischen Route 6 und Route 11 genau eine
// Leerzeile steht.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "packages/engine/src/http-routes-sites.ts";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const pruefe = (n, muss) => {
  if (!L[n - 1].includes(muss)) {
    console.error(`Z${n} enthaelt nicht "${muss}": ${JSON.stringify(L[n - 1])}`);
    process.exit(1);
  }
};
pruefe(220, "{");
pruefe(221, 'method: "POST"');
pruefe(222, '"previews"]');
pruefe(247, "{");
pruefe(248, 'method: "GET"');
pruefe(249, '"previews"]');
pruefe(264, "{");
pruefe(265, 'method: "POST"');
pruefe(266, '"reviews"]');
pruefe(293, "{");
pruefe(294, 'method: "GET"');
pruefe(295, '"reviews"]');
pruefe(317, "},");
pruefe(318, "");

const vorher = L.length;
L.splice(219, 318 - 220 + 1); // Z220..318 -> Index 219..317
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`Entfernt: Z220-318`);
console.log(`Datei: ${vorher} -> ${L.length} Zeilen`);
console.log("");
console.log("Neue Nachbarschaft:");
for (let i = 214; i < 222; i++) console.log(`  ${i + 1}: ${L[i]?.slice(0, 95)}`);
