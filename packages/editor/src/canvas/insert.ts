// Insert at the selection (Phase 0, fourth slice).
//
// "Behind or into the selected node" is pure planning: find the parent and the
// index from the document and the widget catalog's child rules, before the
// store's `insertNode` writes anything. A disallowed insertion is refused here
// with a clear message (which child types the target accepts, which slot is
// full); a legal one returns a plan the caller hands to `store.apply`.
//
// Drag and drop is deliberately not part of this slice (Phase 1) — only the
// catalog click that inserts behind or into the selection.

import { SenifyError } from "@senify/core";
import {
  getPrimitive,
  isComponentPrimitive,
  type PrimitiveDefinition,
  type PropValue,
} from "@senify/widget-engine";
import {
  editorSlotSpecs,
  locateParent,
  type EditorDocument,
  type EditorNode,
  type NodeId,
  type ParentRef,
} from "../state/document.ts";

export type InsertPosition = "before" | "after" | "into";

export type InsertPlan = {
  parent: ParentRef;
  index: number;
};

function requireNode(document: EditorDocument, id: NodeId): EditorNode {
  const node = document.nodes[id];
  if (node === undefined) {
    throw new SenifyError("not_found", `Knoten "${id}" existiert nicht`, {
      field: "id",
      suggestion: "Wähle zuerst einen Knoten im Canvas.",
    });
  }
  return node;
}

function requirePrimitive(primitive: string): PrimitiveDefinition {
  const definition = getPrimitive(primitive);
  if (definition === undefined) {
    throw new SenifyError("not_found", `Unbekanntes Primitiv "${primitive}"`, {
      field: "primitive",
      suggestion: "Wähle einen Baustein aus dem Katalog.",
    });
  }
  return definition;
}

// How many entries a slot already holds.
function slotLength(node: EditorNode, slot: string): number {
  return (node.slots?.[slot] ?? []).length;
}

// Why a slot does not take a primitive, or `null` when it does. The rules of
// a component instance come from its definition (`editorSlotSpecs`), not from
// the structural catalog type.
export function slotRejection(
  document: EditorDocument,
  owner: EditorNode,
  slot: string,
  childPrimitive: string,
): string | null {
  const spec = editorSlotSpecs(document, owner)[slot];
  if (spec === undefined) {
    return `"${owner.primitive}" hat keinen Slot "${slot}"`;
  }
  if (
    spec.allowedTypes.length > 0 &&
    !spec.allowedTypes.includes(childPrimitive)
  ) {
    return `Slot "${slot}" erlaubt kein "${childPrimitive}" (erlaubt: ${spec.allowedTypes.join(", ")})`;
  }
  if (spec.max !== null && slotLength(owner, slot) >= spec.max) {
    return `Slot "${slot}" ist voll (max ${spec.max})`;
  }
  return null;
}

// The message the canvas shows when a target refuses a child, or `null`.
export function childRejection(
  document: EditorDocument,
  parent: ParentRef,
  childPrimitive: string,
): string | null {
  const owner = document.nodes[parent.nodeId];
  if (owner === undefined) return `Elternknoten "${parent.nodeId}" existiert nicht`;
  const definition = getPrimitive(owner.primitive);
  if (definition === undefined) return `Unbekanntes Primitiv "${owner.primitive}"`;

  if (parent.slot !== undefined) {
    return slotRejection(document, owner, parent.slot, childPrimitive);
  }

  const slots = Object.keys(editorSlotSpecs(document, owner));
  if (isComponentPrimitive(owner.primitive)) {
    return slots.length > 0
      ? `"${owner.primitive}" nimmt keine Kinder auf - nutze einen Slot (${slots.join(", ")})`
      : `"${owner.primitive}" nimmt keine Kinder auf`;
  }
  const allowed = definition.allowedChildren;
  if (allowed === "none") {
    return slots.length > 0
      ? `"${definition.type}" nimmt keine Kinder auf — nutze einen Slot (${slots.join(", ")})`
      : `"${definition.type}" nimmt keine Kinder auf`;
  }
  if (Array.isArray(allowed) && !allowed.includes(childPrimitive)) {
    return `"${definition.type}" erlaubt kein "${childPrimitive}" (erlaubt: ${allowed.join(", ")})`;
  }
  return null;
}

