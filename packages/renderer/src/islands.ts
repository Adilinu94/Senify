import { webglSceneEnabled, type Node, type NodeTree } from "@senify/section-sdk";

export type IslandKind =
  | "menu"
  | "accordion"
  | "slider"
  | "billing"
  | "dismiss"
  | "consent"
  | "modal"
  | "webgl-scene"
  | "payload";

export type Hydration =
  | { mode: "static" }
  | { mode: "island"; kinds: IslandKind[] };

export function islandsForNode(node: Node): IslandKind[] {
  const kinds: IslandKind[] = [];
  const add = (kind: IslandKind): void => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };
  // The modal preset turns the node's media into a lightbox (M6): the island
  // is the implementation of the preset, so it is the motion spec that opts in.
  if (node.motion?.enabled !== false && node.motion?.preset === "modal") {
    add("modal");
  }
  // Same contract for the 3D scene (M6): the surface carries the island (hero
  // `showcase-3d` without a filled visual slot, media `3d-scene`); a disabled
  // `webgl-scene` spec switches it back to the static poster.
  if (webglSceneEnabled(node)) {
    add("webgl-scene");
  }
  // Imported foreign code (ADR-0010 §5): the carrier is a normal node of the
  // `payload` primitive; a carrier without an id is not an island but an empty
  // place — it renders its poster or its plate and nothing loads.
  if (node.type === "payload") {
    const payloadId = node.props.payloadId;
    if (typeof payloadId === "string" && payloadId !== "") add("payload");
  }
  switch (node.type) {
    case "navbar":
      add("menu");
      break;
    case "faq":
      add("accordion");
      break;
    case "testimonials":
      if (node.variant === "slider") add("slider");
      break;
    case "gallery":
      if (node.variant === "carousel") add("slider");
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
      if (anyYearly) add("billing");
      break;
    }
    case "banner":
      if (node.props.dismissible === true) add("dismiss");
      break;
    case "cookie-note":
      add("consent");
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
