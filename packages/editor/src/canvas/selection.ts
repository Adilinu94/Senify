// Canvas selection helpers (Phase 0, fourth slice).
//
// Selection itself lives in the store (`packages/editor/src/state/selection.ts`)
// — the canvas only reads it and decides what a click means:
//
//   click          -> select the clicked node (store.select)
//   double-click   -> drill one level deeper (the first child of the selection)
//   click empty    -> clear the selection
//
// The decisions are pure functions over the selection and the document, so they
// are unit-tested without a browser; the DOM shell passes the store in.

import {
  primarySelection,
  type SelectionState,
} from "../state/selection.ts";
import type { EditorDocument, NodeId } from "../state/document.ts";

// The node a single-target action works on.
export function selectedId(selection: SelectionState): NodeId | null {
  return primarySelection(selection);
}

// The first child (children before slots) a double-click drills into.
export function firstChildId(document: EditorDocument, id: NodeId): NodeId | null {
  const node = document.nodes[id];
  if (node === undefined) return null;
  const first = node.children?.[0];
  if (first !== undefined) return first;
  for (const list of Object.values(node.slots ?? {})) {
    const slotFirst = list[0];
    if (slotFirst !== undefined) return slotFirst;
  }
  return null;
}

// One level deeper than the current selection, or `null` when there is no
// child to drill into.
export function drillDownId(
  document: EditorDocument,
  selection: SelectionState,
): NodeId | null {
  const current = selectedId(selection);
  if (current === null) return null;
  return firstChildId(document, current);
}

// The short label the marker shows, e.g. "heading · head000001".
export function selectionLabel(
  document: EditorDocument,
  selection: SelectionState,
): string | null {
  const id = selectedId(selection);
  if (id === null) return null;
  const node = document.nodes[id];
  if (node === undefined) return id;
  return `${node.primitive} · ${id}`;
}

// Resolves a click: the node under the pointer, or `null` for empty space.
export type ClickResolution =
  | { kind: "select"; id: NodeId }
  | { kind: "clear" }
  | { kind: "drill"; id: NodeId };

// A copy of a component definition (ticket 04) is not part of the document:
// the canvas resolves the click through the origins map of the last render, so
// clicking inside an instance selects the instance node (and its overrides in
// the inspector).
export function resolveClick(
  document: EditorDocument,
  hitId: NodeId | null,
  options: {
    double?: boolean;
    origins?: ReadonlyMap<NodeId, { instanceId: NodeId; partId: NodeId }>;
  } = {},
): ClickResolution {
  if (hitId === null) return { kind: "clear" };
  const origin = options.origins?.get(hitId);
  const id = origin === undefined ? hitId : origin.instanceId;
  if (options.double === true) {
    const deeper = firstChildId(document, id);
    if (deeper !== null) return { kind: "drill", id: deeper };
  }
  return { kind: "select", id };
}
