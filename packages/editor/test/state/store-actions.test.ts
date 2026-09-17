import { describe, expect, it } from "vitest";
import { EditorStore, type EditorStoreAction } from "@senify/editor/state";
import { counterIds } from "./fixtures.ts";

// The store reports every committed change through `onAction` (Phase 0, fifth
// slice) so a shell can forward exactly the applied editor ops to the engine.

function trackingStore(events: EditorStoreAction[]): EditorStore {
  return new EditorStore({
    idFactory: counterIds(),
    onAction: (event) => events.push(event),
  });
}

describe("store action reporting", () => {
  it("reports apply, undo and redo in order", () => {
    const events: EditorStoreAction[] = [];
    const store = trackingStore(events);
    const root = store.document.rootNodeId;
    store.apply({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "heading", id: "head000001", props: { text: "Hallo" } },
    });
    store.undo();
    store.redo();
    expect(events.map((event) => event.type)).toEqual(["apply", "undo", "redo"]);
    const first = events[0];
    expect(first?.type === "apply" ? first.mutation : null).toEqual({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "heading", id: "head000001", props: { text: "Hallo" } },
    });
  });

  it("stays silent on a no-op", () => {
    const events: EditorStoreAction[] = [];
    const store = trackingStore(events);
    const root = store.document.rootNodeId;
    store.apply({
      op: "insertNode",
      parent: { nodeId: root },
      node: { primitive: "heading", id: "head000001", props: { text: "Hallo" } },
    });
    events.length = 0;
    // No tablet override exists for "text": the clear is a no-op.
    const outcome = store.apply({
      op: "clearNodeProp",
      id: "head000001",
      key: "text",
      device: "tablet",
    });
    expect(outcome.changed).toBe(false);
    expect(events).toEqual([]);
  });

  it("stays silent when undo has nothing to do", () => {
    const events: EditorStoreAction[] = [];
    const store = trackingStore(events);
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(false);
    expect(events).toEqual([]);
  });
});
