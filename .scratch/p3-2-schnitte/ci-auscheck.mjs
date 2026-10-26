// Reproduziert den CI-Auscheck exakt: `git archive HEAD` in ein leeres
// Verzeichnis, dann dort `render-modules.mjs --check`.
//
// Lokal ist der Check gruen. Wenn er hier rot ist, liegt es am Unterschied
// zwischen Arbeitskopie und Auscheck - nicht am Inhalt.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const ziel = join(process.env.TEMP ?? "/tmp", "senify-ci-check");
rmSync(ziel, { recursive: true, force: true });
mkdirSync(ziel, { recursive: true });

// `git archive` gibt ein tar auf stdout - ohne tar auf Windows zu brauchen,
// nehmen wir `git worktree add --detach`, das ist ein echter Auscheck.
execFileSync("git", ["worktree", "add", "--detach", ziel, "HEAD"], { stdio: "pipe" });
console.log(`Auscheck nach ${ziel}`);

const modul = join(ziel, "docs/current/module.md");
const roh = readFileSync(modul, "utf8");
console.log(`Zeilenenden im Auscheck: CRLF=${(roh.match(/\r\n/g) ?? []).length}, LF=${(roh.match(/(?<!\r)\n/g) ?? []).length}`);

let fehler = null;
try {
  execFileSync(process.execPath, ["scripts/render-modules.mjs", "--check"], { cwd: ziel, stdio: "pipe" });
} catch (e) {
  fehler = e;
}
console.log("module:check im Auscheck:", fehler === null ? "GRUEN" : "ROT");

if (fehler !== null) {
  console.log("");
  console.log("Jetzt erzeugen und vergleichen:");
  execFileSync(process.execPath, ["scripts/render-modules.mjs"], { cwd: ziel, stdio: "pipe" });
  const neu = readFileSync(modul, "utf8");
  const a = roh.replace(/\r\n/g, "\n").split("\n");
  const b = neu.replace(/\r\n/g, "\n").split("\n");
  let n = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && n < 10; i++) {
    if (a[i] !== b[i]) {
      console.log(`  Z${i + 1}`);
      console.log(`    eingecheckt: ${JSON.stringify(a[i]?.slice(0, 130))}`);
      console.log(`    erzeugt    : ${JSON.stringify(b[i]?.slice(0, 130))}`);
      n++;
    }
  }
}

execFileSync("git", ["worktree", "remove", "--force", ziel], { stdio: "pipe" });
execFileSync("git", ["worktree", "prune"], { stdio: "pipe" });
console.log("");
console.log("Worktree wieder entfernt.");
