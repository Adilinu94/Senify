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
// In Phase 1 the primitives get their own components; until then SectionTree
// renders the documented unknown-node placeholder keyed by `data-node-id`, so
// the structure, the selection and the generated rules are already visible.

import type { Node, NodeTree } from "@senify/section-sdk";
import { resolveAllForDevice } from "@senify/widget-engine";
import type { EditorDocument } from "../state/document.ts";

export function canvasNodeTree(document: EditorDocument): NodeTree {
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
    if (node.locked !== undefined) sectionNode.locked = node.locked;
    if (node.motion !== undefined) sectionNode.motion = structuredClone(node.motion);
    nodes[id] = sectionNode;
  }
  return { rootNodeId: document.rootNodeId, nodes };
}
