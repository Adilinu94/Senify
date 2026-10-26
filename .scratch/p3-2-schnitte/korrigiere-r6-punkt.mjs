// Setzt den fehlenden Punkt in der R6-Zeile und formuliert den Nachtrag
// sauberer: der erste Anlauf hat ihn ohne Satzzeichen an "kein zweiter Write)"
// gehaengt.
import { readFileSync, writeFileSync } from "node:fs";

const datei = "docs/current/stand.md";
const L = readFileSync(datei, "utf8").split(/\r?\n/);
const i = L.findIndex((z) => z.startsWith("| R6 |"));
if (i < 0) throw new Error("R6 fehlt");

const alt = "kein zweiter Write)  Die Zeilenverweise";
if (!L[i].includes(alt)) throw new Error("Anschlussstelle nicht gefunden");

L[i] = L[i].replace(
  alt,
  "kein zweiter Write). **Die Zeilenverweise sind am 26.10.2026 berichtigt:** sie zeigten auf `http.ts:531-541` und `http.ts:506-519`, aber die Datei hat seit dem Routen-Schnitt 275 statt ueber 500 Zeilen - die Belege lagen hinter dem Dateiende. Sie zeigen jetzt auf `http-route-support.ts:204-238` und `:179-192`, wo der Code seit dem Schnitt steht.",
);

writeFileSync(datei, L.join("\r\n"), "utf8");
console.log("R6: Punkt gesetzt, Nachtrag umformuliert.");
console.log("");
console.log(L[i].slice(0, 700));
