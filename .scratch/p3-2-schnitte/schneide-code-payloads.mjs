// Schneidet die beiden Code-Payload-Routen aus `http-routes-sites.ts`.
//
// Gemessen: Route 7 = Z208-223, Route 8 = Z225-236. Entfernt wird Z208..237
// (beide Routen plus die Trennleerzeile in Z237).
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "packages/engine/src/http-routes-sites.ts";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);

const pruefe = (n, muss) => {
  if (!L[n - 1].includes(muss)) {
    console.error(`Z${n} enthaelt nicht "${muss}": ${JSON.stringify(L[n - 1])}`);
    process.exit(1);
  }
};
pruefe(208, "{");
pruefe(209, 'method: "POST"');
pruefe(210, '"code-payloads"]');
pruefe(225, "{");
pruefe(226, 'method: "GET"');
pruefe(227, '"code-payloads"]');
pruefe(236, "},");
pruefe(237, "");

const vorher = L.length;
L.splice(207, 237 - 208 + 1); // Z208..237 -> Index 207..236
writeFileSync(pfad, L.join("\r\n"), "utf8");

console.log(`Entfernt: Z208-237`);
console.log(`Datei: ${vorher} -> ${L.length} Zeilen`);
console.log("");
console.log("Neue Nachbarschaft:");
for (let i = 202; i < 210; i++) console.log(`  ${i + 1}: ${L[i]?.slice(0, 95)}`);
