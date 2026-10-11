// Document patches (rebuild Phase 0, third slice).
//
// Every write to the document goes through `applyDocumentPatches`. An operation
// (see `operations.ts`) computes two patch lists from the same intent: the
// forward list that turns the old document into the new one, and the inverse
// list that turns the new document back. The store records the inverse as the
// undo patch and the forward list for the redo — the same shape the engine
// uses for the section tree, only over the editor document.

import { SenifyError } from "@senify/core";
import type { MotionSpec, PropValue } from "@senify/section-sdk";
import { classKindSelector, type StyleRule } from "@senify/widget-engine";
import {
  cloneDocument,
  collectSubtree,
  locateParent,
  type EditorDocument,
  type EditorNode,
  type HiddenDevice,
  type NodeId,
  type ParentRef,
} from "./document.ts";

export type DocumentPatch =
  | {
      patch: "setNodeProps";
      id: NodeId;
      props: Record<string, PropValue | null>;
    }
  | {
      patch: "setNodeFields";
      id: NodeId;
      fields: {
        classes?: string[] | null;
        hidden?: boolean | null;
        hiddenDevices?: HiddenDevice[] | null;
        locked?: boolean | null;
        // The section variant; `null` returns the node to the section's default.
        variant?: string | null;
      };
    }
  | { patch: "setNodeMotion"; id: NodeId; spec: MotionSpec | null }
  | {
      patch: "insertNodes";
      parent: ParentRef;
      index: number;
      nodes: EditorNode[];
    }
  | { patch: "deleteNode"; id: NodeId }
  | { patch: "moveNode"; id: NodeId; target: ParentRef; index: number }
  | { patch: "upsertStyleRule"; rule: StyleRule }
  | { patch: "deleteStyleRule"; id: string }
  | { patch: "reorderStyleRule"; id: string; index: number }
  | { patch: "renameStyleRule"; id: string; name: string };

function requireNode(document: EditorDocument, id: NodeId): EditorNode {
  const node = document.nodes[id];
  if (node === undefined) {
    throw new SenifyError("not_found", `Node "${id}" does not exist`, {
      field: "patch.id",
    });
  }
  return node;
}

function listFor(document: EditorDocument, ref: ParentRef): NodeId[] {
  const owner = requireNode(document, ref.nodeId);
  if (ref.slot !== undefined) {
    owner.slots ??= {};
    owner.slots[ref.slot] ??= [];
    return owner.slots[ref.slot] ?? [];
  }
  owner.children ??= [];
  return owner.children;
}

// Removes a node from its parent list only; the node and its subtree stay.
function unlink(document: EditorDocument, id: NodeId): void {
  const located = locateParent(document, id);
  if (located === undefined) return;
  const list = listFor(document, located.parent);
  list.splice(located.index, 1);
}

function removeSubtree(document: EditorDocument, id: NodeId): void {
  unlink(document, id);
  for (const entry of collectSubtree(document, id)) {
    delete document.nodes[entry.id];
  }
}

function prune(document: EditorDocument): void {
  for (const node of Object.values(document.nodes)) {
    if (node.classes !== undefined && node.classes.length === 0) delete node.classes;
    if (node.hiddenDevices !== undefined && node.hiddenDevices.length === 0) {
      delete node.hiddenDevices;
    }
    if (node.children !== undefined && node.children.length === 0) delete node.children;
    if (node.slots !== undefined) {
      for (const slot of Object.keys(node.slots)) {
        if ((node.slots[slot] ?? []).length === 0) delete node.slots[slot];
      }
      if (Object.keys(node.slots).length === 0) delete node.slots;
    }
  }
}

