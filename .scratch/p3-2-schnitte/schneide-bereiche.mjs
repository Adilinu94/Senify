import { readFileSync, writeFileSync } from "node:fs";

// Schneidet MEHRERE Zeilenbereiche einer Datei in ein neues Modul - fuer Bloecke,
// die fachlich zusammengehoeren, im Quelltext aber durch fremde Funktionen
// getrennt liegen. Genau das war der Fall bei den Referenz-Karten: das
// Blockrendering (mit dem Waechter) und die einzelne Karte gehoeren zusammen,
// dazwischen stand die Filter- und Tray-Logik.
//
// Aufruf: node schneide-bereiche.mjs <datei> <ziel> <von1-bis1> <von2-bis2> ...
const [, , datei, ziel, ...bereiche] = process.argv;
if (!datei || !ziel || bereiche.length === 0) {
  console.error("Aufruf: node schneide-bereiche.mjs <datei> <ziel> <von-bis> [von-bis ...]");
  process.exit(1);
}

const roh = readFileSync(datei, "utf8");
const L = roh.split(/\r?\n/);

const spannen = bereiche.map((b) => {
  const [a, z] = b.split("-").map(Number);
  if (!Number.isInteger(a) || !Number.isInteger(z) || a < 1 || z < a) {
    console.error(`ungueltiger Bereich: ${b}`);
    process.exit(1);
  }
  return { von: a, bis: z };
});
spannen.sort((x, y) => x.von - y.von);

// Ueberlappungen waeren ein Zeichen, dass die Bereiche falsch gewaehlt sind.
for (let i = 1; i < spannen.length; i++) {
  if (spannen[i].von <= spannen[i - 1].bis) {
    console.error(`Bereiche ueberlappen: ${JSON.stringify(spannen[i - 1])} und ${JSON.stringify(spannen[i])}`);
    process.exit(1);
  }
}

const teile = [];
for (const s of spannen) {
  const block = L.slice(s.von - 1, s.bis);
  let bilanz = 0;
  for (const z of block) for (const c of z) {
    if (c === "{") bilanz++;
    else if (c === "}") bilanz--;
  }
  const definiert = [...block.join("\n").matchAll(/^(?:export )?(?:async )?function (\w+)/gm)].map((m) => m[1]);
  console.log(`Z${s.von}-${s.bis}: ${block.length} Zeilen, Klammerbilanz ${bilanz}, definiert: ${definiert.join(", ") || "-"}`);
  if (bilanz !== 0) {
    console.error("Klammerbilanz ungleich 0 - der Schnitt ist falsch.");
    process.exit(1);
  }
  teile.push({ ...s, block, definiert });
}

const kopf = [
  "// Die Karten der Referenzen-Seite (P3-2, Schritt 59): das Blockrendering",
  "// mit dem Waechter, die einzelne Karte und ihr Vorschaubild.",
  "//",
  "// Der Block stand in `app-references.js` und ist dort nicht zusammenhaengend:",
  "// zwischen dem Rendering und der Karte liegt die Filter- und Tray-Logik.",
  "// Fachlich gehoert beides zusammen - `refsRenderCards` ruft `refsCard`, und",
  "// beide teilen den Beobachter `refsCardObserver`. Sie brauchen keinen Zugriff",
  "// auf `refsState`: Auswahl und Eintrag kommen ueber `refsIsSelected` und",
  "// `refsEntryFor` herein, das Oeffnen ueber `refsOpenDetail`.",
  "",
];

writeFileSync(ziel, [...kopf, ...teile.flatMap((t) => [...t.block, ""])].join("\n"), "utf8");

// Die Quelldatei ohne die Bereiche - von hinten nach vorn, damit die
// Zeilennummern der noch offenen Bereiche gueltig bleiben.
const neu = [...L];
for (const t of [...teile].sort((a, b) => b.von - a.von)) {
  neu.splice(t.von - 1, t.bis - t.von + 1);
  // Eine doppelte Leerzeile an der Naht auf eine zusammenziehen.
  if (neu[t.von - 1] === "" && neu[t.von - 2] === "") neu.splice(t.von - 1, 1);
}
writeFileSync(datei, neu.join("\n"), "utf8");

const alle = teile.flatMap((t) => t.definiert);
console.log(`\ngeschrieben: ${ziel} (${teile.reduce((n, t) => n + t.block.length, 0) + kopf.length} Zeilen)`);
console.log(`${datei}: ${L.length} -> ${neu.length} Zeilen`);
console.log(`Exporte, die die Quelldatei braucht: ${alle.join(", ")}`);
