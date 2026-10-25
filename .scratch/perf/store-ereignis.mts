// Messung: was kostet EIN Store-Ereignis an einem echten importierten Dokument?
//
// Bei jedem Store-Ereignis laufen drei Dinge nacheinander:
//   1. `canvas.refresh()`: `canvasNodeTreeWithCopies` + `frameRules` (ein
//      Compiler-Lauf) + ein React-`renderEntry` je Geruest.
//   2. `explorer`: `buildEditorLayerList` ueber ALLE Knoten + Neuaufbau der
//      sichtbaren Zeilen (keine Virtualisierung).
//   3. `inspector.render()`: `root.textContent = ""` und alles neu.
//
// Diese Messung nimmt die zwei reinen Teile (1 vor React, 2), weil sie ohne
// Browser laufen. Sie sagt, ob die Architektur bei Importgroesse traegt.
import { resolve } from "node:path";
import { runImport } from "@senify/framer-import";
import { buildEditorLayerList } from "../../packages/editor/src/explorer.ts";
import { canvasNodeTreeWithCopies } from "../../packages/editor/src/canvas/adapter.ts";

const FIXTURES = [
  "framer-stupendous-football-158496",
  "framer-fluffy-rectangle-418998",
  "framer-easier-train-154753",
];

const zeit = (fn: () => unknown, runden = 60): number => {
  for (let i = 0; i < 10; i += 1) fn(); // JIT
  const samples: number[] = [];
  for (let i = 0; i < runden; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
};

const zeilen: string[] = [];
for (const name of FIXTURES) {
  const run = await runImport({
    source: { kind: "mirror", rootDir: resolve("packages/framer-import/test/fixtures", name) },
    mode: "fidelity",
  });
  const document = run.mapped.document;
  const knoten = Object.keys(document.nodes).length;

  const ebene = zeit(() => buildEditorLayerList(document));
  const baum = zeit(() => canvasNodeTreeWithCopies(document));

  zeilen.push(
    `${name}\n` +
      `  Knoten:        ${knoten}\n` +
      `  Ebenenliste:   ${ebene.toFixed(2)} ms\n` +
      `  Canvas-Baum:   ${baum.toFixed(2)} ms\n` +
      `  Summe (2x):    ${(ebene + baum).toFixed(2)} ms von 16.7 ms\n`,
  );
}
console.log(zeilen.join("\n"));
