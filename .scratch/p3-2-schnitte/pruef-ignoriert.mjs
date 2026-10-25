// Der Verdacht: in der CI ist `core.autocrlf=false` (Linux-Standard), lokal
// `true`. Der Generator schreibt die Zeilenenden der VORHANDENEN Datei nach.
// Bei `--check` wird nur die vorhandene Datei normalisiert - nicht der
// erzeugte Text.
//
// Wenn die CI eine LF-Datei hat und der Generator CRLF erzeugt (weil
// `vorhanden.includes("\r\n")` false ist, er also LF schreibt), dann muesste
// es passen. Der Fehler muss also woanders liegen.
//
// Dieses Skript prueft die eine Stelle, die ich noch nicht geprueft habe:
// ob eine Datei im Suchraum liegt, die in der CI NICHT existiert, lokal aber
// schon - und sei es eine, die `git status` nicht zeigt, weil sie ignoriert
// wird.
import { readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// `git status --ignored` zeigt, was da ist, aber nicht versioniert wird.
const ignoriert = execFileSync("git", ["status", "--ignored", "--porcelain", "packages"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((z) => z.startsWith("!!"));
console.log("Ignorierte Pfade unter packages:");
for (const z of ignoriert) console.log(`  ${z}`);

console.log("");
console.log("Quelldateien im Suchraum, die git NICHT kennt:");
const versioniert = new Set(
  execFileSync("git", ["ls-files", "packages"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean),
);

const lauf = (dir) => {
  const treffer = [];
  let eintraege;
  try {
    eintraege = readdirSync(dir);
  } catch {
    return treffer;
  }
  for (const n of eintraege) {
    if (n === "node_modules" || n === "dist" || n === ".tmp") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) treffer.push(...lauf(p));
    else if (/\.(ts|js)$/.test(n) && !/\.d\.ts$/.test(n)) treffer.push(p.replace(/\\/g, "/"));
  }
  return treffer;
};

for (const paket of readdirSync("packages")) {
  for (const teil of ["src", "public"]) {
    for (const p of lauf(join("packages", paket, teil))) {
      if (!versioniert.has(p)) console.log(`  ${p}`);
    }
  }
}
