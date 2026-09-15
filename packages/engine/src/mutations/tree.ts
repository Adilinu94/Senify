import { SenifyError } from "@senify/core";
import type { Node, NodeId, NodeTree } from "@senify/section-sdk";
import type { ParentRef } from "./contract.ts";

export type WorkingTree = {
  rootNodeId: NodeId;
  nodes: Map<NodeId, Node>;
};

export function cloneTree(tree: NodeTree): WorkingTree {
  const nodes = new Map<NodeId, Node>();
  for (const [id, node] of Object.entries(tree.nodes)) {
    nodes.set(id, structuredClone(node));
  }
  return { rootNodeId: tree.rootNodeId, nodes };
}

export function toNodeTree(tree: WorkingTree): NodeTree {
  return { rootNodeId: tree.rootNodeId, nodes: Object.fromEntries(tree.nodes) };
}

export function requireNode(
  tree: WorkingTree,
  id: NodeId,
  field: string,
): Node {
  const node = tree.nodes.get(id);
  if (!node) {
    throw new SenifyError("not_found", `Node "${id}" does not exist`, {
      field,
      suggestion:
        "The node was deleted or never existed — reload the page and retry with a current id.",
    });
  }
  return node;
}

export type LocatedParent = {
  parent: ParentRef;
  index: number;
};

export function locateParent(
  tree: WorkingTree,
  id: NodeId,
): LocatedParent | undefined {
  for (const node of tree.nodes.values()) {
    if (node.children) {
      const index = node.children.indexOf(id);
      if (index >= 0) return { parent: { nodeId: node.id }, index };
    }
    if (node.slots) {
      for (const [slot, list] of Object.entries(node.slots)) {
        const index = list.indexOf(id);
        if (index >= 0) return { parent: { nodeId: node.id, slot }, index };
      }
    }
  }
  return undefined;
}

export function requireAttached(
  tree: WorkingTree,
  id: NodeId,
): LocatedParent {
  const located = locateParent(tree, id);
  if (!located) {
    throw new SenifyError(
      "validation",
      `Node "${id}" is not attached to the tree`,
      { field: "id", suggestion: "Reload the page and retry." },
    );
  }
  return located;
}

export function collectSubtree(tree: WorkingTree, id: NodeId): Node[] {
  const node = requireNode(tree, id, "id");
  const rest: Node[] = [];
  for (const childId of node.children ?? []) {
    rest.push(...collectSubtree(tree, childId));
  }
  for (const list of Object.values(node.slots ?? {})) {
    for (const childId of list) {
      rest.push(...collectSubtree(tree, childId));
    }
  }
  return [node, ...rest];
}

export function childList(owner: Node): NodeId[] {
  owner.children ??= [];
  return owner.children;
}

export function slotList(owner: Node, slot: string): NodeId[] {
  owner.slots ??= {};
  owner.slots[slot] ??= [];
  const list = owner.slots[slot];
  if (!list) throw new Error(`Internal error: slot list "${slot}" missing`);
  return list;
}

export function pruneEmptyLists(tree: WorkingTree): void {
  for (const node of tree.nodes.values()) {
    if (node.children !== undefined && node.children.length === 0) {
      delete node.children;
    }
    if (node.slots !== undefined) {
      for (const slot of Object.keys(node.slots)) {
        if ((node.slots[slot] ?? []).length === 0) {
          delete node.slots[slot];
        }
      }
      if (Object.keys(node.slots).length === 0) {
        delete node.slots;
      }
    }
    if (node.overrides !== undefined && Object.keys(node.overrides).length === 0) {
      delete node.overrides;
    }
  }
}
