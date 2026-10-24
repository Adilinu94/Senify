import { readFileSync } from "node:fs";

// Zeigt die ungedeckten Zweige (Branches) einer Datei aus `coverage-final.json`.
// Der Befund vom 24.10.2026: `http-routes-theme.ts` stand nach dem Schnitt bei
// 65,38 % Branches, weil dieselben Routen vorher im Durchschnitt von
// `http-routes-sites.ts` (77,82 %) mitgetragen wurden. Ohne diese Liste waere
// "Schwelle senken" der naechstliegende - und falsche - Reflex.
const ziel = process.argv[2];
if (!ziel) {
  console.error("Aufruf: node zeig-zweige.mjs <pfad-teil>");
  process.exit(1);
}
const j = JSON.parse(readFileSync("coverage/coverage-final.json", "utf8"));

const dateien = Object.keys(j).filter((k) => k.replace(/\\/g, "/").includes(ziel));
if (dateien.length === 0) {
  console.error(`keine Datei zu "${ziel}" in coverage-final.json`);
  process.exit(1);
}

for (const datei of dateien) {
  const d = j[datei];
  const zeilen = readFileSync(datei, "utf8").split(/\r?\n/);
  console.log(`\n=== ${datei.replace(/\\/g, "/")} ===`);

  // b = { branchId: [hitCount je Pfad] }, branchMap = { branchId: {loc, locations} }
  const offen = [];
  for (const [id, treffer] of Object.entries(d.b)) {
    if (treffer.every((n) => n > 0)) continue;
    const map = d.branchMap[id];
    if (!map) continue;
    const loc = map.loc;
    const stelle = loc?.start?.line ?? "?";
    const code = zeilen[(stelle ?? 1) - 1]?.trim() ?? "";
    offen.push({ stelle, art: map.type, treffer, code });
  }
  offen.sort((a, b) => a.stelle - b.stelle);

  console.log(`${offen.length} ungedeckte Zweige:`);
  for (const o of offen) {
    console.log(`  Z${String(o.stelle).padStart(4)}  [${o.art}] ${JSON.stringify(o.treffer)}  ${o.code.slice(0, 100)}`);
  }
}
