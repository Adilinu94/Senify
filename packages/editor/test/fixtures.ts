import { createRegistry } from "@senify/registry";
import {
  PAGE_ROOT_TYPE,
  type Node,
  type NodeTree,
  type PropValue,
} from "@senify/section-sdk";

// Shared fixture tree for the editor tests: flat page root, slot children,
// breakpoint overrides, motion — plus nodes the registry does not know, which
// must survive every round trip untouched.

export const registry = createRegistry();

export function goldenProps(type: string): Record<string, PropValue> {
  return structuredClone(registry.get(type).golden.tree.props);
}

export function nodeOf(tree: NodeTree, id: string): Node {
  const node = tree.nodes[id];
  if (!node) throw new Error(`Expected node "${id}"`);
  return node;
}

export function draftTree(): NodeTree {
  return {
    rootNodeId: "page000001",
    nodes: {
      page000001: {
        id: "page000001",
        type: PAGE_ROOT_TYPE,
        props: {},
        children: ["hero000001", "pricing00001", "widget00001"],
      },
      hero000001: {
        id: "hero000001",
        type: "hero",
        variant: "centered",
        props: {
          ...goldenProps("hero"),
          headline: "Websites, gebaut von Agenten",
        },
        slots: { visual: ["media00001"] },
        motion: { preset: "masked-headline", intensity: 7, trigger: "viewport" },
        overrides: {
          mobile: {
            props: { headline: "Kurz auf Mobile", paddingY: { $token: "space.4" } },
            hidden: false,
          },
        },
      },
      media00001: {
        id: "media00001",
        type: "media",
        props: goldenProps("media"),
        locked: true,
      },
      pricing00001: {
        id: "pricing00001",
        type: "pricing",
        variant: "plans-3",
        props: { ...goldenProps("pricing"), billingToggle: true },
        hidden: false,
      },
      widget00001: {
        // Not in the registry: the editor must keep it (agent-authored nodes,
        // sections from a newer registry version).
        id: "widget00001",
        type: "custom-widget",
        props: { title: "Fremd", data: { nested: [1, 2, 3] } },
        overrides: { tablet: { props: { spacing: "2rem" } } },
      },
      orphan000001: {
        id: "orphan000001",
        type: "hero",
        props: goldenProps("hero"),
      },
    },
  };
}

export function cloneTree(tree: NodeTree): NodeTree {
  return structuredClone(tree);
}
