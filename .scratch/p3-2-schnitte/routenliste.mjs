import { readFileSync } from "node:fs";

// Liste aller Routen mit Zeilennummern und Pfad - die Arbeitsgrundlage fuer
// jeden Schnitt. Nach jedem Fehlversuch verschieben sich die Zeilennummern,
// deshalb wird die Liste neu erzeugt statt aus dem Kopf fortgeschrieben.
const datei = process.argv[2] ?? "packages/engine/src/http-routes-sites.ts";
const L = readFileSync(datei, "utf8").split(/\r?\n/);
const starts = [];
for (let i = 0; i < L.length; i++) if (/^ {2}\{$/.test(L[i])) starts.push(i);

for (let k = 0; k < starts.length; k++) {
  const s = starts[k];
  const grenze = k + 1 < starts.length ? starts[k + 1] : L.length;
  let ende = grenze - 1;
  while (ende > s && !/^ {2}\},?$/.test(L[ende])) ende--;
  const text = L.slice(s, ende + 1).join("\n");
  const methode = /method: "([A-Z]+)"/.exec(text)?.[1] ?? "?";
  const segmente = /segments: \[([^\]]+)\]/.exec(text)?.[1] ?? "";
  const pfad = [...segmente.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("/");
  const scope = /scope: "(\w+)"/.exec(text)?.[1] ?? "?";
  console.log(
    `${String(k + 1).padStart(3)}  ${String(s + 1).padStart(5)}-${String(ende + 1).padEnd(5)} ${String(ende - s + 1).padStart(4)}Z  ${methode.padEnd(6)} ${scope.padEnd(6)} /${pfad}`,
  );
}
