// Stellt die Zeilenenden von `docs/mcp-route-matrix.md` auf CRLF zurueck.
//
// Der Generator schreibt LF; das Repository haelt die Datei mit CRLF. Der
// Diff waere danach 188 Zeilen Rauschen statt zwei verschobener Zeilen. Die
// zwei echten Aenderungen bleiben.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/mcp-route-matrix.md";
const roh = readFileSync(pfad, "utf8");
const lf = roh.replace(/\r\n/g, "\n");
writeFileSync(pfad, lf.replace(/\n/g, "\r\n"), "utf8");

const neu = readFileSync(pfad, "utf8");
console.log(`CRLF: ${(neu.match(/\r\n/g) ?? []).length}`);
console.log(`LF allein: ${(neu.match(/(?<!\r)\n/g) ?? []).length}`);
