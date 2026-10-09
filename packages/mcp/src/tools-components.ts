import {
  COMPONENT_DEFINITION_TYPE,
  COMPONENT_INSTANCE_TYPE,
  COMPONENT_SLOT_TYPE,
  componentDefinitions,
  instanceVariants,
  instanceVersion,
  type NodeTree,
} from "@senify/section-sdk";

// The component view of a page draft (P3-2 extraction from `tools.ts`).
//
// A component lives as ordinary nodes in the page draft: `__component` is the
// definition, `__component_instance` an instance, `__component_slot` a
// placeholder. The tools read the draft (list/get) and write the instance's
// override bag through the same mutation route the editor uses.
//
// This module is the read model those tools share: what a definition declares,
// which instances hang off it, and which version an instance is pinned to. The
// tool definitions themselves stay in `tools.ts`, because the manifest
// generator reads that file as text.

type ComponentWalk = {
  parts: { id: string; type: string; props: Record<string, unknown> }[];
  slots: { id: string; name: string }[];
};

// The declared parts and slot placeholders of a definition, in tree order.
// Parts are the override keys; slot placeholders are structure, not parts.
export function walkComponent(tree: NodeTree, definitionId: string): ComponentWalk {
  const parts: ComponentWalk["parts"] = [];
  const slots: ComponentWalk["slots"] = [];
  const rootChildId = tree.nodes[definitionId]?.children?.[0];
  if (rootChildId === undefined) return { parts, slots };
  const visit = (id: string): void => {
    const node = tree.nodes[id];
    if (node === undefined) return;
    if (node.type === COMPONENT_SLOT_TYPE) {
      slots.push({
        id: node.id,
        name: typeof node.props["name"] === "string" ? node.props["name"] : node.id,
      });
      return;
    }
    if (node.type === COMPONENT_DEFINITION_TYPE) return;
    parts.push({
      id: node.id,
      type: node.type,
      props: node.props as Record<string, unknown>,
    });
    for (const child of node.children ?? []) visit(child);
    for (const list of Object.values(node.slots ?? {})) {
      for (const child of list) visit(child);
    }
  };
  visit(rootChildId);
  return { parts, slots };
}

export function readOverrideBag(value: unknown): Record<string, Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const bag: Record<string, Record<string, unknown>> = {};
  for (const [partId, props] of Object.entries(value)) {
    if (props === null || typeof props !== "object" || Array.isArray(props)) continue;
    bag[partId] = { ...(props as Record<string, unknown>) };
  }
  return bag;
}

// The version a definition carries (`props.version`, default 1) - the same
// reading the editor and the bake use (section-sdk `ComponentDefinition`).
export function definitionVersion(tree: NodeTree, definitionId: string): number {
  return (
    componentDefinitions(tree).find((entry) => entry.id === definitionId)?.version ?? 1
  );
}

// Every instance of one definition, with its pin, its active variants and its
// current override bag. `outdated` marks the drift the update tool resolves.
export function componentInstanceList(
  tree: NodeTree,
  definitionId: string,
): {
  id: string;
  componentVersion: number;
  outdated: boolean;
  variants: string[];
  overrides: Record<string, Record<string, unknown>>;
}[] {
  const current = definitionVersion(tree, definitionId);
  return Object.values(tree.nodes)
    .filter(
      (node) =>
        node.type === COMPONENT_INSTANCE_TYPE &&
        node.props["componentId"] === definitionId,
    )
    .map((node) => {
      const pinned = instanceVersion(node);
      return {
        id: node.id,
        componentVersion: pinned,
        outdated: pinned !== current,
        variants: instanceVariants(node),
        overrides: readOverrideBag(node.props["overrides"]),
      };
    });
}

export function componentName(tree: NodeTree, definitionId: string): string {
  const value = tree.nodes[definitionId]?.props["name"];
  return typeof value === "string" ? value : definitionId;
}
