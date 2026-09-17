// Bridge from the existing renderer tree to the compiler (Phase 0, point 7).
//
// The renderer already walks a `NodeTree` (section-sdk) and addresses every
// node by `[data-node-id="…"]`; the compiler emits exactly the same selector
// and the same breakpoints (both read `BREAKPOINTS` of the renderer). This
// module turns that tree into the compiler's plain document shape, so the
// renderer can hand its tree to the one compiler instead of growing a second
// style pipeline. Breakpoint overrides become the `_tablet` / `_mobile`
// suffixes the device model already uses.
//
// Scope: style values only. Structure (`hidden`, `motion`, bindings) stays with
// the renderer.

import type { Node, NodeTree, PropValue } from "@senify/section-sdk";
import type { CssDocument, CssNode } from "./css/compile.ts";
import type { DeviceValueMap } from "./device.ts";

const OVERRIDE_SUFFIX = { tablet: "_tablet", mobile: "_mobile" } as const;

export function propsWithOverrides(node: Node): DeviceValueMap {
  const props: DeviceValueMap = { ...(node.props as DeviceValueMap) };
  for (const breakpoint of ["tablet", "mobile"] as const) {
    const override = node.overrides?.[breakpoint];
    if (override?.props === undefined) continue;
    const suffix = OVERRIDE_SUFFIX[breakpoint];
    for (const [key, value] of Object.entries(override.props) as [string, PropValue][]) {
      props[`${key}${suffix}`] = value;
    }
  }
  return props;
}

export function nodeToCssNode(node: Node, tree: NodeTree): CssNode {
  const children = (node.children ?? [])
    .map((id) => tree.nodes[id])
    .filter((child): child is Node => child !== undefined)
    .map((child) => nodeToCssNode(child, tree));

  const slots: Record<string, CssNode[]> = {};
  for (const [name, ids] of Object.entries(node.slots ?? {})) {
    slots[name] = ids
      .map((id) => tree.nodes[id])
      .filter((child): child is Node => child !== undefined)
      .map((child) => nodeToCssNode(child, tree));
  }

  return {
    id: node.id,
    primitive: node.type,
    props: propsWithOverrides(node),
    children,
    slots,
  };
}

export function nodeTreeToCssDocument(tree: NodeTree): CssDocument {
  const root = tree.nodes[tree.rootNodeId];
  return root === undefined ? { nodes: [] } : { nodes: [nodeToCssNode(root, tree)] };
}
