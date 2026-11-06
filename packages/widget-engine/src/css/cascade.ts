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
// Inside that one layer the order is *emission order*. ADR-0017 replaced the
// pure origin order with a condition matrix:
//
//   class-base      -> `.user-class`                    (global, weakest)
//   base            -> `[data-node-id="id"]`            (local, desktop)
//   local-rule-base -> `[data-node-id].scope`           (local rule, desktop)
//   class-device    -> `@media` class rules
//   device          -> `@media` local node values
//   local-rule-device
//   class-state     -> `.user-class:hover` etc.
//   state           -> `[data-node-id="id"]:hover` etc.
//   local-rule-state
//   inline          -> the element's `style` attribute, outside the layer
//
// Condition before origin: state beats device beats base. Local beats global
// at the same condition. `kind` (class | ambient | scoped) still decides
// whether a rule is global or local, and the stage names in `CASCADE_ORDER`
// stay the labels on a compiled rule.

import { BREAKPOINTS } from "../breakpoints.ts";

export const CASCADE_LAYER = "user-authored";

export const NODE_ATTRIBUTE = "data-node-id";

export const CASCADE_ORDER = ["base", "device", "state", "class", "inline"] as const;

export type CascadeStage = (typeof CASCADE_ORDER)[number];

// ADR-0017: the authored levels from weak to strong. `CASCADE_ORDER` stays the
// list of stage names on a compiled rule; this list is the order in which the
// compiler actually writes them. Condition before origin, local before global
// at the same condition.
export const CASCADE_PRECEDENCE = [
  "class-base",
  "base",
  "local-rule-base",
  "class-device",
  "device",
  "local-rule-device",
  "class-state",
  "state",
  "local-rule-state",
  "inline",
] as const;

export type CascadePrecedenceLevel = (typeof CASCADE_PRECEDENCE)[number];

// Decision O11 (17.09.): four pseudo states. `disabled` is not a transient
// interaction like the other three — it is a form state — but it belongs to the
// same stage, and it emits last so it wins against `active` when both are set.
export type StateName = "hover" | "focus" | "active" | "disabled";

// Emission order of the pseudo states, weak to strong.
export const STATE_ORDER: readonly StateName[] = ["hover", "focus", "active", "disabled"];

const STATE_PSEUDO_CLASS: Record<StateName, string> = {
  hover: ":hover",
  focus: ":focus",
  active: ":active",
  disabled: ":disabled",
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

function escapeClassName(className: string): string {
  const trimmed = className.trim();
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

// The anchored spelling of a class rule: `[data-node-id].cls` keeps a class
// rule attached to one carrier. Since ADR-0017 the default global class base
// (`.cls`) is emitted before the local base, so a local node value wins at the
// same condition. The anchored form remains for the `regional` emission mode
// and as the measured alternative.
export function classSelector(id: string, className: string): string {
  return `${nodeSelector(id)}.${escapeClassName(className)}`;
}

// The global spelling of a class rule (ticket 14, the measured winner): one
// `.cls` selector for all carriers instead of one anchored rule per node.
// Since ADR-0017 it is the weakest authored level: a local node base of the
// same condition is emitted later and wins, and a class state is emitted as
// `.cls:hover`, so the local node state that follows wins the same-condition
// tie. A narrower condition (device, state) still beats a local base because
// the class rule for that condition is emitted later.
export function globalClassSelector(className: string): string {
  return `.${escapeClassName(className)}`;
}
