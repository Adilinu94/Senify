import type { NodeId, NodeTree } from "@senify/section-sdk";
import { PAGE_ROOT_TYPE } from "@senify/section-sdk";

export type TreeIntegrityIssue = {
  kind:
    | "missing-root"
    | "dangling-child"
    | "dangling-slot"
    | "orphan-node"
    | "duplicate-parent";
  nodeId?: NodeId;
  ref?: NodeId;
  message: string;
};

export function validateTreeIntegrity(tree: NodeTree): TreeIntegrityIssue[] {
  const issues: TreeIntegrityIssue[] = [];
  const root = tree.nodes[tree.rootNodeId];
  if (!root) {
    issues.push({
      kind: "missing-root",
      message: `Root node "${tree.rootNodeId}" is missing from the tree`,
    });
    return issues;
  }
  if (root.type !== PAGE_ROOT_TYPE) {
    issues.push({
      kind: "missing-root",
      nodeId: tree.rootNodeId,
      message: `Root node "${tree.rootNodeId}" must be a "${PAGE_ROOT_TYPE}" node`,
    });
  }

  const attached = new Set<NodeId>([tree.rootNodeId]);
  const parents = new Map<NodeId, NodeId>();
  const claim = (childId: NodeId, parentId: NodeId): void => {
    if (attached.has(childId)) {
      issues.push({
        kind: "duplicate-parent",
        nodeId: childId,
        message: `Node "${childId}" is referenced by more than one parent (first: "${parents.get(childId) ?? parentId}", also: "${parentId}")`,
      });
      return;
    }
    attached.add(childId);
    parents.set(childId, parentId);
  };

  for (const node of Object.values(tree.nodes)) {
    for (const childId of node.children ?? []) {
      if (!tree.nodes[childId]) {
        issues.push({
          kind: "dangling-child",
          nodeId: node.id,
          ref: childId,
          message: `Node "${node.id}" references missing child "${childId}"`,
        });
        continue;
      }
      claim(childId, node.id);
    }
    for (const [slot, list] of Object.entries(node.slots ?? {})) {
      for (const childId of list) {
        if (!tree.nodes[childId]) {
          issues.push({
            kind: "dangling-slot",
            nodeId: node.id,
            ref: childId,
            message: `Slot "${slot}" of node "${node.id}" references missing child "${childId}"`,
          });
          continue;
        }
        claim(childId, node.id);
      }
    }
  }

  for (const node of Object.values(tree.nodes)) {
    if (node.id !== tree.rootNodeId && !attached.has(node.id)) {
      issues.push({
        kind: "orphan-node",
        nodeId: node.id,
        message: `Node "${node.id}" (${node.type}) is not attached to the tree`,
      });
    }
  }

  return issues;
}
