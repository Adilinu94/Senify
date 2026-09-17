// Cascade: one decision in one place (O1 — D5 "order by kind" and D7
// "@layer user-authored" merged).
//
// Everything the compiler writes lives in the single layer
// `@layer user-authored`. Unlayered CSS (editor chrome, the overlay of the
// rebuild) therefore always wins over authored output, no matter how specific
// authored selectors are — the pattern of the blueprint
// `Repos/instatic/docs/features/canvas-iframe-per-frame.md`, section
// "CSS injection into iframes".
//
// Inside that one layer the order is *emission order*, and the compiler emits
// strictly from weak to strong:
//
//   base   -> `[data-node-id="id"]`                     (desktop values)
//   device -> `@media (max-width: …)` per device        (tablet, then mobile)
//   state  -> `[data-node-id="id"]:hover` etc.
//   class  -> `[data-node-id="id"].user-class`
//   inline -> the element's `style` attribute, outside the layer
//
// A rule of a stronger stage is written after the weaker one, so it wins the
// tie on specificity. `kind` (class | ambient | scoped) stays data and no
// longer decides the order — the stage does. That is the merger: one layer,
// one fixed stage list, no per-kind layers.

import { BREAKPOINTS } from "../breakpoints.ts";

export const CASCADE_LAYER = "user-authored";

export const NODE_ATTRIBUTE = "data-node-id";

export const CASCADE_ORDER = ["base", "device", "state", "class", "inline"] as const;

export type CascadeStage = (typeof CASCADE_ORDER)[number];

export type StateName = "hover" | "focus" | "active";

// Emission order of the pseudo states, weak to strong.
export const STATE_ORDER: readonly StateName[] = ["hover", "focus", "active"];

const STATE_PSEUDO_CLASS: Record<StateName, string> = {
  hover: ":hover",
  focus: ":focus",
  active: ":active",
};

// The media queries reuse the breakpoints of the existing inventory instead of
// inventing new ones. The one definition lives in `BREAKPOINTS`
// (`./breakpoints.ts`, tablet 1024, mobile 640); the editor frames
// (`packages/editor/src/frames.ts`, `mediaQueryFor`) and the bake read the same
// numbers through `@senify/renderer/breakpoints`, which re-exports them. The
// numbers are never written down a second time, and the widget engine pulls in
// neither the renderer's Node-side bake (registry, child_process, fs) nor the
// registry — which is what lets the registry render the catalog (Phase 1).
export const DEVICE_BREAKPOINTS = {
  tablet: BREAKPOINTS.tablet,
  mobile: BREAKPOINTS.mobile,
} as const;

export type MediaDevice = keyof typeof DEVICE_BREAKPOINTS;

// `frames.ts` subtracts 0.02 so a frame at exactly the breakpoint width is not
// already caught by the media query.
export const MEDIA_QUERY_OFFSET = 0.02;

export function mediaMaxWidth(device: MediaDevice): number {
  const max = DEVICE_BREAKPOINTS[device];
  return Math.round((max - MEDIA_QUERY_OFFSET) * 100) / 100;
}

export function mediaQueryFor(device: MediaDevice): string {
  return `@media (max-width: ${mediaMaxWidth(device)}px)`;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// One stable selector per node — same string for every preview and for the
// release, because it only depends on the node id.
export function nodeSelector(id: string): string {
  return `[${NODE_ATTRIBUTE}="${escapeAttributeValue(id)}"]`;
}

export function statePseudoClass(state: StateName): string {
  return STATE_PSEUDO_CLASS[state];
}

export function stateSelector(id: string, state: StateName): string {
  return `${nodeSelector(id)}${STATE_PSEUDO_CLASS[state]}`;
}

// A user class is anchored on the node: `[data-node-id].cls` has the same
// specificity as a state rule of the same node, so the later stage (classes)
// wins purely through source order and the layer stays intact.
export function classSelector(id: string, className: string): string {
  const trimmed = className.trim();
  const escaped = trimmed.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  return `${nodeSelector(id)}.${escaped}`;
}
