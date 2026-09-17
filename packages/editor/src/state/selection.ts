// Selection model (rebuild Phase 0, third slice).
//
// Selection is plain data: the set of selected node ids, an anchor and a focus
// for range building, and the set of expanded nodes for the tree view. Every
// function is pure and returns a new `SelectionState`, so the store owns the
// single mutable copy.

import {
  documentOrder,
  locateParent,
  type EditorDocument,
  type NodeId,
} from "./document.ts";

export type SelectionState = {
  readonly selected: readonly NodeId[];
  // Where a range starts (shift-click) and ends.
  readonly anchor: NodeId | null;
  readonly focus: NodeId | null;
  // Nodes shown open in the layer tree.
  readonly expanded: readonly NodeId[];
};

export const EMPTY_SELECTION: SelectionState = {
  selected: [],
  anchor: null,
  focus: null,
  expanded: [],
};

export function selectionSet(selection: SelectionState): Set<NodeId> {
  return new Set(selection.selected);
}

export function isSelected(selection: SelectionState, id: NodeId): boolean {
  return selection.selected.includes(id);
}

export function selectionCount(selection: SelectionState): number {
  return selection.selected.length;
}

// The node a single-target action (delete, style) applies to.
export function primarySelection(selection: SelectionState): NodeId | null {
  return selection.focus ?? selection.selected[0] ?? null;
}

export function selectOne(selection: SelectionState, id: NodeId): SelectionState {
  return { ...selection, selected: [id], anchor: id, focus: id };
}

export function toggleSelect(selection: SelectionState, id: NodeId): SelectionState {
  const present = selection.selected.includes(id);
  const selected = present
    ? selection.selected.filter((entry) => entry !== id)
    : [...selection.selected, id];
  return {
    ...selection,
    selected,
    anchor: selection.anchor ?? id,
    focus: present && selected.length === 0 ? null : id,
  };
}

export function clearSelection(selection: SelectionState): SelectionState {
  return { ...selection, selected: [], anchor: null, focus: null };
}

export function selectMany(
  selection: SelectionState,
  ids: readonly NodeId[],
): SelectionState {
  const unique = [...new Set(ids)];
  return {
    ...selection,
    selected: unique,
    anchor: unique[0] ?? null,
    focus: unique[unique.length - 1] ?? null,
  };
}

// Range from the anchor to `id` in document order, inclusive. Without an anchor
// it degrades to a single selection.
export function selectRange(
  selection: SelectionState,
  document: EditorDocument,
  id: NodeId,
): SelectionState {
  const order = documentOrder(document);
  const anchor = selection.anchor ?? selection.focus ?? selection.selected[0] ?? id;
  const from = order.indexOf(anchor);
  const to = order.indexOf(id);
  if (from < 0 || to < 0) return selectOne(selection, id);
  const [start, end] = from <= to ? [from, to] : [to, from];
  const range = order.slice(start, end + 1);
  return { ...selection, selected: range, anchor, focus: id };
}

export function isExpanded(selection: SelectionState, id: NodeId): boolean {
  return selection.expanded.includes(id);
}

export function expandNode(selection: SelectionState, id: NodeId): SelectionState {
  if (selection.expanded.includes(id)) return selection;
  return { ...selection, expanded: [...selection.expanded, id] };
}

export function collapseNode(selection: SelectionState, id: NodeId): SelectionState {
  if (!selection.expanded.includes(id)) return selection;
  return {
    ...selection,
    expanded: selection.expanded.filter((entry) => entry !== id),
  };
}

export function toggleExpanded(selection: SelectionState, id: NodeId): SelectionState {
  return selection.expanded.includes(id)
    ? collapseNode(selection, id)
    : expandNode(selection, id);
}

// Ancestors from the root down to the parent of `id`.
export function ancestorIds(
  document: EditorDocument,
  id: NodeId,
): NodeId[] {
  const chain: NodeId[] = [];
  let current = locateParent(document, id);
  while (current !== undefined) {
    chain.unshift(current.parent.nodeId);
    current = locateParent(document, current.parent.nodeId);
  }
  return chain;
}

// Selecting a deep node opens every ancestor so the tree shows it.
export function expandToReveal(
  selection: SelectionState,
  document: EditorDocument,
  id: NodeId,
): SelectionState {
  const ancestors = ancestorIds(document, id);
  const expanded = new Set(selection.expanded);
  for (const ancestor of ancestors) expanded.add(ancestor);
  return { ...selection, expanded: [...expanded] };
}

export function selectParent(
  selection: SelectionState,
  document: EditorDocument,
): SelectionState {
  const current = primarySelection(selection);
  if (current === null) return selection;
  const located = locateParent(document, current);
  if (located === undefined) return selection;
  return expandToReveal(
    selectOne(selection, located.parent.nodeId),
    document,
    located.parent.nodeId,
  );
}

export function selectChildren(
  selection: SelectionState,
  document: EditorDocument,
): SelectionState {
  const current = primarySelection(selection);
  if (current === null) return selection;
  const node = document.nodes[current];
  if (node === undefined) return selection;
  const children = [
    ...(node.children ?? []),
    ...Object.values(node.slots ?? {}).flat(),
  ];
  if (children.length === 0) return selection;
  return expandToReveal(
    selectMany(selection, children),
    document,
    current,
  );
}