export function applyDocumentPatch(
  document: EditorDocument,
  patch: DocumentPatch,
): void {
  switch (patch.patch) {
    case "setNodeProps": {
      const node = requireNode(document, patch.id);
      for (const [key, value] of Object.entries(patch.props)) {
        if (value === null) delete node.props[key];
        else node.props[key] = value;
      }
      return;
    }
    case "setNodeFields": {
      const node = requireNode(document, patch.id);
      const fields = patch.fields;
      if (fields.classes !== undefined) {
        if (fields.classes === null || fields.classes.length === 0) delete node.classes;
        else node.classes = [...fields.classes];
      }
      if (fields.hidden !== undefined) {
        if (fields.hidden === null) delete node.hidden;
        else node.hidden = fields.hidden;
      }
      if (fields.hiddenDevices !== undefined) {
        if (fields.hiddenDevices === null || fields.hiddenDevices.length === 0) {
          delete node.hiddenDevices;
        } else {
          node.hiddenDevices = [...fields.hiddenDevices];
        }
      }
      if (fields.locked !== undefined) {
        if (fields.locked === null) delete node.locked;
        else node.locked = fields.locked;
      }
      if (fields.variant !== undefined) {
        if (fields.variant === null) delete node.variant;
        else node.variant = fields.variant;
      }
      return;
    }
    case "setNodeMotion": {
      const node = requireNode(document, patch.id);
      if (patch.spec === null) delete node.motion;
      else node.motion = structuredClone(patch.spec);
      return;
    }
    case "insertNodes": {
      if (patch.nodes.length === 0) {
        throw new SenifyError("validation", "insertNodes restores no node", {
          field: "patch.nodes",
        });
      }
      for (const entry of patch.nodes) {
        document.nodes[entry.id] = structuredClone(entry);
      }
      const list = listFor(document, patch.parent);
      const first = patch.nodes[0];
      if (first === undefined) throw new Error("Internal error: empty node list");
      list.splice(Math.min(patch.index, list.length), 0, first.id);
      return;
    }
    case "deleteNode": {
      if (document.nodes[patch.id] === undefined) {
        throw new SenifyError("not_found", `Node "${patch.id}" does not exist`, {
          field: "patch.id",
        });
      }
      removeSubtree(document, patch.id);
      return;
    }
    case "moveNode": {
      requireNode(document, patch.id);
      unlink(document, patch.id);
      const list = listFor(document, patch.target);
      list.splice(Math.min(patch.index, list.length), 0, patch.id);
      return;
    }
    case "upsertStyleRule": {
      // Address by id, not by name: a rename must not break the rule (and the
      // site routes address by ruleId too).
      const index = document.styleRules.findIndex((rule) => rule.id === patch.rule.id);
      const next = structuredClone(patch.rule);
      if (index < 0) document.styleRules.push(next);
      else document.styleRules[index] = next;
      return;
    }
    case "deleteStyleRule": {
      document.styleRules = document.styleRules.filter((rule) => rule.id !== patch.id);
      return;
    }
    case "reorderStyleRule": {
      // The array order is the cascade order. A missing id or an out-of-range
      // index leaves the list untouched.
      const from = document.styleRules.findIndex((rule) => rule.id === patch.id);
      if (from < 0) return;
      if (patch.index < 0 || patch.index >= document.styleRules.length) return;
      const [moved] = document.styleRules.splice(from, 1);
      if (moved === undefined) return;
      document.styleRules.splice(patch.index, 0, moved);
      return;
    }
    case "renameStyleRule": {
      const rule = document.styleRules.find((entry) => entry.id === patch.id);
      if (rule === undefined) return;
      const previous = rule.name;
      rule.name = patch.name;
      rule.selector = classKindSelector(patch.name);
      // Nodes reference the class by name, so the assignment follows the rename.
      for (const node of Object.values(document.nodes)) {
        if (node.classes === undefined || !node.classes.includes(previous)) continue;
        const next = node.classes.map((name) => (name === previous ? patch.name : name));
        node.classes = [...new Set(next)];
      }
      return;
    }
  }
}

export function applyDocumentPatches(
  document: EditorDocument,
  patches: readonly DocumentPatch[],
): EditorDocument {
  const working = cloneDocument(document);
  for (const patch of patches) {
    applyDocumentPatch(working, patch);
  }
  prune(working);
  return working;
}
