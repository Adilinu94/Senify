// Zeigt, was sich in `qualitaet.md` geaendert hat - normalisiert auf LF,
// damit Zeilenenden nicht als Aenderung zaehlen.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const arbeit = readFileSync("docs/current/qualitaet.md", "utf8").replace(/\r\n/g, "\n").split("\n");
const head = execFileSync("git", ["show", "HEAD:docs/current/qualitaet.md"], { encoding: "utf8" })
  .replace(/\r\n/g, "\n")
  .split("\n");

console.log(`Arbeitskopie: ${arbeit.length} Zeilen`);
console.log(`HEAD:         ${head.length} Zeilen`);
console.log("");

// Einfacher Zeilen-Diff: erstes abweichendes Paar, dann Kontext.
let gezeigt = 0;
for (let i = 0; i < Math.max(arbeit.length, head.length) && gezeigt < 15; i++) {
  if (arbeit[i] !== head[i]) {
    console.log(`Z${i + 1}`);
    console.log(`  HEAD  : ${JSON.stringify(head[i]?.slice(0, 150))}`);
    console.log(`  Arbeit: ${JSON.stringify(arbeit[i]?.slice(0, 150))}`);
    gezeigt++;
  }
}
if (gezeigt === 0) console.log("kein Unterschied nach Normalisierung");
