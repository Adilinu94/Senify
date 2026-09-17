// Document consistency check (rebuild Phase 0, third slice).
//
// One function that reports everything wrong with a document: wrong version,
// missing or non-root root, unknown primitives, references to nodes that do not
// exist, a node claimed by two parents, orphans, children the catalog does not
// allow, slots that do not exist or are overfull, classes that are not defined
// and reference cycles. Every issue carries a message and, where useful, the
// node or class it points at. The store runs this after every write and refuses
// a patch that would break the document.

import { getPrimitive } from "@senify/widget-engine";
import {
  DOCUMENT_VERSION,
  isClassDefined,
  type EditorDocument,
  type NodeId,
} from "./document.ts";

export type DocumentIssueKind =
  | "wrong-version"
  | "missing-root"
  | "root-primitive"
  | "unknown-primitive"
  | "dangling-child"
  | "dangling-slot"
  | "duplicate-parent"
  | "orphan-node"
  | "child-not-allowed"
  | "slot-unknown"
  | "slot-not-allowed"
  | "slot-full"
  | "undefined-class"
  | "cycle";

export type DocumentIssue = {
  kind: DocumentIssueKind;
  nodeId?: NodeId;
  ref?: NodeId;
  classId?: string;
  message: string;
};

export function validateDocument(document: EditorDocument): DocumentIssue[] {
  const issues: DocumentIssue[] = [];

  if (document.version !== DOCUMENT_VERSION) {
    issues.push({
      kind: "wrong-version",
      message: `Document version must be ${DOCUMENT_VERSION}, got ${String(document.version)}`,
    });
  }

  const root = document.nodes[document.rootNodeId];
  if (root === undefined) {
    issues.push({
      kind: "missing-root",
      message: `Root node "${document.rootNodeId}" is missing from the document`,
    });
    return issues;
  }
  if (root.primitive !== "root") {
    issues.push({
      kind: "root-primitive",
      nodeId: root.id,
      message: `Root node "${root.id}" must be a "root" primitive, got "${root.primitive}"`,
    });
  }

  const attached = new Set<NodeId>([document.rootNodeId]);
  const parents = new Map<NodeId, NodeId>();
  const claim = (childId: NodeId, parentId: NodeId, list: string): void => {
    if (attached.has(childId)) {
      issues.push({
        kind: "duplicate-parent",
        nodeId: childId,
        message: `Node "${childId}" is referenced by more than one parent (first "${parents.get(childId) ?? "?"}", also "${parentId}" via ${list})`,
      });
      return;
    }
    attached.add(childId);
    parents.set(childId, parentId);
  };

  for (const node of Object.values(document.nodes)) {
    const definition = getPrimitive(node.primitive);
    if (definition === undefined) {
      issues.push({
        kind: "unknown-primitive",
        nodeId: node.id,
        message: `Node "${node.id}" uses unknown primitive "${node.primitive}"`,
      });
    }

    for (const childId of node.children ?? []) {
      const child = document.nodes[childId];
      if (child === undefined) {
        issues.push({
          kind: "dangling-child",
          nodeId: node.id,
          ref: childId,
          message: `Node "${node.id}" references missing child "${childId}"`,
        });
        continue;
      }
      if (definition !== undefined) {
        const allowed = definition.allowedChildren;
        if (
          allowed === "none" ||
          (Array.isArray(allowed) && !allowed.includes(child.primitive))
        ) {
          issues.push({
            kind: "child-not-allowed",
            nodeId: node.id,
            ref: childId,
            message: `Primitive "${node.primitive}" does not allow child "${child.primitive}"`,
          });
        }
      }
      claim(childId, node.id, "children");
    }

    for (const [slot, list] of Object.entries(node.slots ?? {})) {
      const slotSpec = definition?.slots[slot];
      if (definition !== undefined && slotSpec === undefined) {
        issues.push({
          kind: "slot-unknown",
          nodeId: node.id,
          message: `Primitive "${node.primitive}" has no slot "${slot}"`,
        });
      }
      if (slotSpec?.max !== undefined && list.length > slotSpec.max) {
        issues.push({
          kind: "slot-full",
          nodeId: node.id,
          message: `Slot "${slot}" of node "${node.id}" holds ${list.length} nodes (max ${slotSpec.max})`,
        });
      }
      for (const childId of list) {
        const child = document.nodes[childId];
        if (child === undefined) {
          issues.push({
            kind: "dangling-slot",
            nodeId: node.id,
            ref: childId,
            message: `Slot "${slot}" of node "${node.id}" references missing child "${childId}"`,
          });
          continue;
        }
        if (
          slotSpec?.allowedTypes !== undefined &&
          slotSpec.allowedTypes.length > 0 &&
          !slotSpec.allowedTypes.includes(child.primitive)
        ) {
          issues.push({
            kind: "slot-not-allowed",
            nodeId: node.id,
            ref: childId,
            message: `Slot "${slot}" of node "${node.id}" does not allow "${child.primitive}"`,
          });
        }
        claim(childId, node.id, `slot "${slot}"`);
      }
    }

    for (const name of node.classes ?? []) {
      if (!isClassDefined(document, name)) {
        issues.push({
          kind: "undefined-class",
          nodeId: node.id,
          classId: name,
          message: `Node "${node.id}" uses undefined style class "${name}"`,
        });
      }
    }
  }

  for (const node of Object.values(document.nodes)) {
    if (node.id !== document.rootNodeId && !attached.has(node.id)) {
      issues.push({
        kind: "orphan-node",
        nodeId: node.id,
        message: `Node "${node.id}" (${node.primitive}) is not attached to the document`,
      });
    }
  }

  issues.push(...detectCycles(document));
  return issues;
}

function detectCycles(document: EditorDocument): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  const done = new Set<NodeId>();
  const guard = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    if (guard.has(id)) {
      issues.push({
        kind: "cycle",
        nodeId: id,
        message: `Node "${id}" is part of a reference cycle`,
      });
      return;
    }
    if (done.has(id)) return;
    const node = document.nodes[id];
    if (node === undefined) return;
    guard.add(id);
    for (const childId of [
      ...(node.children ?? []),
      ...Object.values(node.slots ?? {}).flat(),
    ]) {
      visit(childId);
    }
    guard.delete(id);
    done.add(id);
  };
  visit(document.rootNodeId);
  return issues;
}

export function firstIssueMessage(
  issues: readonly DocumentIssue[],
): string | undefined {
  return issues[0]?.message;
}

export function isConsistent(document: EditorDocument): boolean {
  return validateDocument(document).length === 0;
}
