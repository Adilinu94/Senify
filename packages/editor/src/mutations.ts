import { SenifyError } from "@senify/core";
import type { Mutation } from "@senify/engine";
import type { Node, NodeTree } from "@senify/section-sdk";
import { isOverrideBreakpoint, type EditorAction } from "./types.ts";

// Where an action needs the current tree (per-property override reset), the
// caller hands it in. Everything else is a pure function of the action.
export type ActionContext = {
  tree: NodeTree;
};

function requireNode(tree: NodeTree, id: string): Node {
  const node = tree.nodes[id];
  if (!node) {
    throw new SenifyError("not_found", `Node "${id}" does not exist`, {
      field: "nodeId",
      suggestion: "The node was deleted or never existed — reload the page.",
    });
  }
  return node;
}

// Every editor action funnels through here. A single action can become more
// than one canonical mutation (resetting one property of a breakpoint
// override needs a clear plus a re-set of the remaining values).
export function emitMutations(
  action: EditorAction,
  context: ActionContext,
): Mutation[] {
  switch (action.kind) {
    case "insert":
      return [
        {
          op: "insertNode",
          parent: action.parent,
          ...(action.index === undefined ? {} : { index: action.index }),
          node: action.node,
        },
      ];
    case "delete":
      return [{ op: "deleteNode", id: action.nodeId }];
    case "duplicate":
      return [
        {
          op: "duplicateNode",
          id: action.nodeId,
          ...(action.target === undefined ? {} : { target: action.target }),
          ...(action.index === undefined ? {} : { index: action.index }),
        },
      ];
    case "move":
      return [
        {
          op: "moveNode",
          id: action.nodeId,
          target: action.target,
          ...(action.index === undefined ? {} : { index: action.index }),
        },
      ];
    case "wrap":
      return [{ op: "wrapNode", id: action.nodeId, wrapper: action.wrapper }];
    case "prop": {
      if (isOverrideBreakpoint(action.breakpoint)) {
        return [
          {
            op: "setBreakpointOverride",
            id: action.nodeId,
            breakpoint: action.breakpoint,
            override: { props: { [action.key]: action.value } },
          },
        ];
      }
      return [
        {
          op: "updateNodeProps",
          id: action.nodeId,
          patch: { [action.key]: action.value },
        },
      ];
    }
    case "prop-patch": {
      if (isOverrideBreakpoint(action.breakpoint)) {
        const props = Object.fromEntries(
          Object.entries(action.patch).filter(([, value]) => value !== null),
        );
        if (Object.keys(props).length === 0) return [];
        return [
          {
            op: "setBreakpointOverride",
            id: action.nodeId,
            breakpoint: action.breakpoint,
            override: { props },
          },
        ];
      }
      return [{ op: "updateNodeProps", id: action.nodeId, patch: action.patch }];
    }
    case "override-reset": {
      const node = requireNode(context.tree, action.nodeId);
      const current = node.overrides?.[action.breakpoint];
      if (!current) return [];
      const remaining = { ...(current.props ?? {}) };
      delete remaining[action.key];
      const keepHidden = current.hidden === true;
      const clear: Mutation = {
        op: "clearBreakpointOverride",
        id: action.nodeId,
        breakpoint: action.breakpoint,
      };
      if (Object.keys(remaining).length === 0 && !keepHidden) return [clear];
      return [
        clear,
        {
          op: "setBreakpointOverride",
          id: action.nodeId,
          breakpoint: action.breakpoint,
          override: {
            ...(Object.keys(remaining).length > 0 ? { props: remaining } : {}),
            ...(keepHidden ? { hidden: true } : {}),
          },
        },
      ];
    }
    case "variant":
      return [
        { op: "updateNodeMeta", id: action.nodeId, meta: { variant: action.variant } },
      ];
    case "lock":
      return [
        { op: "updateNodeMeta", id: action.nodeId, meta: { locked: action.locked } },
      ];
    case "hide": {
      const breakpoint = action.breakpoint ?? "desktop";
      if (isOverrideBreakpoint(breakpoint)) {
        return [
          {
            op: "setBreakpointOverride",
            id: action.nodeId,
            breakpoint,
            override: { hidden: action.hidden },
          },
        ];
      }
      return [
        { op: "updateNodeMeta", id: action.nodeId, meta: { hidden: action.hidden } },
      ];
    }
    case "motion":
      return action.spec === null
        ? [{ op: "clearMotion", id: action.nodeId }]
        : [{ op: "setMotion", id: action.nodeId, spec: action.spec }];
    case "inline-text":
      // Inline text always writes the base prop: the value shows in every
      // breakpoint (artifacts/24 §2); only the panels create overrides.
      return [
        {
          op: "updateNodeProps",
          id: action.nodeId,
          patch: { [action.key]: action.value },
        },
      ];
    case "page-meta":
      return [
        {
          op: "updatePageMeta",
          ...(action.title === undefined ? {} : { title: action.title }),
          ...(action.path === undefined ? {} : { path: action.path }),
        },
      ];
  }
}

export function emitBatch(
  actions: readonly EditorAction[],
  context: ActionContext,
): Mutation[] {
  return actions.flatMap((action) => emitMutations(action, context));
}
