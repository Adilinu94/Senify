// Korrigiert die veralteten Zahlen und Zeilenverweise in den drei Registern.
//
// Gemessen am 26.10.2026 gegen den Code, nicht geschaetzt:
//
//   R12 fahrplan.md   tools.ts "2 614 Zeilen"        -> 1 671 (vier Module)
//                     mountCanvasView "rund 820"     -> 737
//                     followPage "140 Zeilen"        -> 9 (eine Closure-Variable)
//   P3-2 Z504         "36 Store-Module"              -> 38
//                     "12 HTTP-Module"               -> 25
//                     "24 UI-Module"                 -> 35
//   R6 stand.md       http.ts:531-541                -> http-route-support.ts:204-238
//                     http.ts:506-519                -> http-route-support.ts:179-192
//   R11 stand.md      "33 ausgelagerte Fachmodule"   -> 63 (38 store + 25 http)
//
// Die Zahl "2 614" stand doppelt falsch da: `tools.ts` ist seit Schritt 71 bei
// 1 671, und der Satz "es verbleiben tools.ts" beschrieb Arbeit, die erledigt
// ist. Ein Leser plant danach.
import { readFileSync, writeFileSync } from "node:fs";

const ersetzungen = [
  // ---- docs/fahrplan.md: R12 ----
  {
    datei: "docs/fahrplan.md",
    alt: "`packages/mcp/src/tools.ts` 2 714 -> 2 614 Zeilen (zehn Bibliotheks-Werkzeuge als `tools-bibliothek.ts`, Manifest unveraendert bei 109 Werkzeugen). Es verbleiben `packages/mcp/src/tools.ts` (2 614 Zeilen Werkzeug-Tabelle; jeder weitere Schnitt braucht den Manifest-Diff als Beweis) und `packages/engine/src/store.ts` (2 662 Zeilen, inhaltlich nach ADR-0019 fertig; offen ist die Fassade). In `app-editor.js` verbleibt `mountCanvasView` mit rund 820 Zeilen - die groessten Reste sind `followPage` (140) und der Canvas-Aufbau selbst, der Zustand und Ereignisse bewusst in einer Closure haelt.",
    neu: "`packages/mcp/src/tools.ts` 2 714 -> 1 671 Zeilen (drei Schnitte: zehn Bibliotheks-Werkzeuge als `tools-bibliothek.ts`, 21 Medien-Werkzeuge als `tools-medien.ts`, 31 Referenz- und Design-Werkzeuge als `tools-referenzen.ts`; Manifest bei jedem Schritt unveraendert bei 109 Werkzeugen). Es verbleiben `packages/engine/src/store.ts` (2 662 Zeilen, inhaltlich nach ADR-0019 fertig: die vier fachuebergreifenden Transaktionen und `replaceTables` bleiben, 202 von 244 Methoden sind Delegaten) und `packages/editor/src/inspector/inspector.ts` (1 884 Zeilen, eine Closure mit 22 Renderern - gemessen, siehe `module.md`). In `app-editor.js` verbleibt `mountCanvasView` mit 737 Zeilen; der Canvas-Aufbau haelt Zustand und Ereignisse bewusst in einer Closure, die 9 Zeilen von `followPage` sind eine davon. **Jede Zeile hier wurde am 26.10.2026 gegen den Code gemessen** - die vorige Fassung nannte fuer `tools.ts` noch 2 614 Zeilen und beschrieb es als ungeteilt.",
  },
  // ---- docs/fahrplan.md: P3-2 Bestandszeile ----
  {
    datei: "docs/fahrplan.md",
    alt: "Nicht mehrere grosse Module gleichzeitig aufteilen. Bestand: 36 Store-Module, 12 HTTP-Module, 24 UI-Module.",
    neu: "Nicht mehrere grosse Module gleichzeitig aufteilen. **Der Bestand steht in `docs/current/module.md`** und wird dort aus dem Code erzeugt; diese Zeile nennt deshalb keine Modulzahl mehr (sie sagte \"36 Store-Module, 12 HTTP-Module, 24 UI-Module\" und war zum 26.10.2026 an allen drei Zahlen falsch).",
  },
  // ---- docs/current/stand.md: R6 ----
  {
    datei: "docs/current/stand.md",
    alt: "`http.ts:531-541`: der `run()`-Fehler gibt den Key frei, der Completion-Fehler nicht; `completeIdempotencyKey` pr�ft das `UPDATE` per `RETURNING` und wirft bei 0 Zeilen; Zustand `committed_unknown` in `http.ts:506-519`.",
    neu: "`http-route-support.ts:204-238`: der `run()`-Fehler gibt den Key frei, der Completion-Fehler nicht; `completeIdempotencyKey` pr�ft das `UPDATE` per `RETURNING` und wirft bei 0 Zeilen; Zustand `committed_unknown` in `http-route-support.ts:179-192`. (Die Zeilenverweise zeigten bis zum 26.10.2026 auf `http.ts:531-541` - die Datei hat seit dem Routen-Schnitt 275 statt 700+ Zeilen, der Beleg lag also hinter dem Dateiende.)",
  },
  // ---- docs/current/stand.md: R11 ----
  {
    datei: "docs/current/stand.md",
    alt: "Seit 20.10.2026 misst das Tor auch die 33 ausgelagerten Fachmodule der Engine (`store-*.ts`, `http-*.ts`)",
    neu: "Seit 20.10.2026 misst das Tor auch die ausgelagerten Fachmodule der Engine (`store-*.ts`, `http-*.ts`; Stand 26.10.2026: 38 und 25, zusammen 63)",
  },
];

for (const e of ersetzungen) {
  const roh = readFileSync(e.datei, "utf8");
  const treffer = roh.split(e.alt).length - 1;
  if (treffer !== 1) {
    console.error(`FEHLER ${e.datei}: Suchtext ${treffer}x gefunden (erwartet 1)`);
    console.error(`  Anfang: ${JSON.stringify(e.alt.slice(0, 80))}`);
    process.exit(1);
  }
  writeFileSync(e.datei, roh.replace(e.alt, e.neu), "utf8");
  console.log(`ok  ${e.datei}: ${e.alt.slice(0, 50)}... -> ersetzt`);
}
