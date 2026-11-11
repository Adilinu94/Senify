// Hover states that only the page's runtime knows (Paket D, Issue 08).
//
// Framer switches a button to its hover variant in the runtime, not in the
// stylesheet: measured on the Relay source (11.11.2026), 5 of 28 links and
// buttons change their look under the mouse and the built CSS holds 0 `:hover`
// rules. The static capture (`applyClassRules`) can only read the stylesheet, so
// the browser capture hovers the candidates for real, compares a fixed list of
// visual properties before and after, and files the difference as
// `interactions.hover` on the node. The rest of the way (`StyleRule.states`,
// the baker's `:hover` block) already exists.
//
// What this first step deliberately does NOT do (the four open questions of
// Issue 08, decided small):
//   - properties: the fixed list below, nothing derived from `transition`;
//   - nodes: the element that was hovered, matched by the IR key stamp;
//   - parent hover that changes children is reported as a finding, not rebuilt
//     as `.parent:hover .child`;
//   - devices: the desktop state only, measured at the capture width.

import type { FramerIrDocument, IrNode, IrState, IrVisual } from "./ir.ts";

export const HOVER_PROPERTIES = [
  "color",
  "background-color",
  "border-color",
  "opacity",
  "transform",
  "box-shadow",
  "text-decoration-line",
  "filter",
] as const;

export type HoverMeasurement = {
  key: string;
  // Only properties whose value changed under the mouse.
  values: Record<string, string>;
  // A descendant changed while the element itself was hovered.
  childrenChanged: boolean;
};

// Bounds the pass: one candidate costs about 0.7 s (rest, double read, hover).
const MAX_CANDIDATES = 40;
const DEADLINE_MS = 45_000;
const REST_MS = 150;
const STABLE_MS = 80;
const HOVER_MS = 450;
const MIN_SIDE_PX = 4;

// Runs in the page. `window.senifyHoverCandidates()` lists the stamped links
// and buttons that have a size; `window.senifyHoverRead(key)` reads the fixed
// properties of one element and a signature of its descendants.
const HOVER_SENSOR = `
(function () {
  var PROPS = ${JSON.stringify(HOVER_PROPERTIES)};
  window.senifyHoverCandidates = function () {
    var out = [];
    var list = document.querySelectorAll("#main a[href], #main button, #main [role=button]");
    for (var i = 0; i < list.length && out.length < ${MAX_CANDIDATES}; i++) {
      var el = list[i];
      var key = el.getAttribute("data-senify-ir-key");
      if (key === null) continue;
      var box = el.getBoundingClientRect();
      if (box.width < ${MIN_SIDE_PX} || box.height < ${MIN_SIDE_PX}) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      out.push(key);
    }
    return out;
  };
  window.senifyHoverRead = function (key) {
    var el = document.querySelector('[data-senify-ir-key="' + key + '"]');
    if (el === null) return null;
    var own = {};
    var style = getComputedStyle(el);
    for (var i = 0; i < PROPS.length; i++) own[PROPS[i]] = style.getPropertyValue(PROPS[i]);
    var kids = [];
    var descendants = el.querySelectorAll("*");
    for (var j = 0; j < descendants.length && j < 60; j++) {
      var kid = getComputedStyle(descendants[j]);
      var parts = [];
      for (var k = 0; k < PROPS.length; k++) parts.push(kid.getPropertyValue(PROPS[k]));
      kids.push(parts.join("|"));
    }
    return { own: own, kids: kids.join(";") };
  };
})();`;

type HoverRead = { own: Record<string, string>; kids: string } | null;

// Hovers the stamped candidates of the live page. The IR keys must be stamped
// when this runs (`senifyStampKeys`); the page is not read for markup afterwards.
export async function measureHover(page: import("playwright").Page): Promise<HoverMeasurement[]> {
  await page.evaluate(HOVER_SENSOR);
  const keys = (await page.evaluate("window.senifyHoverCandidates()")) as string[];
  const read = async (key: string): Promise<HoverRead> =>
    (await page.evaluate(`window.senifyHoverRead(${JSON.stringify(key)})`)) as HoverRead;
  const out: HoverMeasurement[] = [];
  const started = Date.now();
  for (const key of keys) {
    if (Date.now() - started > DEADLINE_MS) break;
    try {
      await page.mouse.move(1, 1);
      await page.waitForTimeout(REST_MS);
      const before = await read(key);
      await page.waitForTimeout(STABLE_MS);
      const settled = await read(key);
      if (before === null || settled === null) continue;
      await page.locator(`[data-senify-ir-key="${key}"]`).first().hover({ timeout: 2_000 });
      await page.waitForTimeout(HOVER_MS);
      const after = await read(key);
      if (after === null) continue;
      const values: Record<string, string> = {};
      for (const property of HOVER_PROPERTIES) {
        const was = before.own[property];
        const now = after.own[property];
        // A value that moves without the mouse (a pulse, a marquee) is no hover.
        if (was === undefined || now === undefined || was !== settled.own[property]) continue;
        if (now !== "" && now !== was) values[property] = now;
      }
      const childrenChanged = before.kids === settled.kids && after.kids !== before.kids;
      if (Object.keys(values).length > 0 || childrenChanged) out.push({ key, values, childrenChanged });
    } catch {
      // A candidate that cannot be hovered (covered, detached) stays unmeasured.
    }
  }
  await page.mouse.move(1, 1).catch(() => undefined);
  return out;
}

function desktopState(node: IrNode): IrState | undefined {
  return node.states.find((state) => state.device === "desktop") ?? node.states[0];
}

// Files the measurements on the IR. A rule the stylesheet already gave the
// element wins; the measurement only adds what the stylesheet did not say.
// Returns how many nodes received a hover state.
export function mergeHoverMeasurements(document: FramerIrDocument, measurements: HoverMeasurement[]): number {
  if (measurements.length === 0) return 0;
  const byKey = new Map<string, IrNode>();
  const walk = (node: IrNode): void => {
    byKey.set(node.key, node);
    for (const child of node.children) walk(child);
  };
  for (const page of document.pages) walk(page.root);
  let written = 0;
  for (const measurement of measurements) {
    const node = byKey.get(measurement.key);
    if (node === undefined) continue;
    if (measurement.childrenChanged) {
      document.findings.push({
        kind: "unsupported-declaration",
        nodeKey: node.key,
        message: "Beim Hover ändern sich Kinder dieses Elements; die Regel wird nicht als .eltern:hover .kind übernommen.",
        evidence: node.name ?? node.key,
        severity: "info",
        suggestion: "Hover-Zustand der Kinder im Editor nachziehen, falls er sichtbar ist.",
      });
    }
    const state = desktopState(node);
    if (state === undefined) continue;
    const existing: IrVisual = state.interactions?.hover ?? {};
    const added: IrVisual = {};
    for (const [property, value] of Object.entries(measurement.values)) {
      if (existing[property] === undefined) added[property] = value;
    }
    if (Object.keys(added).length === 0) continue;
    state.interactions = { ...(state.interactions ?? {}), hover: { ...existing, ...added } };
    written += 1;
  }
  return written;
}
