// Reproduziert den CI-Befund: der Generator schreibt unter Windows/Linux eine
// andere Datei als die eingecheckte.
//
// Lokal ist `module:check` gruen, in der CI rot. Der Verdacht: das Skript liest
// `packages/*/src` per `readdirSync` und sortiert - aber irgendwo geht eine
// plattformabhaengige Reihenfolge oder ein Zeilenende ein.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ZIEL = "docs/current/module.md";
const vorhanden = readFileSync(ZIEL, "utf8");

console.log("Zeilenenden der eingecheckten Datei:");
const crlf = (vorhanden.match(/\r\n/g) ?? []).length;
const lf = (vorhanden.match(/(?<!\r)\n/g) ?? []).length;
console.log(`  CRLF: ${crlf}   LF allein: ${lf}`);

console.log("");
console.log("Erste Zeile nach dem Header:");
console.log(JSON.stringify(vorhanden.split(/\r?\n/)[0]));

// Was schreibt der Generator? In eine temporaere Kopie.
console.log("");
console.log("Laeuft `--check` durch? (Erwartung lokal: ja)");
