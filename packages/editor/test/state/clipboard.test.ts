import { describe, expect, it } from "vitest";
import {
  clearClipboard,
  copyNode,
  copiedNode,
  pasteNode,
  wrapNode,
} from "@senify/editor/state";
import { baseStore } from "./fixtures.ts";

// Ticket 03 point 2: copy/paste of a subtree and wrap in a container. Paste
// rides on `duplicateNode` (subtree + scoped rules, fresh ids); wrap is one
// atomic `applyBatch` step, so a single undo restores the original tree.

describe("editor clipboard", () => {
  it("copies a node and pastes it next to the target", () => {
    const store = baseStore();
    clearClipboard();
    expect(copyNode(store, "head000001")).toBe(true);
    expect(copiedNode()).toBe("head000001");
    const pasted = pasteNode(store, "head000001");
    expect(pasted).not.toBeNull();
    expect(pasted).not.toBe("head000001");
    // The heading lives in the section; the paste lands right after it.
    expect(store.document.nodes["sec0000001"]?.children).toEqual([
      "head000001",
      pasted,
    ]);
    // The copy carries the props of the source.
    if (pasted !== null) {
      expect(store.document.nodes[pasted]?.props["text"]).toBe("Hallo");
    }
    // One undo removes the paste again.
    expect(store.undo()).toBe(true);
    expect(store.document.nodes["sec0000001"]?.children).toEqual(["head000001"]);
  });

  it("refuses the root and reports a stale clipboard instead of guessing", () => {
    const store = baseStore();
    clearClipboard();
    expect(copyNode(store, store.document.rootNodeId)).toBe(false);
    expect(copyNode(store, "missing")).toBe(false);
    expect(copiedNode()).toBeNull();
    // A copied node that vanished before the paste clears the clipboard.
    expect(copyNode(store, "head000001")).toBe(true);
    store.apply({ op: "deleteNode", id: "head000001" }, { label: "Ebene löschen" });
    expect(pasteNode(store, null)).toBeNull();
    expect(copiedNode()).toBeNull();
  });

  it("wraps a node in a fresh container as one undo step", () => {
    const store = baseStore();
    const before = store.history.applied().length;
    const container = wrapNode(store, "head000001");
    expect(container).not.toBeNull();
    expect(store.history.applied()).toHaveLength(before + 1);
    if (container === null) return;
    const wrapper = store.document.nodes[container];
    expect(wrapper?.primitive).toBe("frame");
    expect(wrapper?.children).toEqual(["head000001"]);
    const section = store.document.nodes["sec0000001"];
    expect(section?.children).toEqual([container]);
    // One undo: the heading is back in the section, the container is gone.
    expect(store.undo()).toBe(true);
    expect(store.document.nodes[container]).toBeUndefined();
    expect(store.document.nodes["sec0000001"]?.children).toEqual(["head000001"]);
    // Redo brings the wrap back.
    expect(store.redo()).toBe(true);
    expect(store.document.nodes["sec0000001"]?.children).toEqual([container]);
  });

  it("keeps an atomic batch together when one step is invalid", () => {
    const store = baseStore();
    const before = store.document.nodes[store.document.rootNodeId]?.children;
    expect(() =>
      store.applyBatch([
        { op: "insertNode", parent: { nodeId: store.document.rootNodeId }, node: { primitive: "frame" } },
        { op: "deleteNode", id: store.document.rootNodeId },
      ]),
    ).toThrow();
    expect(store.document.nodes[store.document.rootNodeId]?.children).toEqual(before);
  });
});
