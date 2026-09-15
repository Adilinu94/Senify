import type { GoldenNode, NodeId, PropValue } from "@senify/section-sdk";
import { newNodeId } from "./ids.ts";
import type { Mutation, NodeSpec, ParentRef } from "./mutations/contract.ts";

export type GoldenPlacement = {
  mutations: Mutation[];
  rootId: NodeId;
};

type AssignedGoldenNode = Omit<GoldenNode, "children"> & {
  assignedId: NodeId;
  children?: AssignedGoldenNode[];
};

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
  createId: () => NodeId = newNodeId,
): GoldenPlacement {
  const assigned = assignIds(tree, createId);
  const mutations: Mutation[] = [];
  const walk = (golden: AssignedGoldenNode, parentRef: ParentRef): void => {
    const node: NodeSpec = {
      id: golden.assignedId,
      type: golden.type,
      props: { ...golden.props } as Record<string, PropValue>,
    };
    if (golden.variant !== undefined) node.variant = golden.variant;
    mutations.push({ op: "insertNode", parent: parentRef, node });
    for (const child of golden.children ?? []) {
      walk(child, { nodeId: golden.assignedId });
    }
  };
  walk(assigned, parent);
  return { mutations, rootId: assigned.assignedId };
}
