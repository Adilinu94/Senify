import { readFileSync, writeFileSync } from "node:fs";

// Schneidet einen Block aus `http-routes-sites.ts` in ein eigenes Modul.
//
// Vor dem Schreiben geprueft (nach drei Fehlversuchen bei Schritt 56):
//   1. Klammerbilanz des Blocks ist 0.
//   2. Der Block enthaelt keine Funktionsdeklaration auf Spalte 0.
//   3. Der Anker ist die Klammerzeile `  },` der letzten Route.
//   4. Die verbleibende Datei hat danach noch genau die erwartete Routenzahl.
const DATEI = "packages/engine/src/http-routes-sites.ts";
const ZIEL = "packages/engine/src/http-routes-theme.ts";
const VON = Number(process.argv[2]);
const BIS = Number(process.argv[3]);
if (!Number.isInteger(VON) || !Number.isInteger(BIS)) {
  console.error("Aufruf: node schneide-block.mjs <vonRoute> <bisRoute>");
  process.exit(1);
}

const roh = readFileSync(DATEI, "utf8");
const hatCRLF = roh.includes("\r\n");
const L = roh.split(/\r?\n/);

const starts = [];
for (let i = 0; i < L.length; i++) if (/^ {2}\{$/.test(L[i])) starts.push(i);

const routen = starts.map((s, k) => {
  const grenze = k + 1 < starts.length ? starts[k + 1] : L.length;
  let ende = grenze - 1;
  while (ende > s && !/^ {2}\},?$/.test(L[ende])) ende--;
  return { nr: k + 1, start: s, ende };
});

const gewaehlt = routen.filter((r) => r.nr >= VON && r.nr <= BIS);
if (gewaehlt.length !== BIS - VON + 1) {
  console.error(`Erwartet ${BIS - VON + 1} Routen, gefunden ${gewaehlt.length}`);
  process.exit(1);
}
const von = gewaehlt[0].start;
const bis = gewaehlt[gewaehlt.length - 1].ende;

// Ein Kommentar direkt ueber der ersten Route gehoert zum Block: in
// `http-routes-sites.ts` steht vor den Style-Rules eine dreizeilige Notiz
// ("site-wide, so they hang off the site like the theme"). Bliebe sie stehen,
// erklaerte sie in der Quelldatei eine Route, die dort nicht mehr existiert.
let kopfKommentar = von;
while (kopfKommentar > 0 && /^ {2}\/\//.test(L[kopfKommentar - 1])) kopfKommentar--;

// --- Pruefung 1: Klammerbilanz
const block = L.slice(von, bis + 1);
let bilanz = 0;
for (const z of block) for (const c of z) {
  if (c === "{") bilanz++;
  else if (c === "}") bilanz--;
}
console.log(`Block Z${von + 1}-${bis + 1} (${block.length} Zeilen), Klammerbilanz ${bilanz}`);
if (bilanz !== 0) {
  console.error("Klammerbilanz ungleich 0 - der Schnitt ist falsch.");
  process.exit(1);
}
if (kopfKommentar < von) {
  console.log(`  Kopfkommentar Z${kopfKommentar + 1}-${von} wandert mit`);
}

// --- Pruefung 2: keine Funktionsdeklaration auf Spalte 0
const pruefblock = L.slice(kopfKommentar, bis + 1);
const verdacht = pruefblock.filter((z) => /^(export )?(async )?function |^const \w+ = /.test(z));
if (verdacht.length > 0) {
  console.error("Der Block enthaelt eine Deklaration:", verdacht);
  process.exit(1);
}

// --- Pruefung 3: der Anker
if (!/^ {2}\},$/.test(L[bis])) {
  console.error(`Anker Z${bis + 1} ist nicht "  },": ${JSON.stringify(L[bis])}`);
  process.exit(1);
}

// --- Pruefung 4: was danach noch da ist
const restRouten = routen.length - gewaehlt.length;
console.log(`Rest: ${restRouten} Routen`);

// --- Die Zieldatei
const kopf = [
  "// Theme und Style-Regeln einer Site (P3-2, Schritt 57): das Theme lesen,",
  "// als CSS ausliefern, schreiben, den Theme-Bericht, den Design-Bericht und",
  "// die sechs Style-Regel-Routen (lesen, anlegen, aendern, sortieren, loeschen).",
  "//",
  "// Die elf Routen standen in `http-routes-sites.ts`. Sie teilen einen",
  "// Fachbereich - Theme und Regelwerk haengen beide an der Site und tragen",
  "// dieselbe Versionskopfzeile (`styleVersionHeaders`) - und brauchen deshalb",
  "// nur fuenf Import-Quellen: den Routen-Helfer, den Koerper-Parser, den",
  "// Site-Vertrag, den Theme-Bericht und den Design-Bericht.",
  "",
  'import type { Route } from "./http-contract.ts";',
  'import { readJsonBody, requireParam, resolveAuthor } from "./http-route-support.ts";',
  'import { parseBody } from "./mutations/contract.ts";',
  'import { UpdateThemeBodySchema, type UpdateThemeBody } from "./mutations/contract.ts";',
  "import {",
  "  CreateStyleRuleBodySchema,",
  "  ReorderStyleRuleBodySchema,",
  "  SiteEventBodySchema,",
  "  UpdateStyleRuleBodySchema,",
  "  type CreateStyleRuleBody,",
  "  type ReorderStyleRuleBody,",
  "  type SiteEventBody,",
  "  type UpdateStyleRuleBody,",
  '} from "./site-contract.ts";',
  'import { buildThemeReport } from "./theme-report.ts";',
  'import { buildDesignReport } from "./design-report.ts";',
  'import { SenifyError } from "@senify/core";',
  "",
  "function styleVersionHeaders(version: number): Record<string, string> {",
  "  return {",
  '    etag: `"style-v${version}"`,',
  '    "x-senify-style-version": String(version),',
  "  };",
  "}",
  "",
  "/** Die Routen des Themes und der Style-Regeln. */",
  "export const themeRoutes: Route[] = [",
];

const ziel = [...kopf, ...L.slice(kopfKommentar, bis + 1), "];", ""].join("\n");
writeFileSync(ZIEL, hatCRLF ? ziel.replace(/\n/g, "\r\n") : ziel, "utf8");

// --- Die Quelldatei ohne den Block
const neu = [...L.slice(0, kopfKommentar), ...L.slice(bis + 1)];
writeFileSync(DATEI, neu.join("\n"), "utf8");

console.log(`geschrieben: ${ZIEL} (${L.slice(kopfKommentar, bis + 1).length + kopf.length + 2} Zeilen)`);
console.log(`${DATEI}: ${L.length} -> ${neu.length} Zeilen`);