// The first slot of a container that takes the primitive and is not full.
export function firstFreeSlot(
  document: EditorDocument,
  owner: EditorNode,
  childPrimitive: string,
): string | undefined {
  for (const slot of Object.keys(editorSlotSpecs(document, owner))) {
    if (slotRejection(document, owner, slot, childPrimitive) === null) return slot;
  }
  return undefined;
}

export function assertChildAllowed(
  document: EditorDocument,
  parent: ParentRef,
  childPrimitive: string,
): void {
  const rejection = childRejection(document, parent, childPrimitive);
  if (rejection !== null) {
    throw new SenifyError("validation", `Einfügen nicht erlaubt: ${rejection}`, {
      field: "parent",
      suggestion: "Wähle einen anderen Zielknoten oder ein anderes Primitiv.",
    });
  }
}

// The parent and index for inserting `primitive` behind or into `targetId`.
export function insertPlan(
  document: EditorDocument,
  targetId: NodeId,
  primitive: string,
  position: InsertPosition,
): InsertPlan {
  if (primitive === "root") {
    throw new SenifyError("validation", "Die Wurzel lässt sich nicht einfügen", {
      field: "primitive",
      suggestion: "Die Wurzel existiert genau einmal pro Dokument.",
    });
  }
  requireNode(document, targetId);
  requirePrimitive(primitive);

  if (position === "before" || position === "after") {
    const located = locateParent(document, targetId);
    if (located === undefined) {
      throw new SenifyError(
        "validation",
        "Die Wurzel hat kein Geschwister — füge in einen anderen Knoten ein.",
        { field: "target", suggestion: "Wähle einen Knoten unterhalb der Wurzel." },
      );
    }
    assertChildAllowed(document, located.parent, primitive);
    return {
      parent: located.parent,
      index: position === "before" ? located.index : located.index + 1,
    };
  }

  const target = requireNode(document, targetId);
  const definition = requirePrimitive(target.primitive);
  const allowed = definition.allowedChildren;
  // A component instance is a container of *slots*, not of children: the
  // catalog's structural "any" says nothing about where content belongs, the
  // definition names the slots.
  if (!isComponentPrimitive(target.primitive)) {
    if (
      allowed === "any" ||
      (Array.isArray(allowed) && allowed.includes(primitive))
    ) {
      return { parent: { nodeId: targetId }, index: (target.children ?? []).length };
    }
  }

  const slot = firstFreeSlot(document, target, primitive);
  if (slot !== undefined) {
    return { parent: { nodeId: targetId, slot }, index: slotLength(target, slot) };
  }

  // No children allowed and no free slot: say exactly why.
  const slotNames = Object.keys(editorSlotSpecs(document, target));
  const firstSlot = slotNames[0];
  const reason =
    firstSlot !== undefined
      ? slotRejection(document, target, firstSlot, primitive)
      : childRejection(document, { nodeId: targetId }, primitive);
  throw new SenifyError(
    "validation",
    `Einfügen nicht erlaubt: ${reason ?? `"${primitive}" passt nicht in "${target.primitive}"`}`,
    { field: "target", suggestion: "Wähle einen anderen Zielknoten oder ein anderes Primitiv." },
  );
}

// The canonical mutation the plan turns into; the store validates it again.
export function insertMutation(
  plan: InsertPlan,
  primitive: string,
  props: Record<string, PropValue> = {},
): { op: "insertNode"; parent: ParentRef; index: number; node: { primitive: string; props: Record<string, PropValue> } } {
  return {
    op: "insertNode",
    parent: plan.parent,
    index: plan.index,
    node: { primitive, props },
  };
}
