import type { Node, NodeTree } from "@senify/section-sdk";

export type IslandKind =
  | "menu"
  | "accordion"
  | "slider"
  | "billing"
  | "dismiss"
  | "consent"
  | "modal"
  | "webgl-scene";

export type Hydration =
  | { mode: "static" }
  | { mode: "island"; kinds: IslandKind[] };

export function islandsForNode(node: Node): IslandKind[] {
  const kinds: IslandKind[] = [];
  // The modal preset turns the node's media into a lightbox (M6): the island
  // is the implementation of the preset, so it is the motion spec that opts in.
  if (node.motion?.enabled !== false && node.motion?.preset === "modal") {
    kinds.push("modal");
  }
  switch (node.type) {
    case "navbar":
      kinds.push("menu");
      break;
    case "faq":
      kinds.push("accordion");
      break;
    case "testimonials":
      if (node.variant === "slider") kinds.push("slider");
      break;
    case "gallery":
      if (node.variant === "carousel") kinds.push("slider");
      break;
    case "pricing": {
      if (node.props.billingToggle !== true) break;
      const plans = Array.isArray(node.props.plans) ? node.props.plans : [];
      const anyYearly = plans.some(
        (plan) =>
          typeof plan === "object" &&
          plan !== null &&
          typeof (plan as Record<string, unknown>).priceYearly === "string",
      );
      if (anyYearly) kinds.push("billing");
      break;
    }
    case "banner":
      if (node.props.dismissible === true) kinds.push("dismiss");
      break;
    case "cookie-note":
      kinds.push("consent");
      break;
    case "hero":
      if (node.variant === "showcase-3d") kinds.push("webgl-scene");
      break;
    case "media":
      if (node.variant === "3d-scene") kinds.push("webgl-scene");
      break;
    default:
      break;
  }
  return kinds;
}

export function getHydration(node: Node): Hydration {
  // Programmatic per-node API (editor preview, tooling). The bake itself
  // aggregates via islandsForTree; both read the single islandsForNode table,
  // so they cannot drift apart.
  const kinds = islandsForNode(node);
  return kinds.length === 0 ? { mode: "static" } : { mode: "island", kinds };
}

export function islandsForTree(tree: NodeTree): Set<IslandKind> {
  const kinds = new Set<IslandKind>();
  for (const node of Object.values(tree.nodes)) {
    for (const kind of islandsForNode(node)) kinds.add(kind);
  }
  return kinds;
}
