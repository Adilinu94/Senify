// Zeigt die Zeile aus dem Abschnitt "Der laufende Zuschnitt" roh an.
import { readFileSync } from "node:fs";

const text = readFileSync("docs/current/module.md", "utf8");
const zeilen = text.split(/\r?\n/);
const start = zeilen.findIndex((z) => z.startsWith("## Der laufende Zuschnitt"));
const zeile = zeilen.slice(start).find((z) => z.includes("http-routes-sites")) ?? "(nicht gefunden)";
console.log("Zeile:", JSON.stringify(zeile.slice(0, 180)));
console.log("");
const i = zeile.indexOf("17 Site-Routen");
console.log("Gefunden bei:", i);
if (i >= 0) {
  for (const c of zeile.slice(i, i + 30)) {
    console.log(`  ${String(c.codePointAt(0)).padStart(5)}  ${JSON.stringify(c)}`);
  }
}
