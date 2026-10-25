// Gegenprobe zur Messung: ist der Ueberlauf spuerbar?
//
// Die These lautet: bei einem importierten Dokument (~1 700 Knoten) kostet
// EIN Store-Ereignis mehr als ein Frame - und zwar fuer Arbeit, die sich
// zwischen zwei Ereignissen NICHT aendert.
//
// Diese Probe trennt die zwei Anteile:
//   A) Arbeit, die vom Dokument abhaengt (Ebenenliste, Canvas-Baum).
//   B) Arbeit, die nur von der AUSWAHL abhaengt.
//
// Wenn A bei einer reinen Auswahl-Aenderung erneut laeuft, ist das der
// eigentliche Befund - nicht die absolute Zahl.
import { resolve } from "node:path";
import { runImport } from "@senify/framer-import";
import { buildEditorLayerList } from "../../packages/editor/src/explorer.ts";
import { canvasNodeTreeWithCopies } from "../../packages/editor/src/canvas/adapter.ts";
import { selectOne } from "../../packages/editor/src/state/selection.ts";

const run = await runImport({
  source: {
    kind: "mirror",
    rootDir: resolve("packages/framer-import/test/fixtures/framer-easier-train-154753"),
  },
  mode: "fidelity",
});
const document = run.mapped.document;
const ids = Object.keys(document.nodes);
console.log(`Knoten: ${ids.length}`);

// Die Ebene, die der Explorer tatsaechlich braucht: nur die SICHTBAREN
// Zeilen. Der Explorer baut aber zuerst ALLE und filtert danach.
const zeit = (fn: () => unknown, n = 40): number => {
  for (let i = 0; i < 5; i += 1) fn();
  const s: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now();
    fn();
    s.push(performance.now() - t0);
  }
  s.sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

// A: was bei JEDER Auswahl erneut laeuft
const alleEbenen = zeit(() => buildEditorLayerList(document));
const canvasBaum = zeit(() => canvasNodeTreeWithCopies(document));

// B: was eine Auswahl-Aenderung eigentlich braucht - ein neues Objekt
const nurAuswahl = zeit(() => selectOne({ selected: [], anchor: null, focus: null, expanded: [] }, ids[5]));

console.log(JSON.stringify({
  ebenenlisteMs: Number(alleEbenen.toFixed(2)),
  canvasBaumMs: Number(canvasBaum.toFixed(2)),
  auswahlMs: Number(nurAuswahl.toFixed(4)),
  faktor: Number(((alleEbenen + canvasBaum) / Math.max(nurAuswahl, 0.0001)).toFixed(0)),
  frameBudgetMs: 16.7,
  urteil: alleEbenen + canvasBaum > 16.7
    ? "Ein Auswahlklick kostet mehr als ein Frame, obwohl sich am Dokument nichts aendert."
    : "Innerhalb des Frame-Budgets.",
}, null, 2));
