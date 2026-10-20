import { describe, expect, it } from "vitest";
import {
  EditorStore,
  dragCoalesceKey,
  typingCoalesceKey,
  type EditorDocument,
} from "@senify/editor/state";
import { baseStore, counterIds, makeStore } from "./fixtures.ts";

describe("store write gate", () => {
  it("applies a mutation and walks undo / redo", () => {
    const store = baseStore();
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neu" });
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Neu");
    expect(store.canUndo).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
    expect(store.canRedo).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Neu");
  });

  it("reports a no-op as unchanged and records nothing", () => {
    const store = baseStore();
    const before = store.history.applied().length;
    const outcome = store.apply({
      op: "clearNodeProp",
      id: "head000001",
      key: "fontSize",
      device: "tablet",
    });
    expect(outcome.changed).toBe(false);
    expect(store.history.applied()).toHaveLength(before);
  });

  it("counts one history entry per change, not per version", () => {
    const store = baseStore();
    const version = store.version;
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "A" });
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "B" });
    expect(store.version).toBe(version + 2);
  });

  it("refuses a change that would leave the document inconsistent", () => {
    const broken: EditorDocument = {
      version: 2,
      rootNodeId: "root",
      nodes: { root: { id: "root", primitive: "root", props: {}, children: ["gone"] } },
      styleRules: [],
    };
    const store = new EditorStore({ document: broken, idFactory: counterIds() });
    expect(() =>
      store.apply({ op: "setNodeProp", id: "root", key: "background", value: "#ffffff" }),
    ).toThrow(/Refusing an inconsistent change/);
  });

  it("jumps to a history entry through the ordinary undo/redo gate", () => {
    const store = baseStore();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "A" });
    const first = store.history.top();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "B" });
    const second = store.history.top();
    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "C" });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (first === null || second === null) return;
    // Back to the state right after the first entry (A) …
    expect(store.restoreTo(first.id)).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("A");
    expect(store.canRedo).toBe(true);
    // … and forward again to the second (B).
    expect(store.restoreTo(second.id)).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("B");
    // An unknown entry is refused without touching the document.
    expect(store.restoreTo("missing")).toBe(false);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("B");
  });
});

describe("the selection names only nodes that exist", () => {
  it("drops the selection when the undo removes the selected node", () => {
    const store = baseStore();
    store.select("head000001");
    expect(store.selection.selected).toEqual(["head000001"]);

    // The undo of the insert that brought the node in removes it again.
    store.undo();
    store.undo();

    expect(store.document.nodes["head000001"]).toBeUndefined();
    expect(store.selection.selected).toEqual([]);
    expect(store.selection.focus).toBeNull();
  });

  it("keeps a selection whose nodes are still there", () => {
    const store = baseStore();
    store.select("head000001");

    store.apply({ op: "setNodeProp", id: "head000001", key: "text", value: "Neu" });

    expect(store.selection.selected).toEqual(["head000001"]);
    expect(store.selection.focus).toBe("head000001");
  });
});

describe("coalescing", () => {
  it("folds a typing burst into one undo entry", () => {
    const store = baseStore();
    const key = typingCoalesceKey("head000001", "text");
    for (const value of ["H", "Ha", "Hal"]) {
      store.apply(
        { op: "setNodeProp", id: "head000001", key: "text", value },
        { coalesceKey: key },
      );
    }
    expect(store.history.top()?.mutations).toHaveLength(3);
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hallo");
    expect(store.redo()).toBe(true);
    expect(store.document.nodes["head000001"]?.props["text"]).toBe("Hal");
  });

  it("folds a drag into one undo entry", () => {
    const store = makeStore();
    const root = store.document.rootNodeId;
    for (const id of ["sec0000001", "btn0000001", "frame000001"]) {
      store.apply({
        op: "insertNode",
        parent: { nodeId: root },
        node: { primitive: id === "sec0000001" ? "section" : id === "btn0000001" ? "button" : "frame", id },
      });
    }
    const start = [...(store.document.nodes[root]?.children ?? [])];
    const before = store.history.applied().length;
    const key = dragCoalesceKey("frame000001");
    store.apply(
      { op: "moveNode", id: "frame000001", target: { nodeId: root }, index: 0 },
      { coalesceKey: key },
    );
    store.apply(
      { op: "moveNode", id: "frame000001", target: { nodeId: root }, index: 1 },
      { coalesceKey: key },
    );
    expect(store.history.applied()).toHaveLength(before + 1);
    const final = [...(store.document.nodes[root]?.children ?? [])];
    expect(final).not.toEqual(start);
    store.undo();
    expect(store.document.nodes[root]?.children).toEqual(start);
    store.redo();
    expect(store.document.nodes[root]?.children).toEqual(final);
  });
});

describe("store selection", () => {
  it("selects a node and reveals it", () => {
    const store = baseStore();
    store.select("head000001");
    expect(store.selection.selected).toEqual(["head000001"]);
    expect(store.selection.expanded).toContain("sec0000001");
    store.selectParent();
    expect(store.selection.selected).toEqual(["sec0000001"]);
    store.clearSelection();
    expect(store.selection.selected).toEqual([]);
  });
});
