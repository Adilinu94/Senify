import { describe, expect, it } from "vitest";
import {
  applyDocumentPatches,
  applyEditorMutation,
  createDocument,
  validateDocument,
  type EditorDocument,
} from "@senify/editor/state";
import { parseEditorMutation, type EditorMutation } from "@senify/engine";
import { baseStore, counterIds, makeStore } from "./fixtures.ts";

function nextOf(
  document: EditorDocument,
  mutation: EditorMutation,
): EditorDocument {
  const result = applyEditorMutation(document, mutation, { idFactory: counterIds() });
  return applyDocumentPatches(document, result.forward);
}

describe("structure operations", () => {
  it("rejects a child the catalog does not allow, with a clear message", () => {
    const store = makeStore();
    const root = store.document.rootNodeId;
    store.apply({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "list", id: "list000001" },
    });
    expect(() =>
      store.apply({
        op: "insertNode",
        parent: { nodeId: "list000001" },
        node: { primitive: "button", id: "btn0000001" },
      }),
    ).toThrow(/does not allow child "button"/);
  });

  it("rejects an unknown primitive", () => {
    const store = makeStore();
    expect(() =>
      store.apply({
        op: "insertNode",
        parent: { nodeId: store.document.rootNodeId },
        node: { primitive: "nope" },
      }),
    ).toThrow(/Unknown primitive "nope"/);
  });

  it("refuses to insert the root again", () => {
    const store = makeStore();
    expect(() =>
      store.apply({
        op: "insertNode",
        parent: { nodeId: store.document.rootNodeId },
        node: { primitive: "root" },
      }),
    ).toThrow(/root cannot be inserted/);
  });

  it("moves a node and refuses to move it into its own subtree", () => {
    const store = makeStore();
    const root = store.document.rootNodeId;
    store.apply({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "frame", id: "frame000001" },
    });
    store.apply({
      op: "insertNode",
      parent: { nodeId: "frame000001" },
      node: { primitive: "frame", id: "frame000002" },
    });
    expect(() =>
      store.apply({
        op: "moveNode",
        id: "frame000001",
        target: { nodeId: "frame000002" },
      }),
    ).toThrow(/own subtree/);
    expect(() =>
      store.apply({
        op: "moveNode",
        id: "frame000002",
        target: { nodeId: root },
        index: 0,
      }),
    ).not.toThrow();
    expect(store.document.nodes[root]?.children).toEqual([
      "frame000002",
      "frame000001",
    ]);
  });

  it("duplicates a subtree with fresh ids", () => {
    const store = baseStore();
    const before = Object.keys(store.document.nodes).length;
    store.apply({ op: "duplicateNode", id: "sec0000001" });
    const ids = Object.keys(store.document.nodes);
    expect(ids.length).toBe(before + 2);
    const headings = ids.filter(
      (id) => store.document.nodes[id]?.primitive === "heading",
    );
    expect(headings).toHaveLength(2);
  });

  it("deletes a subtree and can undo it", () => {
    const store = baseStore();
    store.apply({ op: "deleteNode", id: "sec0000001" });
    expect(store.document.nodes["sec0000001"]).toBeUndefined();
    expect(store.document.nodes["head000001"]).toBeUndefined();
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
  });

  it("refuses to delete the root", () => {
    const store = baseStore();
    expect(() =>
      store.apply({ op: "deleteNode", id: store.document.rootNodeId }),
    ).toThrow(/root cannot be deleted/);
  });
});

