// Probe fuer die geplante Waechter-Regel, bevor sie in den Test wandert.
//
// Regel 1: Jeder Verweis `datei:zeile` in einer RISIKO-Zeile muss in eine
//          existierende Datei zeigen und die Zeile muss darin liegen.
//          (Beleg: R6 zeigte auf http.ts:531-541 - die Datei hat 275 Zeilen.)
//
// Regel 2: Jede Zeilenzahl in einer RISIKO-Zeile muss zur Datei passen.
//            "`x.ts` 1 671 Zeilen"        -> 1 671 muss stimmen
//            "`x.ts` 2 714 -> 1 671"      -> der LETZTE Wert muss stimmen
//          Risiko-Zeilen sind Gegenwart, keine Historie: R12 behauptete
//          "tools.ts 2 614 Zeilen", die Datei hat 1 671.
//
// Zwei Ausnahmen, beide positionsbezogen und beide noetig:
//   - ein Loesch-Beleg ("`mount.ts` (3 270 Zeilen) ist geloescht")
//   - die ausdrueckliche Nennung einer frueheren Fassung ("nannte noch 2 614")
// Eine zeilenweite Ausnahme waere falsch: R12 traegt BEIDES, den Bericht und
// die Gegenwart - eine zeilenweite Regel macht die Zeile stumm.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOKUS = ["docs/fahrplan.md", "docs/current/stand.md", "docs/current/architektur.md"];

const SUCHORTE = [
  "packages/engine/src", "packages/engine/test",
  "packages/editor/src", "packages/editor/src/inspector",
  "packages/editor/test",
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

const BERICHT =
  /vorige Fassung|fruehere Fassung|fr\u00fchere Fassung|sagte bisher|nannte bisher|gel(?:oe|\u00f6)scht|entfiel|entfernt/i;

let verweise = 0;
let zahlbehauptungen = 0;
const fehler = [];

for (const doku of DOKUS) {
  const L = readFileSync(join(ROOT, doku), "utf8").split(/\r?\n/);
  for (let i = 0; i < L.length; i++) {
    const zeile = L[i];
    if (!/^\| R\d+ \|/.test(zeile)) continue;
    const id = /^\| (R\d+) \|/.exec(zeile)[1];

    // ---- Regel 1: Zeilenverweise ----
    for (const m of zeile.matchAll(/`([\w./-]+\.(?:ts|js|json|mjs)):(\d+)(?:-(\d+))?`/g)) {
      verweise++;
      const pfad = finde(m[1]);
      if (pfad === null) {
        fehler.push(`${doku}:${i + 1} ${id}: ${m[1]} existiert nicht`);
        continue;
      }
      const n = zeilenZahl(pfad);
      const bis = Number(m[3] ?? m[2]);
      if (bis > n) fehler.push(`${doku}:${i + 1} ${id}: ${m[1]}:${m[2]}-${bis}, Datei hat ${n} Zeilen`);
    }

    // ---- Regel 2: Zeilenzahlen ----
    for (const m of zeile.matchAll(
      /`([\w./-]+\.(?:ts|js))`[^\d`]{0,40}((?:\d[\d ]*\s*(?:->|\u2192)\s*)*\d[\d ]*)\s*Zeilen/g,
    )) {
      const davor = zeile.slice(Math.max(0, m.index - 160), m.index);
      const danach = zeile.slice(m.index, m.index + 160);
      if (BERICHT.test(davor) || BERICHT.test(danach)) continue;

      zahlbehauptungen++;
      const zahlen = m[2].split(/->|\u2192/).map((v) => Number(v.replace(/[^\d]/g, "")));
      const ist = zahlen[zahlen.length - 1];
      const pfad = finde(m[1]);
      if (pfad === null) {
        fehler.push(`${doku}:${i + 1} ${id}: ${m[1]} existiert nicht (Zeilenzahl ${ist})`);
        continue;
      }
      const wirklich = zeilenZahl(pfad);
      if (wirklich !== ist) {
        fehler.push(`${doku}:${i + 1} ${id}: ${m[1]} behauptet ${ist}, ist ${wirklich}`);
      }
    }
  }
}

console.log(`${verweise} Zeilenverweise, ${zahlbehauptungen} Zeilenzahlen in Risiko-Zeilen`);
console.log(`${fehler.length} Verstoesse:`);
for (const f of fehler) console.log(`  ${f}`);
process.exit(fehler.length === 0 ? 0 : 1);
