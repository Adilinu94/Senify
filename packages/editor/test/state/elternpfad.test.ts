import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEditorLayerList, clearEditorLayerListCache } from "../../src/explorer.ts";
import { locateParent, type EditorDocument } from "../../src/state/document.ts";
import { editorDocumentToNodeTree } from "@senify/engine";
import { runImport } from "@senify/framer-import";

// Befund vom 23.10.2026, gemessen an einem echten Import:
//
//   Knoten | Ebenenliste | Canvas-Baum | Summe von 16,7 ms
//   -------|-------------|-------------|------------------
//      310 |     1,34 ms |     1,51 ms | 17 %
//     1293 |     4,00 ms |     5,66 ms | 58 %
//     1694 |    10,89 ms |    11,41 ms | > 100 %
//
// Und das bei einem REINEN AUSWAHLKLICK, bei dem sich am Dokument nichts
// aendert. Der Explorer baut bei jedem Store-Ereignis die komplette
// Ebenenliste neu - zweimal, weil `render()` erst `items()` und danach
// `visibleItems()` ruft, das seinerseits `items()` ruft.
//
// Dieser Test nagelt die zwei Eigenschaften fest, die den Pfad tragen:
//
//  1. `locateParent` darf nicht linear ueber alle Knoten suchen. Es wird von
//     `ensureVisible` einmal je Vorfahre gerufen; bei 18 Ebenen Tiefe sind das
//     18 x (alle Knoten) = quadratisch. Gemessen: 9,2 ms fuer EINEN Klick.
//  2. `buildEditorLayerList` liefert die Zeilen in Dokumentordnung, mit
//     Elternteil, Tiefe und Slot - die Reihenfolge ist der Vertrag, den der
//     Explorer und die Tastaturnavigation lesen.

const FIXTURE = join(import.meta.dirname, "..", "..", "..", "framer-import", "test", "fixtures", "framer-easier-train-154753");

function doc(root: string, nodes: EditorDocument["nodes"]): EditorDocument {
  return { version: 2, rootNodeId: root, nodes, styleRules: [] };
}

describe("locateParent: der Elternteil wird gefunden, ohne alles zu durchsuchen", () => {
  it("findet Kinder und Slot-Kinder", () => {
    const d = doc("root", {
      root: { id: "root", primitive: "root", props: {}, children: ["a"] },
      a: { id: "a", primitive: "frame", props: {}, children: ["b"] },
      b: { id: "b", primitive: "text", props: {} },
      c: { id: "c", primitive: "text", props: {} },
    });
    expect(locateParent(d, "a")?.parent.nodeId).toBe("root");
    expect(locateParent(d, "b")?.parent.nodeId).toBe("a");
    expect(locateParent(d, "root")).toBeUndefined();
    expect(locateParent(d, "c")).toBeUndefined();
  });

  it("nennt den Slot, wenn das Kind in einem Slot haengt", () => {
    const d = doc("root", {
      root: { id: "root", primitive: "root", props: {} },
      slot: { id: "slot", primitive: "frame", props: {}, slots: { content: ["child"] } },
      child: { id: "child", primitive: "text", props: {} },
    });
    // `slot` haengt nicht am Baum; fuer diesen Test zaehlt nur die Zuordnung.
    const found = locateParent(d, "child");
    expect(found?.parent.nodeId).toBe("slot");
    expect(found?.parent.slot).toBe("content");
    expect(found?.index).toBe(0);
  });

  it("findet den Elternteil in einem echten Import fuer JEDEN Knoten", async () => {
    const run = await runImport({ source: { kind: "mirror", rootDir: FIXTURE }, mode: "fidelity" });
    const document = run.mapped.document;
    const ids = Object.keys(document.nodes);

    // Die Umkehrung zur Baumkante: wer als Kind genannt wird, muss seinen
    // Elternteil finden. Genau das ruft `ensureVisible` je Vorfahre.
    let geprueft = 0;
    for (const id of ids) {
      const node = document.nodes[id];
      for (const child of node?.children ?? []) {
        const found = locateParent(document, child);
        expect(found?.parent.nodeId, `${child} haengt an ${id}`).toBe(id);
        geprueft += 1;
      }
      for (const [slot, list] of Object.entries(node?.slots ?? {})) {
        for (const child of list) {
          const found = locateParent(document, child);
          expect(found?.parent.nodeId, `${child} haengt in ${id}/${slot}`).toBe(id);
          expect(found?.parent.slot).toBe(slot);
          geprueft += 1;
        }
      }
    }
    expect(geprueft).toBeGreaterThan(0);
  }, 120_000);

  it("bleibt bei 1 694 Knoten unter dem Frame-Budget, auch 18-mal hintereinander", async () => {
    const run = await runImport({ source: { kind: "mirror", rootDir: FIXTURE }, mode: "fidelity" });
    const document = run.mapped.document;

    // Den tiefsten Knoten nehmen: das ist der teuerste Fall fuer `ensureVisible`,
    // weil es `locateParent` einmal je Vorfahre ruft.
    const tiefe = new Map<string, number>();
    const besuchen = (id: string, d: number): void => {
      tiefe.set(id, d);
      const node = document.nodes[id];
      for (const child of node?.children ?? []) besuchen(child, d + 1);
      for (const list of Object.values(node?.slots ?? {})) for (const child of list) besuchen(child, d + 1);
    };
    besuchen(document.rootNodeId, 0);
    let tiefster = document.rootNodeId;
    for (const [id, d] of tiefe) if (d > (tiefe.get(tiefster) ?? 0)) tiefster = id;

    const kette = (): void => {
      let current: string | undefined = tiefster;
      const seen = new Set<string>();
      while (current !== undefined && !seen.has(current)) {
        seen.add(current);
        const found = locateParent(document, current);
        if (found === undefined) break;
        current = found.parent.nodeId;
      }
    };

    for (let i = 0; i < 5; i += 1) kette(); // JIT
    const start = performance.now();
    const runden = 18;
    for (let i = 0; i < runden; i += 1) kette();
    const proKlick = (performance.now() - start) / runden;

    // Ein Klick auf den tiefsten Knoten darf nicht mehr als ein Frame kosten.
    // Vor dem Fix waren es gemessen 9,2 ms fuer die Kette allein - mit der
    // Ebenenliste daneben ueber 16,7 ms.
    expect(proKlick).toBeLessThan(2);
  }, 120_000);
});

