import type { NodeTree } from "@senify/section-sdk";
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

export function hardGuardrailsForTree(tree: NodeTree): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const pinNodes: string[] = [];
  const parallaxNodes: string[] = [];
  for (const node of Object.values(tree.nodes)) {
    const preset = node.motion?.preset;
    if (preset === undefined) continue;
    if (PIN_PRESETS.includes(preset)) pinNodes.push(node.id);
    if (PARALLAX_PRESETS.includes(preset)) parallaxNodes.push(node.id);
  }
  if (pinNodes.length > MAX_PINS_PER_PAGE) {
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
