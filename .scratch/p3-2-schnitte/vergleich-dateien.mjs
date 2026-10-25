// Vergleicht, welche Dateien der Generator AUFZAEHLT mit dem, was git kennt.
//
// Der Generator filtert nach Namen (`^store-.*\.ts$` usw.). Liegt lokal eine
// Datei, die nicht versioniert ist, zaehlt er sie mit - die CI hat sie nicht,
// und `--check` wird dort rot, obwohl lokal alles gruen ist.
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const gruppen = [
  { dir: "packages/engine/src", re: /^store-.*\.ts$/, filter: /^(store)-/ },
  { dir: "packages/engine/src", re: /^http-.*\.ts$/, filter: /^(http)-/ },
  { dir: "packages/app/public", re: /^app-.*\.js$/, filter: /^(app)-/ },
  { dir: "packages/mcp/src", re: /^tools(-[\w-]+)?\.ts$/, filter: /^(tools)/ },
];

for (const g of gruppen) {
  const aufPlatte = readdirSync(g.dir).filter((n) => g.re.test(n)).sort();
  const inGit = new Set(
    execFileSync("git", ["ls-files", g.dir], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean)
      .map((p) => p.slice(p.lastIndexOf("/") + 1)),
  );
  const nurLokal = aufPlatte.filter((n) => !inGit.has(n));
  const nurGit = [...inGit].filter((n) => g.re.test(n) && !aufPlatte.includes(n));
  console.log(`${g.dir}  (${aufPlatte.length} auf Platte)`);
  if (nurLokal.length > 0) console.log(`  NUR LOKAL: ${nurLokal.join(", ")}`);
  if (nurGit.length > 0) console.log(`  NUR GIT:   ${nurGit.join(", ")}`);
  if (nurLokal.length === 0 && nurGit.length === 0) console.log("  deckungsgleich");
}
