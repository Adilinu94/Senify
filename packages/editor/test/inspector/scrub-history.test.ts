import { describe, expect, it } from "vitest";
import { scrubValue } from "../../src/inspector/scrub-number.ts";
import { EditorStore, typingCoalesceKey } from "../../src/state/store.ts";
import { createDocument } from "../../src/state/document.ts";

// Der Inspektor schreibt waehrend eines Zugs bei JEDER Bewegung einen neuen
// Wert - so laeuft die Zahl im Feld mit. Damit das nicht 60 Undo-Eintraege
// erzeugt, laeuft jeder Commit ueber denselben Coalesce-Schluessel
// (`typingCoalesceKey`, den der Store schon fuer Tipp-Bursts nutzt).
//
// Dieser Test faehrt den echten Pfad: scrubValue -> Store.apply mit Schluessel,
// und prueft, dass EIN Undo den ganzen Zug zuruecknimmt.
describe("Ziehen am Zahlenfeld: ein Zug ist ein Undo", () => {
  it("schreibt jeden Zwischenwert, hat aber nur einen History-Eintrag", () => {
    const store = new EditorStore({ document: createDocument(() => "n1") });
    const root = store.document.rootNodeId;
    store.apply({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "frame", id: "frame01" },
    });
    store.apply({
      op: "setNodeProp",
      id: "frame01",
      key: "width",
      value: 100,
    });
    const vorher = store.document.nodes["frame01"]?.props["width"];
    const eintraegeVorher = store.history.applied().length;

    // Ein Zug ueber 40 px mit Schrittweite 1: 4 -> 5 -> ... -> 110.
    const schluessel = typingCoalesceKey("frame01", "width");
    const werte: number[] = [];
    for (let dx = 4; dx <= 40; dx += 4) {
      const wert = scrubValue({ start: 100, deltaPx: dx, step: 1 });
      werte.push(wert);
      store.apply(
        { op: "setNodeProp", id: "frame01", key: "width", value: wert },
        { coalesceKey: schluessel },
      );
    }

    // Der letzte Zwischenwert steht im Dokument ...
    expect(store.document.nodes["frame01"]?.props["width"]).toBe(110);
    // ... und es gibt genau EINEN neuen Eintrag fuer den ganzen Zug.
    expect(store.history.applied()).toHaveLength(eintraegeVorher + 1);

    // Ein einziges Undo nimmt den ganzen Zug zurueck, nicht einen Schritt.
    store.undo();
    expect(store.document.nodes["frame01"]?.props["width"]).toBe(vorher);
    // Und das Redo bringt den Endwert zurueck.
    store.redo();
    expect(store.document.nodes["frame01"]?.props["width"]).toBe(110);
    // Die Zwischenwerte sind monoton - der Zug hat wirklich geschrieben.
    expect(werte).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
  });

  it("zwei verschiedene Felder sind zwei Undo-Eintraege", () => {
    const store = new EditorStore({ document: createDocument(() => "n1") });
    const root = store.document.rootNodeId;
    store.apply({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "frame", id: "frame01" },
    });
    store.apply({ op: "setNodeProp", id: "frame01", key: "width", value: 100 });
    const basis = store.history.applied().length;

    store.apply(
      { op: "setNodeProp", id: "frame01", key: "width", value: 120 },
      { coalesceKey: typingCoalesceKey("frame01", "width") },
    );
    store.apply(
      { op: "setNodeProp", id: "frame01", key: "height", value: 80 },
      { coalesceKey: typingCoalesceKey("frame01", "height") },
    );
    expect(store.history.applied()).toHaveLength(basis + 2);

    // Zwei Undos: erst die Hoehe, dann die Breite.
    store.undo();
    expect(store.document.nodes["frame01"]?.props["height"]).toBeUndefined();
    expect(store.document.nodes["frame01"]?.props["width"]).toBe(120);
    store.undo();
    expect(store.document.nodes["frame01"]?.props["width"]).toBe(100);
  });
});
