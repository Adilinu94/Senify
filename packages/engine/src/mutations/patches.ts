import { SenifyError } from "@senify/core";
import type { NodeTree } from "@senify/section-sdk";
import type { PatchOp } from "./contract.ts";
import {
  childList,
  cloneTree,
  collectSubtree,
  locateParent,
  pruneEmptyLists,
  requireNode,
  slotList,
  toNodeTree,
  type WorkingTree,
} from "./tree.ts";

function listForPatch(
  tree: WorkingTree,
  nodeId: string,
  slot: string | undefined,
): string[] {
  const owner = requireNode(tree, nodeId, "patch.target.nodeId");
  return slot ? slotList(owner, slot) : childList(owner);
}

function detach(tree: WorkingTree, id: string): void {
  const located = locateParent(tree, id);
  if (located) {
    const list = listForPatch(tree, located.parent.nodeId, located.parent.slot);
    list.splice(located.index, 1);
  }
  // Remove the whole subtree so undoing a duplicate/insert leaves no orphans.
  for (const entry of collectSubtree(tree, id)) {
    tree.nodes.delete(entry.id);
  }
}

export function applyPatchOp(tree: WorkingTree, patch: PatchOp): void {
  switch (patch.patch) {
    case "insertRaw": {
      if (patch.nodes.length === 0) {
        throw new SenifyError("validation", "Undo patch restores no nodes", {
          field: "undoPatch",
          suggestion: "The patch was recorded against a different tree state.",
        });
      }
      for (const node of patch.nodes) {
        tree.nodes.set(node.id, structuredClone(node));
      }
      const list = listForPatch(tree, patch.parent.nodeId, patch.parent.slot);
      const first = patch.nodes[0];
      if (!first) throw new Error("Internal error: empty patch node list");
      list.splice(Math.min(patch.index, list.length), 0, first.id);
      return;
    }
    case "deleteRaw": {
      detach(tree, patch.id);
      return;
    }
    case "moveRaw": {
      const located = locateParent(tree, patch.id);
      if (!located) {
        throw new SenifyError(
          "not_found",
          `Node "${patch.id}" does not exist for undo`,
          { field: "undoPatch" },
        );
      }
      const oldList = listForPatch(tree, located.parent.nodeId, located.parent.slot);
      oldList.splice(located.index, 1);
      const list = listForPatch(tree, patch.target.nodeId, patch.target.slot);
      list.splice(Math.min(patch.index, list.length), 0, patch.id);
      return;
    }
    case "setProps": {
      const node = requireNode(tree, patch.id, "undoPatch");
      for (const [key, value] of Object.entries(patch.props)) {
        if (value === null) delete node.props[key];
        else node.props[key] = value;
      }
      return;
    }
    case "setNodeFields": {
      const node = requireNode(tree, patch.id, "undoPatch");
      const fields = patch.fields;
      if (fields.variant === null || fields.variant === undefined) delete node.variant;
      else node.variant = fields.variant;
      if (fields.locked === null || fields.locked === undefined) delete node.locked;
      else node.locked = fields.locked;
      if (fields.hidden === null || fields.hidden === undefined) delete node.hidden;
      else node.hidden = fields.hidden;
      if (fields.classes !== undefined) {
        if (fields.classes === null || fields.classes.length === 0) delete node.classes;
        else node.classes = [...fields.classes];
      }
      return;
    }
    case "setOverride": {
      const node = requireNode(tree, patch.id, "undoPatch");
      if (patch.override === null) {
        if (node.overrides) {
          delete node.overrides[patch.breakpoint];
          if (Object.keys(node.overrides).length === 0) delete node.overrides;
        }
      } else {
        node.overrides = {
          ...(node.overrides ?? {}),
          [patch.breakpoint]: structuredClone(patch.override),
        };
      }
      return;
    }
    case "setMotion": {
      const node = requireNode(tree, patch.id, "undoPatch");
      if (patch.spec === null) delete node.motion;
      else node.motion = structuredClone(patch.spec);
      return;
    }
    case "setPageMeta": {
      throw new SenifyError(
        "validation",
        "Page-meta patches apply to the page, not the tree",
        {
          field: "undoPatch",
          suggestion: "Apply setPageMeta patches through the page update path.",
        },
      );
    }
  }
}

export function applyTreePatches(
  tree: NodeTree,
  patches: PatchOp[],
): NodeTree {
  const working = cloneTree(tree);
  for (const patch of patches) {
    applyPatchOp(working, patch);
  }
  pruneEmptyLists(working);
  return toNodeTree(working);
}
