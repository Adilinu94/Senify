// Formuliert den R6-Nachtrag so, dass er die alten Verweise NICHT im
// `datei:zeile`-Format wiederholt. Sonst meldet der neue Waechter die
// historische Notiz als kaputten Beleg - ein Fehlalarm, den ich selbst
// gebaut haette.
import { readFileSync, writeFileSync } from "node:fs";

const datei = "docs/current/stand.md";
const L = readFileSync(datei, "utf8").split(/\r?\n/);
const i = L.findIndex((z) => z.startsWith("| R6 |"));
if (i < 0) throw new Error("R6 fehlt");

const anfang = "**Die Zeilenverweise sind am 26.10.2026 berichtigt:**";
const a = L[i].indexOf(anfang);
if (a < 0) throw new Error("Nachtrag nicht gefunden");
const ende = L[i].lastIndexOf("|");

const neu =
  "**Die Zeilenverweise sind am 26.10.2026 berichtigt:** sie zeigten in `http.ts` auf die Zeilen 531-541 und 506-519, aber die Datei hat seit dem Routen-Schnitt 275 statt ueber 500 Zeilen - die Belege lagen hinter dem Dateiende. Sie zeigen jetzt auf `http-route-support.ts`, wo der Code seit dem Schnitt steht. ";

L[i] = L[i].slice(0, a) + neu + L[i].slice(ende);
writeFileSync(datei, L.join("\r\n"), "utf8");
console.log("R6: Nachtrag ohne kaputtes Verweisformat.");
