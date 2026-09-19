import {
  motionProfileViolations,
  type MotionProfile,
  type NodeTree,
} from "@senify/section-sdk";
import type { GuardrailViolation } from "./types.ts";

// Hard guardrails (artifacts/03): they block writes, submit and publish.
// "No scroll listeners" and "reduced-motion variant" are structurally
// guaranteed: motion is declarative and the page script honours
// prefers-reduced-motion by construction — there is no free motion code.
export const MAX_PINS_PER_PAGE = 1;
export const MAX_PARALLAX_PER_PAGE = 2;

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
  for (const node of Object.values(tree.nodes)) {
    const preset = node.motion?.preset;
    if (preset === undefined) continue;
    if (PIN_PRESETS.includes(preset)) pinNodes.push(node.id);
    if (PARALLAX_PRESETS.includes(preset)) parallaxNodes.push(node.id);
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
  return violations;
}