describe("property writes per device", () => {
  it("sets and clears a device value so inheritance takes over again", () => {
    const store = baseStore();
    store.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "fontSize",
      value: 18,
      device: "tablet",
    });
    expect(store.document.nodes["head000001"]?.props["fontSize_tablet"]).toBe(18);
    store.apply({
      op: "clearNodeProp",
      id: "head000001",
      key: "fontSize",
      device: "tablet",
    });
    expect(store.document.nodes["head000001"]?.props["fontSize_tablet"]).toBeUndefined();
    expect(store.document.nodes["head000001"]?.props["fontSize"]).toBe(24);
  });

  it("warns when a device value has no broader value to inherit from", () => {
    const store = makeStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "heading", id: "head000001" },
    });
    const outcome = store.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "fontSize",
      value: 14,
      device: "mobile",
    });
    expect(outcome.warnings[0]).toMatch(/No broader value/);
  });

  it("rejects an unknown property and a wrong value type", () => {
    const store = baseStore();
    expect(() =>
      store.apply({ op: "setNodeProp", id: "head000001", key: "bogus", value: 1 }),
    ).toThrow(/Unknown property "bogus"/);
    expect(() =>
      store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: 5 }),
    ).toThrow(/must be a string/);
  });
});

describe("class operations", () => {
  it("assigns, removes and renames classes", () => {
    const store = baseStore();
    expect(() =>
      store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" }),
    ).toThrow(/Unknown style class "cta"/);
    store.apply({ op: "createStyleRule", name: "cta", props: { background: "#f00" } });
    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    expect(store.document.nodes["btn0000001"]?.classes).toEqual(["cta"]);
    store.apply({ op: "renameClass", from: "cta", to: "hero-cta" });
    expect(store.document.nodes["btn0000001"]?.classes).toEqual(["hero-cta"]);
    expect(store.document.classes["hero-cta"]).toEqual({ background: "#f00" });
    expect(store.document.classes["cta"]).toBeUndefined();
    store.apply({ op: "removeClass", id: "btn0000001", classId: "hero-cta" });
    expect(store.document.nodes["btn0000001"]?.classes).toBeUndefined();
  });

  it("rejects removing a class that is not assigned", () => {
    const store = baseStore();
    store.apply({ op: "createStyleRule", name: "cta", props: { color: "#fff" } });
    expect(() =>
      store.apply({ op: "removeClass", id: "btn0000001", classId: "cta" }),
    ).toThrow(/not assigned/);
  });

  it("rejects a rename onto an existing name and a missing source", () => {
    const store = baseStore();
    store.apply({ op: "createStyleRule", name: "a", props: { color: "#000" } });
    store.apply({ op: "createStyleRule", name: "b", props: { color: "#111" } });
    expect(() =>
      store.apply({ op: "renameClass", from: "a", to: "b" }),
    ).toThrow(/already exists/);
    expect(() =>
      store.apply({ op: "renameClass", from: "missing", to: "c" }),
    ).toThrow(/does not exist/);
  });
});

describe("style rules", () => {
  it("creates, updates and deletes a rule", () => {
    const store = baseStore();
    expect(() =>
      store.apply({ op: "createStyleRule", name: "cta", props: { nope: "x" } }),
    ).toThrow(/Unknown style property "nope"/);
    store.apply({
      op: "createStyleRule",
      name: "cta",
      props: { background: "#f00", color: "#fff" },
    });
    expect(() =>
      store.apply({ op: "createStyleRule", name: "cta", props: { color: "#000" } }),
    ).toThrow(/already exists/);
    store.apply({
      op: "updateStyleRule",
      name: "cta",
      props: { color: null, fontSize: 20 },
    });
    expect(store.document.classes["cta"]).toEqual({ background: "#f00", fontSize: 20 });
    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    store.apply({ op: "deleteStyleRule", name: "cta" });
    expect(store.document.classes["cta"]).toBeUndefined();
    expect(store.document.nodes["btn0000001"]?.classes).toBeUndefined();
    expect(validateDocument(store.document)).toEqual([]);
  });
});

