import { readFileSync, readdirSync } from "node:fs";

// Prueft, ob zwei Route-Module dieselbe Kombination aus Methode und Pfad
// tragen. Die Reihenfolge in `ROUTES` entscheidet, welche gewinnt - ein
// Duplikat waere also nicht automatisch ein Fehler, aber eine unsichtbare
// Abhaengigkeit von der Einbindungsreihenfolge. Beim Verschieben von Routen
// zwischen Modulen muss das ausgeschlossen sein.
const src = "packages/engine/src";
const dateien = readdirSync(src).filter((n) => /^http-routes-.*\.ts$/.test(n)).sort();

const alle = [];
for (const name of dateien) {
  const L = readFileSync(`${src}/${name}`, "utf8").split(/\r?\n/);
  for (let i = 0; i < L.length; i++) {
    if (!/^ {2}\{$/.test(L[i])) continue;
    let tiefe = 0;
    let ende = i;
    for (let j = i; j < L.length; j++) {
      for (const c of L[j]) {
        if (c === "{") tiefe++;
        else if (c === "}") tiefe--;
      }
      if (tiefe <= 0) { ende = j; break; }
    }
    const text = L.slice(i, ende + 1).join("\n");
    const methode = /method: "([A-Z]+)"/.exec(text)?.[1];
    const segmente = /segments: \[([^\]]+)\]/.exec(text)?.[1] ?? "";
    const pfad = [...segmente.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("/");
    if (methode) alle.push({ schluessel: `${methode} /${pfad}`, name, zeile: i + 1 });
    i = ende;
  }
}

console.log(`${alle.length} Routen in ${dateien.length} Modulen`);

const nachSchluessel = new Map();
for (const r of alle) {
  if (!nachSchluessel.has(r.schluessel)) nachSchluessel.set(r.schluessel, []);
  nachSchluessel.get(r.schluessel).push(r);
}

const doppelt = [...nachSchluessel.entries()].filter(([, rs]) => rs.length > 1);
if (doppelt.length === 0) {
  console.log("keine doppelte Methode+Pfad-Kombination");
} else {
  console.log(`\n${doppelt.length} DOPPELT:`);
  for (const [k, rs] of doppelt) {
    console.log(`  ${k}`);
    for (const r of rs) console.log(`      ${r.name}:${r.zeile}`);
  }
}

console.log("\nRouten je Modul:");
const proModul = new Map();
for (const r of alle) proModul.set(r.name, (proModul.get(r.name) ?? 0) + 1);
for (const [n, c] of [...proModul].sort()) console.log(`  ${n.padEnd(32)} ${String(c).padStart(3)}`);
