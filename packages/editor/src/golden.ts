import type { GoldenNode, NodeId, PropValue } from "@senify/section-sdk";
import type { Mutation, NodeSpec, ParentRef } from "@senify/engine";

// Browser-safe placement of a golden example: the engine offers the same
// mapping (`goldenTreeToMutations`), but its module pulls Node-only deps
// (pg, sharp, node:crypto) that must never enter the editor bundle. The
// editor therefore ships this small, dependency-free twin — identical shape,
// plus an optional target slot for the "+" insert points between sections.

export type GoldenPlacement = {
  mutations: Mutation[];
  rootId: NodeId;
};

type AssignedGoldenNode = Omit<GoldenNode, "children"> & {
  assignedId: NodeId;
  children?: AssignedGoldenNode[];
};

const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

// 10 chars of the engine alphabet; crypto.getRandomValues keeps the ids as
// random as the server-side `newNodeId`, without node:crypto.
export function newNodeId(): NodeId {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) {
    id += ALPHABET[byte % 64];
  }
  return id;
}

function assignIds(tree: GoldenNode, createId: () => NodeId): AssignedGoldenNode {
  return {
    ...tree,
    assignedId: createId(),
    children: (tree.children ?? []).map((child) => assignIds(child, createId)),
  };
}

export function goldenTreeToMutations(
  tree: GoldenNode,
  parent: ParentRef,
  index?: number,
  createId: () => NodeId = newNodeId,
): GoldenPlacement {
  const assigned = assignIds(tree, createId);
  const mutations: Mutation[] = [];
  const walk = (golden: AssignedGoldenNode, parentRef: ParentRef, at?: number): void => {
    const node: NodeSpec = {
      id: golden.assignedId,
      type: golden.type,
      props: { ...golden.props } as Record<string, PropValue>,
    };
    if (golden.variant !== undefined) node.variant = golden.variant;
    mutations.push({
      op: "insertNode",
      parent: parentRef,
      ...(at === undefined ? {} : { index: at }),
      node,
    });
    for (const child of golden.children ?? []) {
      walk(child, { nodeId: golden.assignedId });
    }
  };
  walk(assigned, parent, index);
  return { mutations, rootId: assigned.assignedId };
}
