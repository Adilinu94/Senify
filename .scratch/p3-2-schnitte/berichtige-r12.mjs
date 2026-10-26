// Schreibt den Absatz "Danach verbleibt die Modulaufteilung ..." in
// `docs/current/stand.md` neu.
//
// Gruende fuer den Umbau:
//   1. Die Zeile behauptete "drei grosse Dateien" - seit dem 25.10.2026 sind
//      es nach der vollstaendigen Messung mehr (19 ueber der Schwelle).
//   2. Sie trug wieder handgepflegte Zahlen ("1 205 -> 461"), genau das, was
//      der Waechter in `doku-konsistenz.test.ts` verbietet.
//   3. Der Bestand gehoert nach `docs/current/module.md`, nicht hierher.
import { readFileSync, writeFileSync } from "node:fs";

const pfad = "docs/current/stand.md";
const L = readFileSync(pfad, "utf8").split(/\r?\n/);
const i = L.findIndex((z) => z.startsWith("Danach verbleibt die Modulaufteilung"));
if (i < 0) {
  console.error("Absatz nicht gefunden");
  process.exit(1);
}

L[i] =
  "Danach verbleibt die Modulaufteilung (R12). **Der Bestand mit Zeilenzahlen, " +
  "Routenzahlen und Begruendungen steht in `docs/current/module.md`** - er wird dort " +
  "von `pnpm module:render` aus dem Code erzeugt, und `pnpm module:check` laesst den " +
  "Lauf rot werden, wenn Dokument und Code auseinanderlaufen. Diese Zeile nennt " +
  "deshalb keine Zahl mehr: sie trug bis zum 25.10.2026 eine Auswahl, die fuenf " +
  "Dateien ueber der Schwelle gar nicht sah (der Waechter las `engine/src` nicht " +
  "rekursiv).\n\n" +
  "Zwei Zuschnitte laufen: die Werkzeug-Tabelle (`packages/mcp/src/tools.ts`; ihre " +
  "Reihenfolge ist der Vertrag, ein Schnitt braucht den Manifest-Diff als Beweis) und " +
  "die Routen-Tabelle (`packages/engine/src/http-routes-sites.ts`, gemessene Kandidaten " +
  "im Modulkopf). `store.ts` ist **inhaltlich fertig**: die vier fachuebergreifenden " +
  "Transaktionen und `replaceTables` bleiben nach ADR-0019, der Rest sind Delegaten. " +
  "`http.ts` und `app.js` sind fertig: Dispatcher und Router, keine Fachlogik mehr. " +
  "R8 (MCP-Vertraege, Manifest-Konsumenten) und die CI-Verbesserungen aus P3-6 sind " +
  "geschlossen (`docs/fahrplan.md`).";

writeFileSync(pfad, L.join("\r\n"), "utf8");
console.log(`Zeile ${i + 1} neu geschrieben (${L[i].length} Zeichen).`);
console.log("");
console.log(L[i].slice(0, 400));
