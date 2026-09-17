import { describe, expect, it } from "vitest";
import { EditorStore, type EditorDocument } from "@senify/editor/state";
import {
  canvasNodeTree,
  drillDownId,
  firstChildId,
  resolveClick,
  selectedId,
  selectionLabel,
} from "@senify/editor/canvas";
import { counterIds, makeStore } from "../state/fixtures.ts";

// Point 3 (selection) and point 2 (rendering): the click decisions live in pure
// functions, the selection itself in the store, and the document adapter
// produces exactly the tree the existing React renderer consumes.

function document(): EditorDocument {
  return {
    version: 2,
    rootNodeId: "root",
    nodes: {
      root: { id: "root", primitive: "root", props: {}, children: ["sec", "coll"] },
      sec: {
        id: "sec",
        primitive: "section",
        props: { align: "center", align_tablet: "left" },
        children: ["head"],
      },
      head: { id: "head", primitive: "heading", props: { text: "Hi" } },
      coll: { id: "coll", primitive: "collection", props: {}, slots: { item: [] } },
    },
    classes: {},
  };
}

describe("click resolution", () => {
  it("clears on empty space", () => {
    expect(resolveClick(document(), null)).toEqual({ kind: "clear" });
  });

  it("selects the clicked node", () => {
    expect(resolveClick(document(), "head")).toEqual({ kind: "select", id: "head" });
  });

  it("drills one level deeper on double click", () => {
    expect(resolveClick(document(), "sec", { double: true })).toEqual({
      kind: "drill",
      id: "head",
    });
    // A leaf has nothing to drill into: it stays selected.
    expect(resolveClick(document(), "head", { double: true })).toEqual({
      kind: "select",
      id: "head",
    });
  });
});

describe("children and slots", () => {
  it("prefers children over slots for the drill target", () => {
    expect(firstChildId(document(), "sec")).toBe("head");
    const withSlot: EditorDocument = {
      version: 2,
      rootNodeId: "r",
      nodes: {
        r: { id: "r", primitive: "root", props: {}, children: ["c"] },
        c: { id: "c", primitive: "collection", props: {}, slots: { item: ["x"] } },
        x: { id: "x", primitive: "frame", props: {} },
      },
      classes: {},
    };
    expect(firstChildId(withSlot, "c")).toBe("x");
  });
});

describe("selection stays in the store", () => {
  it("selects, drills and labels", () => {
    const store: EditorStore = makeStore();
    store.replaceDocument(document());
    store.select("sec");
    expect(selectedId(store.selection)).toBe("sec");
    expect(drillDownId(store.document, store.selection)).toBe("head");
    store.select("head");
    expect(selectionLabel(store.document, store.selection)).toBe("heading · head");
    store.clearSelection();
    expect(selectionLabel(store.document, store.selection)).toBeNull();
  });

  it("notifies subscribers on selection and writes", () => {
    const store = new EditorStore({ idFactory: counterIds() });
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.select(store.document.rootNodeId);
    store.clearSelection();
    off();
    store.clearSelection();
    expect(calls).toBe(2);
  });
});

describe("document -> renderer tree", () => {
  it("maps primitives, resolves desktop values and copies the links", () => {
    const tree = canvasNodeTree(document());
    expect(tree.rootNodeId).toBe("root");
    expect(tree.nodes["sec"]?.type).toBe("section");
    // Device suffixes never reach the markup; the stylesheet owns them.
    expect(tree.nodes["sec"]?.props).toEqual({ align: "center" });
    expect(tree.nodes["sec"]?.children).toEqual(["head"]);
    expect(tree.nodes["coll"]?.slots).toEqual({ item: [] });
    expect(tree.nodes["head"]?.props).toEqual({ text: "Hi" });
  });
});
