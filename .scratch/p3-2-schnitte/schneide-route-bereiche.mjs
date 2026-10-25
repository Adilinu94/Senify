import { readFileSync, writeFileSync } from "node:fs";

// Schneidet MEHRERE Bereiche einer Route-Tabelle in ein eigenes Modul.
//
// Warum mehrere Bereiche: eine Ressource kann im Quelltext durch eine fremde
// Gruppe getrennt sein. `deployments` stand als POST (Route 7) und GET (Route
// 12) mit `design-contract` dazwischen. Wer nur den POST schneidet, verteilt
// eine Ressource auf zwei Module - und die naechste Aenderung an der Route
// landet dann im falschen Fachbereich.
//
// Aufruf:
//   node schneide-route-bereiche.mjs <quelle> <ziel> <exportName> <kopfdatei> <4-9,12>
//
// Vor dem Schreiben geprueft:
//   1. Jeder Bereich ist zusammenhaengend und enthaelt ganze Routen.
//   2. Klammerbilanz des Gesamtblocks ist 0.
//   3. Kein Bereich enthaelt eine Deklaration auf Spalte 0.
//   4. Jeder Bereich endet auf der Klammerzeile `  },`.
//   5. Die Routenzahl der Quelldatei nimmt genau um die Zahl der geschnittenen
//      Routen ab - und die neue Datei traegt dieselbe Zahl.
const [, , quelle, ziel, exportName, kopfPfad, spanne] = process.argv;
if (!quelle || !ziel || !exportName || !spanne) {
  console.error("Aufruf: node schneide-route-bereiche.mjs <quelle> <ziel> <exportName> <kopfdatei> <4-9,12>");
  process.exit(1);
}

const roh = readFileSync(quelle, "utf8");
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

const bereiche = spanne.split(",").map((x) => {
  const t = x.split("-").map(Number);
  if (x.includes("-")) {
    if (t.length !== 2 || !Number.isInteger(t[0]) || !Number.isInteger(t[1]) || t[1] < t[0]) {
      console.error(`ungueltiger Bereich: ${x}`);
      process.exit(1);
    }
    return { von: t[0], bis: t[1] };
  }
  const n = Number(x);
  if (!Number.isInteger(n)) {
    console.error(`ungueltige Route: ${x}`);
    process.exit(1);
  }
  return { von: n, bis: n };
}).sort((a, b) => a.von - b.von);

for (let i = 1; i < bereiche.length; i++) {
  if (bereiche[i].von <= bereiche[i - 1].bis) {
    console.error(`Bereiche ueberlappen: ${JSON.stringify(bereiche[i - 1])} / ${JSON.stringify(bereiche[i])}`);
    process.exit(1);
  }
}

const gewaehlt = routen.filter((r) => bereiche.some((b) => r.nr >= b.von && r.nr <= b.bis));
const erwartet = bereiche.reduce((n, b) => n + (b.bis - b.von + 1), 0);
if (gewaehlt.length !== erwartet) {
  console.error(`Erwartet ${erwartet} Routen, gefunden ${gewaehlt.length}`);
  process.exit(1);
}

// Die Bloecke in Quelltext-Reihenfolge, jeweils von der Klammerzeile der ersten
// Route bis zur Klammerzeile der letzten - samt Kommentar direkt darueber.
const bloecke = bereiche.map((b) => {
  const teil = gewaehlt.filter((r) => r.nr >= b.von && r.nr <= b.bis);
  const von = teil[0].start;
  const bis = teil[teil.length - 1].ende;
  let kopf = von;
  while (kopf > 0 && /^ {2}\/\//.test(L[kopf - 1])) kopf--;
  if (!/^ {2}\},$/.test(L[bis])) {
    console.error(`Anker Z${bis + 1} ist nicht "  },": ${JSON.stringify(L[bis])}`);
    process.exit(1);
  }
  const text = L.slice(kopf, bis + 1);
  const verdacht = text.filter((z) => /^(export )?(async )?function |^const \w+ = /.test(z));
  if (verdacht.length > 0) {
    console.error("Der Block enthaelt eine Deklaration:", verdacht);
    process.exit(1);
  }
  return { von: kopf, bis, nr: teil.map((r) => r.nr), routen: teil.length, text };
});

let bilanz = 0;
for (const b of bloecke) for (const z of b.text) for (const c of z) {
  if (c === "{") bilanz++;
  else if (c === "}") bilanz--;
}
if (bilanz !== 0) {
  console.error(`Klammerbilanz ${bilanz} - der Schnitt ist falsch.`);
  process.exit(1);
}

for (const b of bloecke) {
  console.log(`  Z${b.von + 1}-${b.bis + 1}: ${b.text.length} Zeilen, Routen ${b.nr.join(",")}`);
}

const kopf = kopfPfad ? readFileSync(kopfPfad, "utf8").split(/\r?\n/) : [];
const inhalt = [...kopf, `export const ${exportName}: Route[] = [`, ...bloecke.flatMap((b) => [...b.text, ""]), "];", ""];
// Die letzte Leerzeile vor "];" entfaellt wieder.
while (inhalt[inhalt.length - 2] === "") inhalt.splice(inhalt.length - 2, 1);
writeFileSync(ziel, hatCRLF ? inhalt.join("\r\n") : inhalt.join("\n"), "utf8");

// Quelle ohne die Bereiche - von hinten nach vorn.
const neu = [...L];
for (const b of [...bloecke].sort((x, y) => y.von - x.von)) {
  neu.splice(b.von, b.bis - b.von + 1);
  if (neu[b.von] === "" && neu[b.von - 1] === "") neu.splice(b.von, 1);
}
writeFileSync(quelle, neu.join("\n"), "utf8");

const routenNeu = neu.filter((z) => /^ {2}\{$/.test(z)).length;
console.log(`\n  geschrieben: ${ziel} (${inhalt.length} Zeilen, ${gewaehlt.length} Routen)`);
console.log(`  ${quelle}: ${L.length} -> ${neu.length} Zeilen`);
console.log(`  Routen ${routen.length} -> ${routenNeu} (erwartet ${routen.length - gewaehlt.length})`);
if (routenNeu !== routen.length - gewaehlt.length) {
  console.error("Die Routenzahl der Quelle stimmt nicht - der Schnitt ist falsch.");
  process.exit(1);
}
