import {
  motionProfileViolations,
  webglSceneEnabled,
  type MotionProfile,
  type NodeTree,
} from "@senify/section-sdk";
import type { GuardrailViolation, SiteProfile } from "./types.ts";

// Hard guardrails (artifacts/03): they block writes, submit and publish.
// "No scroll listeners" and "reduced-motion variant" are structurally
// guaranteed: motion is declarative and the page script honours
// prefers-reduced-motion by construction — there is no free motion code.
export const MAX_PINS_PER_PAGE = 1;
export const MAX_PARALLAX_PER_PAGE = 2;
// Exactly one WebGL canvas per page (artifacts/03): a second scene costs a
// second context and breaks the budget the profile promises.
export const MAX_SCENES_PER_PAGE = 1;
// Imported foreign code (ADR-0010 §6): at most one payload carrier per page
// without a site profile; with a profile the budget is the profile's. A payload
// and a 3D scene are the same kind of cost — one heavy surface — so they also
// share one counter (`heavy-surface-excess`).
export const MAX_PAYLOAD_NODES_PER_PAGE = 1;
export const PAYLOAD_BUDGET_BY_PROFILE: Readonly<Record<SiteProfile, number>> = {
  clean: 1,
  standard: 3,
  showcase: 8,
};
// Per payload (uncompressed) and per page in additional script bytes. The page
// budget is only checked where the sizes are known (the bake, which has the
// payload metadata); the count budget is checked on every write. Measured
// 23.09.2026: the bundled WaveBackground module (three.js + React inlined) is
// 2.78 MB — the budgets cover one real Framer module per page with headroom.
export const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_PAGE_PAYLOAD_BYTES = 8 * 1024 * 1024;

// The one place that says which node carries a payload: the carrier is a normal
// node of the `payload` primitive with a payload id (ADR-0010 §1).
export function payloadRefOf(node: { type: string; props: Record<string, unknown> }):
  | string
  | undefined {
  if (node.type !== "payload") return undefined;
  const id = node.props["payloadId"];
  return typeof id === "string" && id !== "" ? id : undefined;
}

export const PIN_PRESETS: readonly string[] = [
  "scrub-pin",
  "sticky-stack",
  "horizontal-pan",
];

export const PARALLAX_PRESETS: readonly string[] = ["parallax-subtle"];

// With a site profile (ticket 21) the pin budget and the preset classes come
// from the profile table; without one the global rules stay as they were.
export function hardGuardrailsForTree(
  tree: NodeTree,
  profile?: MotionProfile,
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const pinNodes: string[] = [];
  const parallaxNodes: string[] = [];
  const sceneNodes: string[] = [];
  const payloadNodes: { nodeId: string; ref: string }[] = [];
  for (const node of Object.values(tree.nodes)) {
    const preset = node.motion?.preset;
    if (preset !== undefined) {
      if (PIN_PRESETS.includes(preset)) pinNodes.push(node.id);
      if (PARALLAX_PRESETS.includes(preset)) parallaxNodes.push(node.id);
    }
    // The 3D surface is what renders a canvas — the preset alone is not a
    // scene (and a disabled spec switches the surface back to its poster).
    if (webglSceneEnabled(node)) sceneNodes.push(node.id);
    const payloadRef = payloadRefOf(node);
    if (payloadRef !== undefined) payloadNodes.push({ nodeId: node.id, ref: payloadRef });
  }
  if (profile !== undefined) {
    const entries = Object.values(tree.nodes)
      .filter((node) => node.motion !== undefined)
      .map((node) => ({
        nodeId: node.id,
        preset: node.motion?.preset ?? "",
        ...(node.motion?.intensity === undefined
          ? {}
          : { intensity: node.motion.intensity }),
        ...(node.motion?.enabled === undefined ? {} : { enabled: node.motion.enabled }),
      }));
    for (const violation of motionProfileViolations(profile, entries)) {
      violations.push({
        code: violation.code,
        message: violation.message,
        ...(violation.nodeId === undefined ? {} : { nodeId: violation.nodeId }),
        field: "motion.preset",
        suggestion: violation.suggestion,
      });
    }
  } else if (pinNodes.length > MAX_PINS_PER_PAGE) {
    // Without a profile the generic budget applies; with one the profile
    // message is the clearer gate (no duplicate pin report).
    violations.push({
      code: "pin-excess",
      message: `Page uses ${pinNodes.length} pin presets (max ${MAX_PINS_PER_PAGE})`,
      nodeId: pinNodes[pinNodes.length - 1],
      field: "motion.preset",
      suggestion:
        "Keep one pin preset per page: remove one pin or switch it to a reveal preset.",
    });
  }
  if (parallaxNodes.length > MAX_PARALLAX_PER_PAGE) {
    violations.push({
      code: "parallax-excess",
      message: `Page uses ${parallaxNodes.length} parallax layers (max ${MAX_PARALLAX_PER_PAGE})`,
      nodeId: parallaxNodes[parallaxNodes.length - 1],
      field: "motion.preset",
      suggestion:
        "Reduce parallax layers: keep the two that carry the most impact.",
    });
  }
  if (sceneNodes.length > MAX_SCENES_PER_PAGE) {
    violations.push({
      code: "scene-excess",
      message: `Page renders ${sceneNodes.length} 3D scenes (max ${MAX_SCENES_PER_PAGE})`,
      nodeId: sceneNodes[sceneNodes.length - 1],
      field: "motion.preset",
      suggestion:
        "Keep one WebGL scene per page: switch the other surface to an image or video variant.",
    });
  }
  // Payloads (ADR-0010 §6): the count budget is the profile's, and a payload
  // and a scene are one and the same cost, so they share a counter. The byte
  // budget needs the sizes and is checked in the bake, which has them.
  const payloadBudget =
    profile === undefined ? MAX_PAYLOAD_NODES_PER_PAGE : PAYLOAD_BUDGET_BY_PROFILE[profile];
  if (payloadNodes.length > payloadBudget) {
    violations.push({
      code: "payload-excess",
      message: `Page carries ${payloadNodes.length} imported code payloads (max ${payloadBudget} in profile "${profile ?? "default"}")`,
      nodeId: payloadNodes[payloadNodes.length - 1]?.nodeId,
      field: "props.payloadId",
      suggestion:
        "Keep the payloads that carry the page: rebuild the rest with primitives or move them to their own page.",
    });
  }
  if (sceneNodes.length > 0 && payloadNodes.length > 0) {
    const heavy = sceneNodes.length + payloadNodes.length;
    if (heavy > payloadBudget) {
      violations.push({
        code: "heavy-surface-excess",
        message: `Page carries ${heavy} heavy surfaces (${sceneNodes.length} 3D scene(s) + ${payloadNodes.length} payload(s), max ${payloadBudget})`,
        nodeId: payloadNodes[payloadNodes.length - 1]?.nodeId,
        field: "props.payloadId",
        suggestion:
          "A payload and a 3D scene share one budget: keep one heavy surface on this page.",
      });
    }
  }
  return violations;
}
