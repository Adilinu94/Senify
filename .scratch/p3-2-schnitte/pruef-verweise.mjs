// Prueft alle Datei-Verweise mit Zeilennummer in den Risiko-Zeilen.
//
// Anlass: die R12-Zeile im Fahrplan behauptete "tools.ts 2 614 Zeilen", die
// Datei hat 1 671. R6 verweist auf `http.ts:531-541`, die Datei hat 274
// Zeilen. Solche Verweise sehen nach Beleg aus und sind nach zwei Umbauten
// keine mehr - und niemand merkt es, weil kein Waechter sie liest.
//
// Dieses Skript sammelt JEDEN Verweis der Form `datei:zeile` oder
// `datei:zeile-zeile` aus den drei Register-Dokumenten und prueft, ob die
// Datei existiert und die Zeile darin liegt.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOKUS = [
  "docs/fahrplan.md",
  "docs/current/stand.md",
  "docs/current/architektur.md",
];

// Wo eine Datei liegen kann, wenn der Verweis nur den Namen nennt.
const SUCHORTE = [
  "packages/engine/src",
  "packages/engine/test",
  "packages/editor/src",
  "packages/editor/test",
  "packages/mcp/src",
  "packages/mcp/test",
  "packages/app/public",
  "packages/app/test",
  "packages/manifest/src",
  "packages/framer-import/src",
  "packages/framer-import/test",
  "packages/renderer/src",
  "scripts",
  "", // Wurzel (vitest.config.ts, package.json)
];

const zeilen = (p) => readFileSync(p, "utf8").split(/\r?\n/).length;

/** Findet die Datei zu einem Verweis - mit oder ohne Ordner. */
function finde(name) {
  const kandidaten = name.includes("/")
    ? [join(ROOT, name)]
    : SUCHORTE.map((d) => join(ROOT, d, name));
  return kandidaten.find((p) => existsSync(p)) ?? null;
}

const treffer = [];
for (const doku of DOKUS) {
  const L = readFileSync(join(ROOT, doku), "utf8").split(/\r?\n/);
  for (let i = 0; i < L.length; i++) {
    // Nur Risiko-Zeilen: der Befund betrifft das Register.
    if (!/^\| R\d+ \|/.test(L[i])) continue;
    const id = /^\| (R\d+) \|/.exec(L[i])[1];
    // `pfad:123` oder `pfad:123-456`; Pfad endet an Backtick, Klammer, Komma, Leerzeichen.
    for (const m of L[i].matchAll(/`([\w./-]+\.(?:ts|js|json|mjs)):(\d+)(?:-(\d+))?`/g)) {
      treffer.push({ doku, zeile: i + 1, id, datei: m[1], von: Number(m[2]), bis: Number(m[3] ?? m[2]) });
    }
  }
}

console.log(`${treffer.length} Zeilenverweise in Risiko-Zeilen\n`);
let kaputt = 0;
for (const t of treffer) {
  const pfad = finde(t.datei);
  if (pfad === null) {
    console.log(`FEHLT   ${t.doku}:${t.zeile} ${t.id}  ${t.datei} (Datei nicht gefunden)`);
    kaputt++;
    continue;
  }
  const n = zeilen(pfad);
  if (t.bis > n) {
    console.log(`ZU KURZ ${t.doku}:${t.zeile} ${t.id}  ${t.datei}:${t.von}-${t.bis}  (Datei hat ${n} Zeilen)`);
    kaputt++;
  } else {
    console.log(`ok      ${t.doku}:${t.zeile} ${t.id}  ${t.datei}:${t.von}-${t.bis} / ${n}`);
  }
}

console.log(`\n${kaputt} von ${treffer.length} kaputt.`);
process.exit(kaputt === 0 ? 0 : 1);
