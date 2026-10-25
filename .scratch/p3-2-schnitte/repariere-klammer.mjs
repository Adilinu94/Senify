// Repariert die Klammer nach dem vorigen Lauf: `store.ts` braucht sein
// schliessendes ")" vor dem Komma, das zur naechsten Datei fuehrt.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/current/stand.md";
const roh = readFileSync(pfad, "utf8");
const L = roh.split(/\r?\n/);
const i = L.findIndex((z) => z.startsWith("Danach verbleibt die Modulaufteilung"));
if (i < 0) {
  console.error("Absatz nicht gefunden");
  process.exit(1);
}

const alt = L[i];
const anker = "bleiben nach ADR-0019, `packages/mcp/src/tools.ts`";
const pos = alt.indexOf(anker);
if (pos < 0) {
  console.error("Anker nicht gefunden");
  process.exit(1);
}
L[i] = alt.slice(0, pos) + "bleiben nach ADR-0019), `packages/mcp/src/tools.ts`" + alt.slice(pos + anker.length);
writeFileSync(pfad, L.join("\r\n"), "utf8");

const z = L[i];
const auf = (z.match(/\(/g) ?? []).length;
const zu = (z.match(/\)/g) ?? []).length;
console.log(`Klammern: auf=${auf} zu=${zu} ${auf === zu ? "OK" : "Schief"}`);
console.log("");
console.log(z.slice(0, 430));
