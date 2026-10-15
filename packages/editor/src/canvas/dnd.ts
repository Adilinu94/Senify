// Drag-and-drop planning (ticket 12): pure decisions, no DOM.
//
// The canvas already knows how to *plan* an insert (`insert.ts`); this module
// adds the two drag questions on top of it:
//
// - Where does a drop land? From the pointer position over a node's box:
//   the upper quarter means "before", the lower quarter "after", the middle
//   "into" (only when the node takes children, otherwise "after").
// - Is the drop legal? A catalog drop resolves through `insertPlan` (the very
//   same plan the catalog click uses, so the rejection texts match); a node
//   drag resolves to a `moveNode` target and is refused when the target is the
//   node itself or inside its own subtree (the visible cycle guard).

import { SenifyError } from "@senify/core";
import { getPrimitive, isComponentPrimitive } from "@senify/widget-engine";
import {
  descendantIds,
  editorSlotSpecs,
  locateParent,
  type EditorDocument,
  type NodeId,
  type ParentRef,
} from "../state/document.ts";
import { assertChildAllowed, childRejection, insertPlan } from "./insert.ts";

export type DropPosition = "before" | "after" | "into";

export type DropSource =
  | { kind: "primitive"; primitive: string }
  // A registry section (hero, pricing, …) with the variant the tile carries.
  | { kind: "section"; type: string; variant: string }
  | { kind: "node"; id: NodeId };

export type DropResolution =
  | { kind: "insert"; parent: ParentRef; index: number }
  | { kind: "move"; target: ParentRef; index: number }
  | { kind: "none" }
  | { kind: "reject"; reason: string };

export type Box = { top: number; height: number };

// The upper quarter is "before", the lower quarter "after"; the middle is
// "into" for a container and "after" for a leaf (dropping "into" a leaf has no
// meaning, and "after" is what a user expects at the bottom half).
export function dropPositionFor(box: Box, pointerY: number, container: boolean): DropPosition {
  const height = Math.max(1, box.height);
  const relative = (pointerY - box.top) / height;
  if (relative < 0.25) return "before";
  if (relative > 0.75) return "after";
  return container ? "into" : "after";
}

function takesChildren(document: EditorDocument, id: NodeId): boolean {
  const node = document.nodes[id];
  if (node === undefined) return false;
  const definition = getPrimitive(node.primitive);
  if (definition === undefined) return false;
  // A component instance takes content through its definition's slots only.
  if (isComponentPrimitive(node.primitive)) {
    return Object.keys(editorSlotSpecs(document, node)).length > 0;
  }
  return (
    definition.allowedChildren !== "none" ||
    Object.keys(editorSlotSpecs(document, node)).length > 0
  );
}

export function isContainer(document: EditorDocument, id: NodeId): boolean {
  return takesChildren(document, id);
}

// The insert resolution of a catalog drop: the same `insertPlan` the catalog
// click uses, so "Slot fehlt / Typ nicht erlaubt / Slot voll" read identically.
export function resolveInsertDrop(
  document: EditorDocument,
  targetId: NodeId,
  position: DropPosition,
  primitive: string,
): DropResolution {
  try {
    const plan = insertPlan(document, targetId, primitive, position);
    return { kind: "insert", parent: plan.parent, index: plan.index };
  } catch (error) {
    if (error instanceof SenifyError) return { kind: "reject", reason: error.message };
    throw error;
  }
}

// The move resolution of a node drag. `position` is relative to the target
// node: "into" appends to its children (or first free slot), "before"/"after"
// place it beside the target.
export function resolveMoveDrop(
  document: EditorDocument,
  sourceId: NodeId,
  targetId: NodeId,
  position: DropPosition,
): DropResolution {
  if (sourceId === targetId) return { kind: "none" };
  const source = document.nodes[sourceId];
  const target = document.nodes[targetId];
  if (source === undefined || target === undefined) return { kind: "none" };
  if (sourceId === document.rootNodeId) {
    return { kind: "reject", reason: "Die Wurzel lässt sich nicht verschieben." };
  }
  // The visible cycle guard: a node cannot land inside its own subtree.
  if (descendantIds(document, sourceId).has(targetId)) {
    return { kind: "reject", reason: "Ein Knoten kann nicht in sich selbst verschoben werden." };
  }

  if (position === "into") {
    const rejection = childRejection(document, { nodeId: targetId }, source.primitive);
    if (rejection !== null) return { kind: "reject", reason: rejection };
    const located = locateParent(document, sourceId);
    const children = document.nodes[targetId]?.children ?? [];
    // Appending into the parent the node already sits in at the last position
    // would not change anything.
    if (located !== undefined && located.parent.nodeId === targetId && located.index === children.length - 1) {
      return { kind: "none" };
    }
    return { kind: "move", target: { nodeId: targetId }, index: children.length };
  }

  const located = locateParent(document, targetId);
  if (located === undefined) return { kind: "none" };
  try {
    assertChildAllowed(document, located.parent, source.primitive);
  } catch (error) {
    if (error instanceof SenifyError) return { kind: "reject", reason: error.message };
    throw error;
  }
  const index = position === "before" ? located.index : located.index + 1;
  const sourceParent = locateParent(document, sourceId);
  if (
    sourceParent !== undefined &&
    sourceParent.parent.nodeId === located.parent.nodeId &&
    sourceParent.parent.slot === located.parent.slot &&
    (index === sourceParent.index || index === sourceParent.index + 1)
  ) {
    // Dropping right where the node already is: nothing to do.
    return { kind: "none" };
  }
  return { kind: "move", target: located.parent, index };
}

export function resolveDrop(
  document: EditorDocument,
  source: DropSource,
  targetId: NodeId,
  position: DropPosition,
): DropResolution {
  if (source.kind === "node") return resolveMoveDrop(document, source.id, targetId, position);
  // A section resolves like a primitive of the same name: `getPrimitive` answers
  // for the registry's section types, so the same child rules apply.
  return resolveInsertDrop(
    document,
    targetId,
    position,
    source.kind === "primitive" ? source.primitive : source.type,
  );
}
