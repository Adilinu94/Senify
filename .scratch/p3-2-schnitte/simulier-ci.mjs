// Simuliert den CI-Auscheck: `module.md` mit LF statt CRLF.
//
// Lokal ist `module:check` gruen, in CI rot. Die Datei ist lokal CRLF (Windows),
// in der CI LF (Linux). `--check` normalisiert zwar beide auf LF - aber nur die
// EINGECHECKTE Datei, nicht die erzeugte. Wenn der Generator irgendwo ein CR
// einfuegt, faellt das nur auf, wenn die Vorlage LF hat.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ZIEL = "docs/current/module.md";
copyFileSync(ZIEL, ".scratch/p3-2-schnitte/module.md.bak");

const roh = readFileSync(ZIEL, "utf8");
writeFileSync(ZIEL, roh.replace(/\r\n/g, "\n"), "utf8");
console.log("module.md auf LF umgestellt.");

let ausgabe = "";
let fehler = null;
try {
  ausgabe = execFileSync(process.execPath, ["scripts/render-modules.mjs", "--check"], {
    encoding: "utf8",
    stdio: "pipe",
  });
} catch (e) {
  fehler = e;
}
console.log("Ergebnis:", fehler === null ? "GRUEN" : "ROT");
if (fehler !== null) {
  console.log("stdout:", ausgabe.trim());
  console.log("stderr:", String(fehler.stderr ?? "").trim());
}

// Und jetzt das Gegenteil: erzeugen und dann die Bytes vergleichen.
if (fehler !== null) {
  console.log("");
  console.log("Diff der Zeilen:");
  const erzeugt = execFileSync(process.execPath, ["scripts/render-modules.mjs"], { encoding: "utf8" });
  const a = readFileSync(ZIEL, "utf8").split("\n");
  const b = roh.replace(/\r\n/g, "\n").split("\n");
  let n = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && n < 6; i++) {
    if (a[i] !== b[i]) {
      console.log(`  Z${i + 1}`);
      console.log(`    eingecheckt: ${JSON.stringify(b[i]?.slice(0, 110))}`);
      console.log(`    erzeugt    : ${JSON.stringify(a[i]?.slice(0, 110))}`);
      n++;
    }
  }
}

copyFileSync(".scratch/p3-2-schnitte/module.md.bak", ZIEL);
console.log("");
console.log("module.md wiederhergestellt.");
