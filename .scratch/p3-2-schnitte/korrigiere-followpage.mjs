// Korrigiert den letzten Satz der R12-Zeile: "die 9 Zeilen von followPage
// sind eine davon" ist kein sinnvoller Satz, und die 140 Zeilen, die die alte
// Fassung nannte, gehoerten nicht zu `followPage`, sondern zum Live-Kanal.
//
// Gemessen: `mountCanvasView` ist 737 Zeilen. Die groessten lokalen Bloecke
// darin sind `live` (140), `explorer` (116), `canvas` (45).
import { readFileSync, writeFileSync } from "node:fs";

const datei = "docs/fahrplan.md";
const L = readFileSync(datei, "utf8").split(/\r?\n/);
const i = L.findIndex((z) => z.startsWith("| R12 |"));
if (i < 0) throw new Error("R12 fehlt");

const alt =
  "In `app-editor.js` verbleibt `mountCanvasView` mit 737 Zeilen; der Canvas-Aufbau haelt Zustand und Ereignisse bewusst in einer Closure, die 9 Zeilen von `followPage` sind eine davon.";
const neu =
  "In `app-editor.js` verbleibt `mountCanvasView` mit 737 Zeilen; der Canvas-Aufbau haelt Zustand und Ereignisse bewusst in einer Closure. Die groessten Bloecke darin sind der Live-Kanal (140 Zeilen, eine `EventSource` mit ihren Zuhoerern), der Explorer (116) und die Canvas-Buehne (45) - sie teilen `doc`, `statusEl`, `activeLiveStream` und den Store, ein Schnitt muesste diesen Zustand als Parameter durchreichen. (Die fruehere Fassung nannte hier `followPage` mit 140 Zeilen; `followPage` sind 9 Zeilen, die 140 gehoerten zum Live-Kanal.)";

if (!L[i].includes(alt)) {
  console.error("Satz nicht gefunden. Aktuelle R12-Zeile enthaelt:");
  console.error(L[i].slice(0, 400));
  process.exit(1);
}
L[i] = L[i].replace(alt, neu);
writeFileSync(datei, L.join("\r\n"), "utf8");
console.log("R12: Satz berichtigt.");
console.log("");
console.log(L[i].slice(L[i].indexOf("In `app-editor.js` verbleibt"), L[i].indexOf("In `app-editor.js` verbleibt") + 480));
