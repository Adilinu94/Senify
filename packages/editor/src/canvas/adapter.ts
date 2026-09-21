// Editor document -> renderer tree (Phase 0, fourth slice).
//
// The canvas does not grow its own render path: it hands the existing React
// renderer (`packages/editor/src/react-renderer.tsx`, SectionTree) a plain
// section `NodeTree`, exactly the shape the bake components already consume.
// This adapter is the only translation: an editor node's `primitive` becomes
// the node `type`, the desktop values of the props bag become `props` (the
// markup is device-independent; the device levels live in the stylesheet), and
// children and slots are copied.
//
// Components (ticket 04): the tree leaves the adapter **inlined** — the same
// `inlineComponents` derivation the bake runs, so an instance renders the
// definition's subtree on both sides. Problems (unknown component, cycle) end
// in a stub node, never in a crash; the canvas shows the stub, the bake
// refuses to publish (see `bake.ts`).

import { inlineComponents, type Node, type NodeTree } from "@senify/section-sdk";
import { resolveAllForDevice } from "@senify/widget-engine";
import type { EditorDocument } from "../state/document.ts";

export function canvasNodeTree(document: EditorDocument): NodeTree {
  return canvasNodeTreeWithCopies(document).tree;
}

// The inliner run for the canvas: the render tree plus the copy map. The frame
// rules use the map to emit the definition's own node rules for every copy
// (an instance must look styled exactly like the definition), so canvas and
// bake derive from the same expansion.
export function canvasNodeTreeWithCopies(document: EditorDocument): {
  tree: NodeTree;
  copies: Map<string, string[]>;
} {
  const nodes: Record<string, Node> = {};
  for (const [id, node] of Object.entries(document.nodes)) {
    const sectionNode: Node = {
      id,
      type: node.primitive,
      props: resolveAllForDevice(node.props, "desktop"),
    };
    if (node.children !== undefined && node.children.length > 0) {
      sectionNode.children = [...node.children];
    }
    if (node.slots !== undefined) {
      const slots: Record<string, string[]> = {};
      for (const [slot, ids] of Object.entries(node.slots)) slots[slot] = [...ids];
      if (Object.keys(slots).length > 0) sectionNode.slots = slots;
    }
    if (node.hidden !== undefined) sectionNode.hidden = node.hidden;
    // Ticket 11: the per-breakpoint flags travel as v1 overrides so
    // `isHiddenAt` marks the node in exactly the affected frames.
    if (node.hiddenDevices !== undefined && node.hiddenDevices.length > 0) {
      const overrides: NonNullable<Node["overrides"]> = {};
      for (const device of node.hiddenDevices) overrides[device] = { hidden: true };
      sectionNode.overrides = overrides;
    }
    if (node.locked !== undefined) sectionNode.locked = node.locked;
    if (node.variant !== undefined) sectionNode.variant = node.variant;
    if (node.motion !== undefined) sectionNode.motion = structuredClone(node.motion);
    nodes[id] = sectionNode;
  }
  const tree: NodeTree = { rootNodeId: document.rootNodeId, nodes };
  const result = inlineComponents(tree);
  return { tree: result.tree, copies: result.copies };
}
