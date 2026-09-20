import { describe, expect, it } from "vitest";
import {
  dropPositionFor,
  isContainer,
  resolveDrop,
  resolveInsertDrop,
  resolveMoveDrop,
} from "@senify/editor/canvas";
import { baseStore } from "../state/fixtures.ts";

// Ticket 12: the drag decisions are pure — where a drop lands, whether it is
// legal, and what the plan is. The DOM half only draws and forwards.

describe("drop position", () => {
  const box = { top: 100, height: 200 };

  it("uses the quarters: top before, bottom after", () => {
    expect(dropPositionFor(box, 110, true)).toBe("before");
    expect(dropPositionFor(box, 190, true)).toBe("into");
    expect(dropPositionFor(box, 290, true)).toBe("after");
  });

  it("never drops into a leaf — the middle is after", () => {
    expect(dropPositionFor(box, 190, false)).toBe("after");
  });
});

describe("resolve insert drop", () => {
  it("plans an insert with the same plan the catalog click uses", () => {
    const store = baseStore();
    const resolution = resolveInsertDrop(store.document, "sec0000001", "into", "heading");
    expect(resolution.kind).toBe("insert");
    if (resolution.kind === "insert") {
      expect(resolution.parent).toEqual({ nodeId: "sec0000001" });
      expect(resolution.index).toBe(1);
    }
  });

  it("refuses with the same reason text as the click path", () => {
    const store = baseStore();
    const resolution = resolveInsertDrop(store.document, "head000001", "into", "text");
    expect(resolution.kind).toBe("reject");
    if (resolution.kind === "reject") {
      expect(resolution.reason).toMatch(/heading.*nimmt keine Kinder auf/);
    }
  });

  it("places before a node at its own index", () => {
    const store = baseStore();
    const resolution = resolveInsertDrop(store.document, "btn0000001", "before", "divider");
    expect(resolution.kind).toBe("insert");
    if (resolution.kind === "insert") {
      expect(resolution.parent).toEqual({ nodeId: store.document.rootNodeId });
      expect(resolution.index).toBe(1);
    }
  });
});

describe("resolve move drop", () => {
  it("moves a node beside a sibling", () => {
    const store = baseStore();
    // heading sits in the section; move it behind the button under the root.
    const resolution = resolveMoveDrop(store.document, "head000001", "btn0000001", "after");
    expect(resolution).toEqual({
      kind: "move",
      target: { nodeId: store.document.rootNodeId },
      index: 2,
    });
  });

  it("appends into a container", () => {
    const store = baseStore();
    const resolution = resolveMoveDrop(store.document, "btn0000001", "sec0000001", "into");
    expect(resolution).toEqual({
      kind: "move",
      target: { nodeId: "sec0000001" },
      index: 1,
    });
  });

  it("refuses a drop into its own subtree (visible cycle guard)", () => {
    const store = baseStore();
    const resolution = resolveMoveDrop(store.document, "sec0000001", "head000001", "into");
    expect(resolution.kind).toBe("reject");
    if (resolution.kind === "reject") {
      expect(resolution.reason).toMatch(/nicht in sich selbst/);
    }
  });

  it("refuses moving the root", () => {
    const store = baseStore();
    const resolution = resolveMoveDrop(
      store.document,
      store.document.rootNodeId,
      "sec0000001",
      "after",
    );
    expect(resolution.kind).toBe("reject");
  });

  it("reports a no-op when the node already sits there", () => {
    const store = baseStore();
    const resolution = resolveMoveDrop(store.document, "head000001", "head000001", "after");
    expect(resolution.kind).toBe("none");
  });

  it("routes both sources through resolveDrop", () => {
    const store = baseStore();
    expect(resolveDrop(store.document, { kind: "primitive", primitive: "divider" }, "sec0000001", "into").kind).toBe(
      "insert",
    );
    expect(resolveDrop(store.document, { kind: "node", id: "btn0000001" }, "sec0000001", "into").kind).toBe(
      "move",
    );
  });

  it("knows the containers of the catalog", () => {
    const store = baseStore();
    expect(isContainer(store.document, "sec0000001")).toBe(true);
    expect(isContainer(store.document, "head000001")).toBe(false);
  });
});
