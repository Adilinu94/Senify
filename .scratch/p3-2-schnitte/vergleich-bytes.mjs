// Vergleicht die eingecheckte `module.md` (git-Objekt) mit der Arbeitskopie
// byteweise. Zusaetzlich: das, was der Generator JETZT erzeugen wuerde.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const head = execFileSync("git", ["show", "HEAD:docs/current/module.md"], { encoding: "buffer" });
const arbeit = readFileSync("docs/current/module.md");

console.log(`HEAD:        ${head.length} Bytes`);
console.log(`Arbeitskopie: ${arbeit.length} Bytes`);
console.log(`gleich:      ${Buffer.compare(head, arbeit) === 0}`);

// Jetzt erzeugen und vergleichen.
copyFileSync("docs/current/module.md", ".scratch/p3-2-schnitte/arbeit.bak");
execFileSync(process.execPath, ["scripts/render-modules.mjs"], { encoding: "utf8" });
const erzeugt = readFileSync("docs/current/module.md");
console.log(`erzeugt:     ${erzeugt.length} Bytes`);
console.log(`== HEAD:     ${Buffer.compare(head, erzeugt) === 0}`);

if (Buffer.compare(head, erzeugt) !== 0) {
  const a = head.toString("utf8").split("\n");
  const b = erzeugt.toString("utf8").split("\n");
  console.log("");
  console.log("Erste Abweichungen:");
  let n = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && n < 8; i++) {
    if (a[i] !== b[i]) {
      console.log(`  Z${i + 1}`);
      console.log(`    HEAD  : ${JSON.stringify(a[i]?.slice(0, 120))}`);
      console.log(`    erzeugt: ${JSON.stringify(b[i]?.slice(0, 120))}`);
      n++;
    }
  }
}

copyFileSync(".scratch/p3-2-schnitte/arbeit.bak", "docs/current/module.md");
