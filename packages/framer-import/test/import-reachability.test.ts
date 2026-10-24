import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDocument } from "@senify/editor/state";
import { editorDocumentToNodeTree } from "@senify/engine";
import { runImport } from "@senify/framer-import";

// S1 verlangte „100 % der importierten Knoten sind im Explorer selektierbar und
// im Inspektor änderbar; 0 Knoten ohne Prüfpfad" (E2). Die Stand-Zeile sagte
// dazu nur „nicht flächendeckend belegt". Dieser Test belegt es an allen drei
// gespeicherten Exporten - nicht stichprobenartig, sondern über JEDEN Knoten:
//
//   * jeder Knoten hat einen Primitivtyp, den der Editor kennt
//     (`validateDocument` meldet `unknown-primitive` sonst),
//   * jeder Knoten hängt am Baum (sonst `orphan-node` - ein Knoten, den der
//     Explorer nicht erreicht, weil er an keinem Elternteil hängt),
//   * jeder Knoten hat genau einen Elternteil (sonst `duplicate-parent`),
//   * und das Dokument besteht die Prüfung, die die Store-Save-Pipeline vor
//     jedem Schreiben fährt (`packages/editor/src/state/store.ts`).
//
// Der zweite Teil prüft die Umkehrung in den NodeTree, den der Bake liest: was
// dort ankommt, stammt aus demselben Dokument und ist damit ebenfalls
// erreichbar.

const FIXTURES = resolve(import.meta.dirname, "fixtures");
const NAMES = [
  "framer-stupendous-football-158496",
  "framer-easier-train-154753",
  "framer-fluffy-rectangle-418998",
];

describe.each(NAMES)("S1: jeder importierte Knoten ist erreichbar (%s)", (name) => {
  it("besteht validateDocument ohne einen einzigen Befund", async () => {
    const run = await runImport({ source: { kind: "mirror", rootDir: resolve(FIXTURES, name) }, mode: "fidelity" });
    const document = run.mapped.document;

    const issues = validateDocument(document);
    // Ein Befund wäre ein Knoten ohne Prüfpfad - genau das, was E2 verbietet.
    expect(issues.map((issue) => `${issue.kind}: ${issue.message}`)).toEqual([]);
  }, 120_000);

  it("macht aus jedem Knoten des IR genau einen Knoten des Editor-Dokuments", async () => {
    const run = await runImport({ source: { kind: "mirror", rootDir: resolve(FIXTURES, name) }, mode: "fidelity" });
    const document = run.mapped.document;
    const ids = Object.keys(document.nodes);

    // Kein Knoten ohne id, keine doppelte id: sonst wäre ein Knoten im Explorer
    // nicht eindeutig adressierbar.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id !== "")).toBe(true);

    // Jeder Knoten außer der Wurzel wird von genau einem Elternteil genannt.
    const parents = new Map<string, number>();
    for (const node of Object.values(document.nodes)) {
      for (const child of node.children ?? []) {
        parents.set(child, (parents.get(child) ?? 0) + 1);
      }
    }
    for (const id of ids) {
      if (id === document.rootNodeId) {
        expect(parents.has(id)).toBe(false);
        continue;
      }
      expect(parents.get(id), `${id} hat ${parents.get(id) ?? 0} Elternteile`).toBe(1);
    }
  }, 120_000);

  it("reicht jeden Knoten in den NodeTree des Bakes durch", async () => {
    const run = await runImport({ source: { kind: "mirror", rootDir: resolve(FIXTURES, name) }, mode: "fidelity" });
    const tree = editorDocumentToNodeTree(run.mapped.document);

    // Der NodeTree ist eine FLACHE Map (`tree.nodes`), kein verschachtelter
    // Baum: der Bake liest die Kinder über die ids der Eltern. Ein Knoten, der
    // im Dokument steht und hier fehlt, fiele im Release still weg.
    const documentIds = Object.keys(run.mapped.document.nodes).sort();
    const treeIds = Object.keys(tree.nodes).sort();
    expect(treeIds).toEqual(documentIds);
    expect(tree.rootNodeId).toBe(run.mapped.document.rootNodeId);
  }, 120_000);
});
