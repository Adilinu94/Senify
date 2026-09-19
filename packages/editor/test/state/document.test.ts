import { describe, expect, it } from "vitest";
import {
  collectSubtree,
  createDocument,
  documentOrder,
  locateParent,
  toCssDocument,
  classRules,
  type EditorDocument,
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
});
