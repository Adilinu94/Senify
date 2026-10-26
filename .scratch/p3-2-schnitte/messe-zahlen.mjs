// Sammelt ALLE Zahlbehauptungen der Form `datei` (N Zeilen) bzw. `datei` N Zeilen
// in den drei Register-Dokumenten und prueft sie gegen die Datei.
//
// Erst messen, dann eine Regel bauen: ein Waechter, der heute rot ist, weil
// hundert historische Notebook-Eintraege Zahlen tragen, wird abgeschaltet -
// und dann bewacht er nichts mehr.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOKUS = ["docs/fahrplan.md", "docs/current/stand.md", "docs/current/architektur.md"];

const SUCHORTE = [
  "packages/engine/src", "packages/engine/test",
  "packages/editor/src", "packages/editor/test",
  "packages/mcp/src", "packages/mcp/test",
  "packages/app/public", "packages/app/test",
  "packages/manifest/src", "packages/framer-import/src",
  "packages/framer-import/test", "packages/renderer/src",
  "packages/registry/src", "packages/widget-engine/src",
  "scripts", "",
];

const finde = (name) =>
  (name.includes("/") ? [join(ROOT, name)] : SUCHORTE.map((d) => join(ROOT, d, name)))
    .find((p) => existsSync(p)) ?? null;

const zeilenZahl = (p) => {
  const roh = readFileSync(p, "utf8");
  const n = roh.split(/\r?\n/).length;
  return roh.endsWith("\n") ? n - 1 : n;
};

// Wo endet der Live-Teil? Die Historientabelle ist Bericht, kein Versprechen.
const liveEnde = (L) => {
  const i = L.findIndex((z) => z.startsWith("## Arbeitsstand dieses Dokuments"));
  return i < 0 ? L.length : i;
};

const muster = [
  // `datei.ts` (2 662 Zeilen)
  { re: /`([\w./-]+\.(?:ts|js))`\s*\((\d[\d ]*)\s*Zeilen\)/g, art: "klammer" },
  // `datei.ts` 2 662 Zeilen   (nur wenn direkt danach kein "->" folgt)
  { re: /`([\w./-]+\.(?:ts|js))`\s+(\d[\d ]*)\s*Zeilen(?!\s*->)/g, art: "nackt" },
];

let geprueft = 0;
let falsch = 0;
for (const doku of DOKUS) {
  const L = readFileSync(join(ROOT, doku), "utf8").split(/\r?\n/);
  const ende = liveEnde(L);
  for (let i = 0; i < L.length; i++) {
    const imLive = i < ende;
    for (const { re, art } of muster) {
      re.lastIndex = 0;
      for (const m of L[i].matchAll(re)) {
        const pfad = finde(m[1]);
        const behauptet = Number(m[2].replace(/ /g, ""));
        if (pfad === null) {
          console.log(`${imLive ? "LIVE " : "hist "} FEHLT  ${doku}:${i + 1}  ${m[1]}`);
          geprueft++;
          falsch++;
          continue;
        }
        const ist = zeilenZahl(pfad);
        geprueft++;
        if (ist !== behauptet) {
          falsch++;
          console.log(`${imLive ? "LIVE " : "hist "} FALSCH ${doku}:${i + 1}  ${m[1]} behauptet ${behauptet}, ist ${ist}  [${art}]`);
        }
      }
    }
  }
}

console.log(`\n${geprueft} Zahlbehauptungen, davon ${falsch} falsch.`);
