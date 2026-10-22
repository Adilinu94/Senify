import { readFileSync, writeFileSync } from "node:fs";

const path = "docs/fahrplan.md";
const lines = readFileSync(path, "utf8").split(/\r?\n/);

const start = lines.findIndex((line) => line.startsWith("<<<<<<< HEAD"));
const middle = lines.findIndex((line) => line.startsWith("======="));
const end = lines.findIndex((line) => line.startsWith(">>>>>>> origin/master"));
if (start === -1 || middle === -1 || end === -1) throw new Error("Konfliktmarker nicht gefunden");

const ours = lines.slice(start + 1, middle);
const theirs = lines.slice(middle + 1, end);

// Unsere beiden Zeilen (S2, S5) und die Zeile des Upstream (P3-2 Schritt 45).
// Die Trenzeile `|---|---|` aus unserem Block fliegt raus: die Tabelle hat sie
// schon direkt unter der Kopfzeile.
const keep = (line: string): boolean => line.trim() !== "" && !/^\|[-|\s]+\|$/.test(line);
const merged = [...ours.filter(keep), ...theirs.filter(keep)];

lines.splice(start, end - start + 1, ...merged);
writeFileSync(path, lines.join("\n"), "utf8");

// Kontrolle: genau eine Kopfzeile, genau eine Trenzeile, keine Marker.
const text = readFileSync(path, "utf8");
console.log(JSON.stringify({
  kopfzeilen: (text.match(/\| Datum \| Änderung \|/g) ?? []).length,
  trennzeilen: (text.match(/^\|---\|---\|$/gm) ?? []).length,
  marker: (text.match(/^<{7}|^={7}|^>{7}/gm) ?? []).length,
  zeilen: lines.length,
}));
