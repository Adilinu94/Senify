import { describe, expect, it } from "vitest";
import { canvasNodeTreeWithCopies } from "../../src/canvas/adapter.ts";
import { invalidateCanvasTreeCache } from "../../src/state/canvas-tree-cache.ts";
import type { EditorDocument } from "../../src/state/document.ts";

// Der Canvas baut bei jedem Store-Ereignis einen neuen Baum - auch bei einer
// reinen Auswahl, bei der sich das Dokument nicht aendert. Gemessen an einem
// echten Import (1 694 Knoten): 9,6 ms pro Aufbau, und der React-Renderer
// konnte seinen eigenen Cache nie nutzen, weil er jedes Mal ein neues Objekt
// bekam. Also wurde der ganze Baum fuer einen Klick neu gerendert, der nur den
// Selektionsring bewegt.
//
// Der Cache haengt an der Dokument-Identitaet. Diese Tests halten beide
// Richtungen fest: gleicher Aufbau bei gleichem Dokument, NEUER Aufbau bei
// jedem Schreibvorgang. Die zweite Richtung ist die gefaehrliche - ein
// faelschlich getroffener Cache zeigte im Editor die Seite von vorher.

function doc(nodes: EditorDocument["nodes"]): EditorDocument {
  return { version: 2, rootNodeId: "root", nodes, styleRules: [] };
}

describe("canvasNodeTreeWithCopies: Cache nach Dokument-Identitaet", () => {
  it("baut bei gleichem Dokument nicht neu", () => {
    invalidateCanvasTreeCache();
    const d = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["a"] },
      a: { id: "a", primitive: "text", props: { text: "Hallo" } },
    });
    const erst = canvasNodeTreeWithCopies(d);
    const nochmal = canvasNodeTreeWithCopies(d);
    expect(nochmal).toBe(erst);
    expect(nochmal.tree).toBe(erst.tree);
  });

  it("baut bei einem neuen Dokument neu", () => {
    invalidateCanvasTreeCache();
    const vorher = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["a"] },
      a: { id: "a", primitive: "text", props: { text: "Hallo" } },
    });
    const erst = canvasNodeTreeWithCopies(vorher);

    // So sieht ein Schreibvorgang aus: ein neues Dokument-Objekt.
    const nachher = doc({
      root: { id: "root", primitive: "root", props: {}, children: ["a", "b"] },
      a: { id: "a", primitive: "text", props: { text: "Hallo" } },
      b: { id: "b", primitive: "text", props: { text: "Welt" } },
    });
    const neu = canvasNodeTreeWithCopies(nachher);
    expect(neu).not.toBe(erst);
    expect(Object.keys(neu.tree.nodes)).toContain("b");
    expect(Object.keys(erst.tree.nodes)).not.toContain("b");
  });

  it("gibt nach invalidateCanvasTreeCache einen frischen Baum", () => {
    const d = doc({
      root: { id: "root", primitive: "root", props: {} },
    });
    const erst = canvasNodeTreeWithCopies(d);
    invalidateCanvasTreeCache();
    const neu = canvasNodeTreeWithCopies(d);
    expect(neu).not.toBe(erst);
  });
});
