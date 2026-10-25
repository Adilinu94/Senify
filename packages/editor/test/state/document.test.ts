import { describe, expect, it } from "vitest";
import {
  collectSubtree,
  createDocument,
  documentOrder,
  locateParent,
  toCssDocument,
  classRules,
  editorSlotSpecs,
  slotIds,
  type EditorDocument,
  type EditorNode,
} from "@senify/editor/state";
import { baseStore, counterIds, emptyV2Document } from "./fixtures.ts";

describe("document", () => {
  it("creates a root document with version 2", () => {
    const document = createDocument(counterIds("r"));
    expect(document.version).toBe(2);
    expect(document.rootNodeId).toBe("r000000001");
    expect(document.nodes[document.rootNodeId]?.primitive).toBe("root");
    expect(document.styleRules).toEqual([]);
  });

  it("walks children then slots in document order", () => {
    const document: EditorDocument = {
      version: 2,
      rootNodeId: "root",
      nodes: {
        root: { id: "root", primitive: "root", props: {}, children: ["a", "b"] },
        a: { id: "a", primitive: "frame", props: {}, children: ["a1"] },
        a1: { id: "a1", primitive: "text", props: {} },
        b: { id: "b", primitive: "frame", props: {}, slots: { item: ["b1"] } },
        b1: { id: "b1", primitive: "text", props: {} },
      },
      styleRules: [],
    };
    expect(documentOrder(document)).toEqual(["root", "a", "a1", "b", "b1"]);
  });

  it("locates a parent through children and slots", () => {
    const store = baseStore();
    const document = store.document;
    expect(locateParent(document, "head000001")).toEqual({
      parent: { nodeId: "sec0000001" },
      index: 0,
    });
  });

  it("collects a subtree parents before children", () => {
    const store = baseStore();
    const ids = collectSubtree(store.document, "sec0000001").map((node) => node.id);
    expect(ids).toEqual(["sec0000001", "head000001"]);
  });

  it("maps the document to the compiler shape with class rules", () => {
    const store = baseStore();
    store.apply({
      op: "upsertStyleRule",
      rule: {
        id: "r-cta",
        name: "cta",
        kind: "class",
        selector: ".cta",
        order: 0,
        styles: { background: "#ff0000" },
        contextStyles: {},
      },
    });
    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    const css = toCssDocument(store.document);
    expect(css.nodes).toHaveLength(1);
    expect(css.nodes[0]?.primitive).toBe("root");
    // The rule reaches the compiler in its canonical shape.
    expect(css.classRules).toEqual([
      {
        name: "cta",
        props: { background: "#ff0000" },
        kind: "class",
        selector: ".cta",
      },
    ]);
    expect(classRules(store.document)).toEqual(css.classRules);
  });

  it("serialises an empty document the same way it was built", () => {
    const document = emptyV2Document();
    expect(structuredClone(document)).toEqual(document);
  });

  it("überspringt fehlende und mehrfach referenzierte Nodes in der Dokumentreihenfolge", () => {
    const document: EditorDocument = {
      ...emptyV2Document(),
      rootNodeId: "root",
      nodes: {
        root: { id: "root", primitive: "root", props: {}, children: ["missing", "text", "text"], slots: { side: ["text"] } },
        text: { id: "text", primitive: "text", props: {} },
      },
    };
    expect(documentOrder(document)).toEqual(["root", "text"]);
    expect(documentOrder({ ...document, rootNodeId: "missing" })).toEqual([]);
    expect(collectSubtree(document, "missing")).toEqual([]);
    expect(slotIds(document.nodes.root!, "missing")).toEqual([]);
  });

  it("filtert fehlende CSS-Kinder und erhält Slots samt leeren Listen", () => {
    const document: EditorDocument = {
      ...emptyV2Document(), rootNodeId: "root",
      nodes: {
        root: { id: "root", primitive: "root", props: {}, children: ["missing"], slots: { side: ["missing", "text"], empty: [] }, classes: [] },
        text: { id: "text", primitive: "text", props: { text: "Inhalt" } },
      },
    };
    expect(toCssDocument(document).nodes).toEqual([{
      id: "root", primitive: "root", props: {},
      slots: { side: [{ id: "text", primitive: "text", props: { text: "Inhalt" } }], empty: [] },
    }]);
    expect(toCssDocument({ ...document, rootNodeId: "missing" }).nodes).toEqual([]);
  });

  it.each([undefined, 1, "missing", "ordinary"])("leitet keine Slots aus ungültigen Komponentenverweisen ab: %j", (componentId) => {
    const document = emptyV2Document();
    document.nodes.ordinary = { id: "ordinary", primitive: "frame", props: {} };
    const owner: EditorNode = { id: "instance", primitive: "__component_instance", props: componentId === undefined ? {} : { componentId } };
    expect(editorSlotSpecs(document, owner)).toEqual({});
    expect(editorSlotSpecs(document, { ...owner, primitive: "unknown" })).toEqual({});
  });

  it("liest verschachtelte Komponenten-Slots, filtert Typen und behält die erste Deklaration", () => {
    const document: EditorDocument = {
      ...emptyV2Document(),
      nodes: {
        definition: { id: "definition", primitive: "__component", props: {}, children: ["frame", "duplicate"] },
        frame: { id: "frame", primitive: "frame", props: {}, children: ["missing", "content"], slots: { side: ["unnamed"] } },
        content: { id: "content", primitive: "__component_slot", props: { name: "content", allowedTypes: ["text", "", 1, "heading"], max: 2.9 }, children: ["ignored"] },
        duplicate: { id: "duplicate", primitive: "__component_slot", props: { name: "content", allowedTypes: ["image"], max: 9 } },
        unnamed: { id: "unnamed", primitive: "__component_slot", props: {} },
        ignored: { id: "ignored", primitive: "__component_slot", props: { name: "ignored" } },
      },
    };
    const owner: EditorNode = { id: "instance", primitive: "__component_instance", props: { componentId: "definition" } };
    expect(editorSlotSpecs(document, owner)).toEqual({
      content: { allowedTypes: ["text", "heading"], max: 2 },
      unnamed: { allowedTypes: [], max: null },
    });
    expect(editorSlotSpecs({ ...document, nodes: { definition: { id: "definition", primitive: "__component", props: {} } } }, owner)).toEqual({});
  });

  it.each([undefined, "2", -1, Infinity, NaN, 0])("normalisiert die maximale Slot-Belegung: %j", (max) => {
    const document: EditorDocument = {
      ...emptyV2Document(),
      nodes: {
        definition: { id: "definition", primitive: "__component", props: {}, children: ["slot"] },
        slot: { id: "slot", primitive: "__component_slot", props: { name: "content", ...(max === undefined ? {} : { max }) } },
      },
    };
    expect(editorSlotSpecs(document, { id: "instance", primitive: "__component_instance", props: { componentId: "definition" } })).toEqual({
      content: { allowedTypes: [], max: max === 0 ? 0 : null },
    });
  });
});
