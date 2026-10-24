import { readFileSync } from "node:fs";

// Misst einen Kandidaten-Zuschnitt exakt: welche Importe braucht der Block,
// welche bleiben in der Quelldatei zurueck?
//
// Aufruf:
//   node messung-block.mjs 16-21          (zusammenhaengend)
//   node messung-block.mjs 4-9,12         (mit einer Einzelroute)
//   node messung-block.mjs 3,6,32,33      (nur Einzelrouten)
//   node messung-block.mjs --datei x.ts 4-9
//
// Der erste Anlauf kannte nur Bereiche und rechnete `[3]` als `3..undefined` -
// eine Einzelroute ergab dann "0 Routen, 0 Zeilen" und sah wie ein Fachbereich
// ohne Inhalt aus. Genau die Sorte stiller Fehlmessung, die einen schlechten
// Schnitt freigibt, deshalb wird ein Bereich ohne Ende jetzt abgelehnt.
const args = process.argv.slice(2);
let datei = "packages/engine/src/http-routes-sites.ts";
let spanne = "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--datei") datei = args[++i];
  else spanne = args[i];
}
if (!spanne) {
  console.error("Aufruf: node messung-block.mjs [--datei x.ts] <4-9,12|3,6,32,33>");
  process.exit(1);
}

const quelle = readFileSync(datei, "utf8");
const L = quelle.split(/\r?\n/);

const starts = [];
for (let i = 0; i < L.length; i++) if (/^ {2}\{$/.test(L[i])) starts.push(i);

const routen = starts.map((s, k) => {
  const grenze = k + 1 < starts.length ? starts[k + 1] : L.length;
  let ende = grenze - 1;
  while (ende > s && !/^ {2}\},?$/.test(L[ende])) ende--;
  return { nr: k + 1, start: s, ende };
});

const bereiche = spanne.split(",").map((x) => {
  const teile = x.split("-").map(Number);
  if (x.includes("-")) {
    if (teile.length !== 2 || !Number.isInteger(teile[0]) || !Number.isInteger(teile[1])) {
      console.error(`ungueltiger Bereich: ${x}`);
      process.exit(1);
    }
    return { von: teile[0], bis: teile[1] };
  }
  const n = Number(x);
  if (!Number.isInteger(n)) {
    console.error(`ungueltige Route: ${x}`);
    process.exit(1);
  }
  return { von: n, bis: n };
});

const imports = [];
for (const m of quelle.matchAll(/^import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+"([^"]+)"/gm)) {
  const namen = m[1]
    .split(",")
    .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim() ?? "")
    .filter((n) => n !== "" && !n.startsWith("//"));
  imports.push({ namen, quelle: m[2] });
}
for (const m of quelle.matchAll(/^import\s+(?:type\s+)?(\w+)\s+from\s+"([^"]+)"/gm)) {
  imports.push({ namen: [m[1]], quelle: m[2] });
}

const gewaehlt = routen.filter((r) => bereiche.some((b) => r.nr >= b.von && r.nr <= b.bis));
if (gewaehlt.length === 0) {
  console.error("keine Route im Bereich - Zahlen pruefen");
  process.exit(1);
}
const rest = routen.filter((r) => !gewaehlt.includes(r));

const textVon = (rs) => rs.map((r) => L.slice(r.start, r.ende + 1).join("\n")).join("\n");
const blockText = textVon(gewaehlt);
const restText = textVon(rest);

function benutzt(text) {
  const s = new Set();
  for (const imp of imports) for (const n of imp.namen) if (new RegExp(`\\b${n}\\b`).test(text)) s.add(`${imp.quelle}#${n}`);
  return s;
}

const imBlock = benutzt(blockText);
const imRest = benutzt(restText);

const zeilen = gewaehlt.reduce((n, r) => n + (r.ende - r.start + 1), 0);
console.log(`${datei}\nKandidat ${spanne}: ${gewaehlt.length} Routen, ${zeilen} Zeilen`);
console.log(`  Routen: ${gewaehlt.map((r) => r.nr).join(", ")}`);
console.log(`\n  Braucht ${imBlock.size} Importe:`);
for (const q of [...imBlock].sort()) console.log(`    ${q}`);

const nurBlock = [...imBlock].filter((x) => !imRest.has(x));
const nurRest = [...imRest].filter((x) => !imBlock.has(x));
console.log(`\n  Nur im Block (wandert mit): ${nurBlock.length}`);
for (const q of nurBlock.sort()) console.log(`    ${q}`);
console.log(`\n  Nur im Rest (bleibt): ${nurRest.length}`);
console.log(`  Gemeinsam: ${imBlock.size - nurBlock.length}`);
