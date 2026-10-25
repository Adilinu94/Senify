// Messung: was kostet die Ebenenliste an einem echt importierten Dokument?
//
// `explorer/panel.ts` ruft bei JEDEM Store-Ereignis `items()` ->
// `buildEditorLayerList(document)` und baut daraus die sichtbaren Zeilen neu
// auf. Es gibt keine Virtualisierung und kein Culling. Diese Messung sagt, ob
// das bei einem echten Framer-Import (2 958 Knoten) noch tragbar ist.
import { resolve } from "node:path";
import { runImport } from "@senify/framer-import";
// Direkt aus der Quelle: `buildEditorLayerList` steht nicht im Paket-Export,
// wird aber genau so von `explorer/panel.ts` aufgerufen.
import { buildEditorLayerList } from "../../packages/editor/src/explorer.ts";

const FIXTURE = resolve(
  "packages/framer-import/test/fixtures/framer-stupendous-football-158496",
);

const run = await runImport({ source: { kind: "mirror", rootDir: FIXTURE }, mode: "fidelity" });
const document = run.mapped.document;
const nodeCount = Object.keys(document.nodes).length;

// Genau der Aufruf aus panel.ts.
const einmal = (): number => {
  const start = performance.now();
  buildEditorLayerList(document);
  return performance.now() - start;
};

// Aufwaermen (JIT), dann messen.
for (let i = 0; i < 20; i += 1) einmal();

const samples: number[] = [];
for (let i = 0; i < 200; i += 1) samples.push(einmal());
samples.sort((a, b) => a - b);
const median = samples[Math.floor(samples.length / 2)] ?? 0;
const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
const max = samples[samples.length - 1] ?? 0;

const items = buildEditorLayerList(document);

console.log(JSON.stringify({
  knoten: nodeCount,
  ebenenZeilen: items.length,
  medianMs: Math.round(median * 100) / 100,
  p95Ms: Math.round(p95 * 100) / 100,
  maxMs: Math.round(max * 100) / 100,
  // Ein Frame bei 60 Hz sind 16,7 ms. Das ist das Budget fuer ALLES
  // (Ebenenliste, Canvas, Inspektor) zusammen.
  budgetMs: 16.7,
}, null, 2));