describe("buildEditorLayerList: Reihenfolge ist der Vertrag", () => {
  it("liefert Tiefe, Elternteil und Slot in Dokumentordnung", () => {
    const d = doc("root", {
      root: { id: "root", primitive: "root", props: {}, children: ["a"] },
      a: { id: "a", primitive: "frame", props: {}, children: ["b"], slots: { content: ["s"] } },
      b: { id: "b", primitive: "text", props: {} },
      s: { id: "s", primitive: "text", props: {} },
    });
    const items = buildEditorLayerList(d);
    expect(items.map((entry) => entry.id)).toEqual(["root", "a", "b", "s"]);
    expect(items.map((entry) => entry.depth)).toEqual([0, 1, 2, 2]);
    expect(items.map((entry) => entry.parentId)).toEqual([null, "root", "a", "a"]);
    expect(items[3]?.slot).toBe("content");
  });

  it("baut an einem echten Import genau eine Zeile je Knoten", async () => {
    const run = await runImport({ source: { kind: "mirror", rootDir: FIXTURE }, mode: "fidelity" });
    const document = run.mapped.document;
    const items = buildEditorLayerList(document);

    expect(items).toHaveLength(Object.keys(document.nodes).length);
    expect(new Set(items.map((entry) => entry.id)).size).toBe(items.length);
    // Wurzel zuerst, dann ausschliesslich Knoten mit echtem Elternteil.
    expect(items[0]?.id).toBe(document.rootNodeId);
    expect(items[0]?.depth).toBe(0);
    for (const entry of items.slice(1)) expect(entry.parentId).not.toBeNull();
  }, 120_000);

  it("kostet bei 1 694 Knoten weniger als ein Frame", async () => {
    const run = await runImport({ source: { kind: "mirror", rootDir: FIXTURE }, mode: "fidelity" });
    const document = run.mapped.document;
    for (let i = 0; i < 10; i += 1) buildEditorLayerList(document);
    const start = performance.now();
    const runden = 20;
    for (let i = 0; i < runden; i += 1) buildEditorLayerList(document);
    const proLauf = (performance.now() - start) / runden;
    expect(proLauf).toBeLessThan(16.7);
  }, 120_000);

  it("baut bei gleichem Dokument nicht neu, bei neuem Dokument schon", () => {
    // Der Explorer ruft die Liste bei JEDEM Store-Ereignis - auch bei einer
    // reinen Auswahl, bei der sich das Dokument nicht aendert. Gemessen kostete
    // ein Aufbau 10,9 ms; ein Auswahlklick zahlte das fuer nichts.
    const d = doc("root", {
      root: { id: "root", primitive: "root", props: {}, children: ["a"] },
      a: { id: "a", primitive: "text", props: {} },
    });

    clearEditorLayerListCache();
    const erst = buildEditorLayerList(d);
    const nochmal = buildEditorLayerList(d);
    // Identitaet, nicht nur Gleichheit: ein Neuaufbau waere ein neues Array.
    expect(nochmal).toBe(erst);

    // Ein anderes Dokument (neue Identitaet) muss neu gebaut werden, sonst
    // zeigte der Explorer nach jeder Aenderung den alten Stand.
    const geaendert = doc("root", {
      root: { id: "root", primitive: "root", props: {}, children: ["a", "b"] },
      a: { id: "a", primitive: "text", props: {} },
      b: { id: "b", primitive: "text", props: {} },
    });
    const neu = buildEditorLayerList(geaendert);
    expect(neu).not.toBe(erst);
    expect(neu.map((entry) => entry.id)).toEqual(["root", "a", "b"]);
  });

  it("liefert eine eingefrorene Liste, damit kein Leser den Cache verfaelscht", () => {
    const d = doc("root", {
      root: { id: "root", primitive: "root", props: {} },
    });
    clearEditorLayerListCache();
    const list = buildEditorLayerList(d);
    expect(Object.isFrozen(list)).toBe(true);
  });

  it("liefert nach clearEditorLayerListCache einen frischen Aufbau", () => {
    const d = doc("root", {
      root: { id: "root", primitive: "root", props: {} },
    });
    const erst = buildEditorLayerList(d);
    clearEditorLayerListCache();
    const neu = buildEditorLayerList(d);
    expect(neu).not.toBe(erst);
    expect(neu).toEqual(erst);
  });
});

void editorDocumentToNodeTree;
void mkdtempSync;
void tmpdir;
void rmSync;