describe("slots and collection entries", () => {
  it("sets slot content and rejects unknown slots", () => {
    const store = makeStore();
    const root = store.document.rootNodeId;
    store.apply({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "collection", id: "col0000001" },
    });
    expect(() =>
      store.apply({
        op: "setSlotContent",
        id: "col0000001",
        slot: "nope",
        nodes: [],
      }),
    ).toThrow(/no slot "nope"/);
    store.apply({
      op: "setSlotContent",
      id: "col0000001",
      slot: "item",
      nodes: [{ primitive: "text", id: "text000001", props: { text: "A" } }],
    });
    expect(store.document.nodes["col0000001"]?.slots?.["item"]).toEqual([
      "text000001",
    ]);
    store.apply({
      op: "setSlotContent",
      id: "col0000001",
      slot: "item",
      nodes: [{ primitive: "text", id: "text000002", props: { text: "B" } }],
    });
    expect(store.document.nodes["col0000001"]?.slots?.["item"]).toEqual([
      "text000002",
    ]);
    expect(store.document.nodes["text000001"]).toBeUndefined();
  });

  it("creates and updates a collection entry, enforcing the item slot max", () => {
    const store = makeStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "collection", id: "col0000001" },
    });
    store.apply({
      op: "createCollectionEntry",
      id: "col0000001",
      node: { primitive: "text", id: "text000001", props: { text: "A" } },
    });
    expect(() =>
      store.apply({
        op: "createCollectionEntry",
        id: "col0000001",
        node: { primitive: "text", props: { text: "B" } },
      }),
    ).toThrow(/item slot of "collection" is full/);
    store.apply({
      op: "updateCollectionEntry",
      id: "col0000001",
      index: 0,
      patch: { text: "Neu" },
    });
    expect(store.document.nodes["text000001"]?.props["text"]).toBe("Neu");
    expect(() =>
      store.apply({
        op: "updateCollectionEntry",
        id: "col0000001",
        index: 5,
        patch: { text: "X" },
      }),
    ).toThrow(/No collection entry at index 5/);
  });

  it("rejects collection ops on a non-collection", () => {
    const store = baseStore();
    expect(() =>
      store.apply({
        op: "createCollectionEntry",
        id: "sec0000001",
        node: { primitive: "text" },
      }),
    ).toThrow(/is not a collection/);
  });
});

describe("operation patches round-trip", () => {
  it("forwards and inverts every op through its patch list", () => {
    const store = baseStore();
    const document = store.document;
    const mutations: EditorMutation[] = [
      { op: "createStyleRule", name: "cta", props: { background: "#f00" } },
      { op: "assignClass", id: "btn0000001", classId: "cta" },
      { op: "setNodeProp", id: "head000001", key: "fontSize", value: 18, device: "tablet" },
      { op: "insertNode", parent: { nodeId: "sec0000001" }, node: { primitive: "text", id: "text000001" } },
    ];
    let current = document;
    for (const mutation of mutations) {
      const parsed = parseEditorMutation(mutation);
      const result = applyEditorMutation(current, parsed, { idFactory: counterIds() });
      const next = applyDocumentPatches(current, result.forward);
      const back = applyDocumentPatches(next, result.inverse);
      expect(back).toEqual(current);
      current = next;
    }
  });
});

describe("editor contract", () => {
  it("rejects unknown ops and bad shapes with a field path", () => {
    expect(() => parseEditorMutation({ op: "nope" })).toThrow(/Unknown editor mutation/);
    try {
      parseEditorMutation({ op: "setNodeProp", id: "", key: "x", value: 1 });
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as { field?: string }).field).toMatch(/^mutations\[0\]\./);
    }
    expect(() =>
      parseEditorMutation({ op: "setNodeProp", id: "x", key: "k", value: 1, device: "tv" }),
    ).toThrow(/device/);
  });

  it("parses a valid batch", () => {
    const mutation = parseEditorMutation({
      op: "setNodeProp",
      id: "head000001",
      key: "fontSize",
      value: 20,
    });
    expect(mutation.op).toBe("setNodeProp");
  });
});

describe("document next-state helper", () => {
  it("applies an operation to a hand-built document", () => {
    const document = createDocument(counterIds("r"));
    const next = nextOf(document, {
      op: "insertNode",
      parent: { nodeId: document.rootNodeId },
      node: { primitive: "heading", id: "head000001" },
    });
    expect(next.nodes["head000001"]?.primitive).toBe("heading");
  });
});
