import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  ancestorIds,
  clearSelection,
  expandNode,
  expandToReveal,
  isExpanded,
  isSelected,
  primarySelection,
  selectChildren,
  selectMany,
  selectOne,
  selectParent,
  selectRange,
  toggleSelect,
} from "@senify/editor/state";
import { baseStore } from "./fixtures.ts";

describe("selection", () => {
  it("selects one node and reports it", () => {
    const selection = selectOne(EMPTY_SELECTION, "head000001");
    expect(selection.selected).toEqual(["head000001"]);
    expect(selection.anchor).toBe("head000001");
    expect(primarySelection(selection)).toBe("head000001");
    expect(isSelected(selection, "head000001")).toBe(true);
  });

  it("toggles nodes for a multi-selection", () => {
    let selection = selectOne(EMPTY_SELECTION, "head000001");
    selection = toggleSelect(selection, "btn0000001");
    expect(selection.selected).toEqual(["head000001", "btn0000001"]);
    selection = toggleSelect(selection, "head000001");
    expect(selection.selected).toEqual(["btn0000001"]);
  });

  it("builds a range in document order from the anchor", () => {
    const store = baseStore();
    let selection = selectOne(EMPTY_SELECTION, "head000001");
    selection = selectRange(selection, store.document, "btn0000001");
    expect(selection.selected).toEqual(["head000001", "btn0000001"]);
    expect(selection.focus).toBe("btn0000001");
  });

  it("selects many at once", () => {
    const selection = selectMany(EMPTY_SELECTION, ["a", "b", "a"]);
    expect(selection.selected).toEqual(["a", "b"]);
    expect(selection.anchor).toBe("a");
  });

  it("clears a selection", () => {
    const selection = clearSelection(selectOne(EMPTY_SELECTION, "head000001"));
    expect(selection.selected).toEqual([]);
    expect(selection.anchor).toBeNull();
  });

  it("expands and collapses nodes", () => {
    const selection = expandNode(EMPTY_SELECTION, "sec0000001");
    expect(isExpanded(selection, "sec0000001")).toBe(true);
  });

  it("lists the ancestors of a node", () => {
    const store = baseStore();
    expect(ancestorIds(store.document, "head000001")).toEqual([
      store.document.rootNodeId,
      "sec0000001",
    ]);
  });

  it("reveals a deep node by expanding its ancestors", () => {
    const store = baseStore();
    const selection = expandToReveal(EMPTY_SELECTION, store.document, "head000001");
    expect(isExpanded(selection, store.document.rootNodeId)).toBe(true);
    expect(isExpanded(selection, "sec0000001")).toBe(true);
  });

  it("walks to the parent and to the children", () => {
    const store = baseStore();
    const parent = selectParent(selectOne(EMPTY_SELECTION, "head000001"), store.document);
    expect(parent.selected).toEqual(["sec0000001"]);
    const children = selectChildren(selectOne(EMPTY_SELECTION, "sec0000001"), store.document);
    expect(children.selected).toEqual(["head000001"]);
    const rootChildren = selectChildren(
      selectOne(EMPTY_SELECTION, store.document.rootNodeId),
      store.document,
    );
    expect(rootChildren.selected).toEqual(["sec0000001", "btn0000001"]);
  });
});
