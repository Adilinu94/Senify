// The appear channel of a Framer page compiled to plain CSS (step 4b of
// `docs/fahrplan-framer-1zu1.md`, built after `Niranjan266/unframer`'s
// `src/appear.ts`, MIT).
//
// Why this exists: a Senify motion preset is a closed registry of a handful of
// effects. Everything Framer expresses beyond "fade in from below" — a slide
// from the side, a scale-in, a card tilting in 3D — used to become a finding and
// then nothing: the page counted the effect as "measured but not mappable". The
// browser can do all of them, exactly, without one line of JavaScript: the
// appear spec is start state + end state + timing.
//
// Three rules decide whether this works at all, and each is easy to get wrong:
//
//  1. The start state is ALSO written into the inline style (`opacity:0.001`,
//     `transform:translateY(40px)`). The capture moves it out of the visual into
//     `appearInitial` and the mapper must not write it back — the animation owns
//     it now. `both` fill holds the start state through the delay and the end
//     state afterwards.
//  2. A variant is scoped to its breakpoint. Framer writes one copy per layout
//     and hides the others with `hidden-<hash>`; emitting the `default` variant
//     unscoped would play a desktop slide on the phone.
//  3. A spring is not a CSS timing function. `ease-out` (overdamped) or a small
//     overshoot curve (underdamped) is the closest honest approximation; the
//     exact overshoot is lost. This is a stated limit, not a silent one.
//
// The output is style rules, not a CSS string: `@keyframes` travels as the
// rule's `rawCss` (ADR-0005 allows exactly that at-rule) and the animation
// declaration as a normal property, scoped per breakpoint through
// `contextStyles` (`@media …`). That way the editor shows the rule like any
// other and the bake compiles it through the same path as everything else.

import type { IrAppearSpec, IrAppearState, IrAppearTransition, IrAppearVariant, IrBreakpoint } from "./ir.ts";

export type CompiledAppearRule = {
  // Rule id and class name. Scoped to the page like every imported rule, so a
  // re-import replaces its own rules and never another page's.
  id: string;
  name: string;
  // The keyframes block, one per (appear id, variant). The compiler writes it
  // verbatim; `isSafeRawCss` validates the shape.
  keyframes: string[];
  // The animation declaration per breakpoint context. `""` is the base
  // (no media query), a string is a media condition.
  animation: Record<string, string>;
  // Context id → declaration, for the breakpoints that carry a variant.
  contexts: Record<string, Record<string, string>>;
  // Appear ids this rule covers, for the report.
  appearIds: string[];
};

export type CompileAppearResult = {
  rules: CompiledAppearRule[];
  // Appear ids that produced nothing, with the reason. The report shows them
  // instead of dropping them silently (that was finding U5 b: four of eleven
  // pages lost every effect without a word).
  findings: { appearId: string; reason: string }[];
  // How many (id, variant) pairs became a rule.
  compiled: number;
};

// Motion's own `buildTransform` order: perspective, translate, scale, rotate,
// skew. A different order produces a different matrix for combined transforms.
export function appearTransform(state: IrAppearState | undefined): string {
  if (state === undefined) return "none";
  const parts: string[] = [];
  if (state.transformPerspective !== undefined && state.transformPerspective !== 0) {
    parts.push(`perspective(${round(state.transformPerspective)}px)`);
  }
  if (state.x !== undefined && state.x !== 0) parts.push(`translateX(${round(state.x)}px)`);
  if (state.y !== undefined && state.y !== 0) parts.push(`translateY(${round(state.y)}px)`);
  if (state.z !== undefined && state.z !== 0) parts.push(`translateZ(${round(state.z)}px)`);
  if (state.scale !== undefined && state.scale !== 1) parts.push(`scale(${round(state.scale, 4)})`);
  if (state.rotate !== undefined && state.rotate !== 0) parts.push(`rotate(${round(state.rotate)}deg)`);
  if (state.rotateX !== undefined && state.rotateX !== 0) parts.push(`rotateX(${round(state.rotateX)}deg)`);
  if (state.rotateY !== undefined && state.rotateY !== 0) parts.push(`rotateY(${round(state.rotateY)}deg)`);
  if (state.skewX !== undefined && state.skewX !== 0) parts.push(`skewX(${round(state.skewX)}deg)`);
  if (state.skewY !== undefined && state.skewY !== 0) parts.push(`skewY(${round(state.skewY)}deg)`);
  return parts.length === 0 ? "none" : parts.join(" ");
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// The time a spring needs to come to rest (2 % band), the same formula the
// capture uses for the samples: `4 / (ζ·ω0)`. Clamped to a range a page can use.
export function appearSettleSeconds(transition: IrAppearTransition | undefined): number {
  if (transition === undefined) return 0.4;
  if (transition.type !== "spring") {
    return Math.min(Math.max(transition.duration ?? 0.4, 0.15), 1.6);
  }
  const stiffness = transition.stiffness ?? 100;
  const damping = transition.damping ?? 10;
  const mass = transition.mass ?? 1;
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const settle = zeta <= 0 ? 1.6 : 4 / (zeta * omega);
  return Math.min(Math.max(settle, 0.15), 1.6);
}

function easingOf(transition: IrAppearTransition | undefined): string {
  if (transition?.type !== "spring") return "ease";
  const damping = transition.damping ?? 10;
  const stiffness = transition.stiffness ?? 100;
  const mass = transition.mass ?? 1;
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  // A damped spring glides to its place; an underdamped one snaps over.
  return zeta >= 1 ? "ease-out" : "cubic-bezier(0.34, 1.56, 0.64, 1)";
}

// CSS identifiers must be plain. A Framer appear id is a hash, but a
// hand-written page could carry anything; everything outside the safe set
// becomes `_`.
function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

// The media condition of a breakpoint hash, without the `@media` (the style
// rule's context id carries the prelude). Framer's breakpoints are
// `min-width`/`max-width` pairs the capture already read into the IR.
export function mediaConditionOf(hash: string, breakpoints: readonly IrBreakpoint[]): string | undefined {
  const breakpoint = breakpoints.find((entry) => entry.id === hash);
  if (breakpoint === undefined) return undefined;
  const parts: string[] = [];
  if (breakpoint.minWidth > 0) parts.push(`(min-width: ${breakpoint.minWidth}px)`);
  if (breakpoint.maxWidth !== null) parts.push(`(max-width: ${breakpoint.maxWidth}px)`);
  return parts.length === 0 ? undefined : parts.join(" and ");
}

// One keyframe state: opacity plus transform. A missing opacity means the
// element's own (1 at rest, 0 as the start of a reveal).
function frameOf(state: IrAppearState | undefined, isStart: boolean): string {
  const opacity = state?.opacity;
  const resolved = opacity === undefined ? (isStart ? 0 : 1) : Math.min(1, Math.max(0, opacity));
  return `opacity:${round(resolved, 4)};transform:${appearTransform(state)}`;
}

export type CompileAppearInput = {
  specs: readonly IrAppearSpec[];
  breakpoints: readonly IrBreakpoint[];
  // appear id → the `data-node-id` of the mapped node. An id without a mapping
  // produced no node (its element was folded away) and is skipped with a finding.
  nodeIdByAppearId: ReadonlyMap<string, string>;
  // The page scope of the rule ids (`ruleScopeOf`), so a re-import replaces its
  // own rules and no other page's.
  scope: string;
};

// One compiled rule per appear id. All its breakpoint variants share the rule:
// the base declaration and the per-context overrides.
export function compileAppearRules(input: CompileAppearInput): CompileAppearResult {
  const rules: CompiledAppearRule[] = [];
  const findings: CompileAppearResult["findings"] = [];
  let compiled = 0;

  for (const [index, spec] of input.specs.entries()) {
    const nodeId = input.nodeIdByAppearId.get(spec.appearId);
    if (nodeId === undefined) {
      findings.push({
        appearId: spec.appearId,
        reason:
          "Die appear-id gehört zu keinem Knoten des Imports (Element gefaltet oder entfernt) — der Effekt entfällt.",
      });
      continue;
    }
    const keyframes: string[] = [];
    const base: Record<string, string> = {};
    const contexts: Record<string, Record<string, string>> = {};
    const explicit = Object.keys(spec.variants).filter((hash) => hash !== "default");

    const emit = (hash: string, variant: IrAppearVariant | null, condition: string | undefined): boolean => {
      if (variant === null || variant === undefined) return false;
      const animate = variant.animate;
      if (animate === undefined || animate === null) return false;
      const name = `senify-appear-${safeId(spec.appearId)}-${safeId(hash)}`;
      const transition = (animate as { transition?: IrAppearTransition }).transition;
      const duration = round(appearSettleSeconds(transition), 3);
      const delay = round(Math.max(0, transition?.delay ?? 0), 3);
      keyframes.push(
        `@keyframes ${name}{from{${frameOf(variant.initial, true)}}to{${frameOf(animate, false)}}}`,
      );
      const declaration = `${name} ${duration}s ${easingOf(transition)} ${delay}s both`;
      if (condition === undefined) base["animation"] = declaration;
      else contexts[`@media ${condition}`] = { animation: declaration };
      compiled += 1;
      return true;
    };

    if (explicit.length === 0) {
      // No responsive specialisation: one declaration covers every width.
      emit("default", spec.variants["default"] ?? null, undefined);
    } else {
      // An explicit variant carries its own breakpoint; `default` covers what no
      // explicit variant claims.
      const claimed: string[] = [];
      for (const hash of explicit) {
        const condition = mediaConditionOf(hash, input.breakpoints);
        if (condition === undefined) {
          // The hash names no breakpoint this site declares: apply it at all
          // widths rather than dropping it.
          if (emit(hash, spec.variants[hash] ?? null, undefined)) continue;
          continue;
        }
        claimed.push(hash);
        emit(hash, spec.variants[hash] ?? null, condition);
      }
      const fallback = spec.variants["default"] ?? null;
      if (fallback !== null) {
        const unanswered = input.breakpoints.filter((entry) => !claimed.includes(entry.id));
        if (unanswered.length === 0 && input.breakpoints.length > 0) {
          // Every declared breakpoint has its own variant: `default` holds
          // outside all of them (wider than the widest).
          const widest = input.breakpoints
            .map((entry) => entry.maxWidth)
            .filter((value): value is number => value !== null)
            .sort((a, b) => b - a)[0];
          emit("default", fallback, widest === undefined ? undefined : `(min-width: ${widest + 0.02}px)`);
        } else if (unanswered.length === 0) {
          emit("default", fallback, undefined);
        } else {
          for (const entry of unanswered) {
            emit(`default-${entry.id}`, fallback, mediaConditionOf(entry.id, input.breakpoints));
          }
        }
      }
    }

    if (keyframes.length === 0) {
      findings.push({
        appearId: spec.appearId,
        reason: "Der Kanal nennt diesen Effekt, aber keinen Endzustand — es gibt nichts zu animieren.",
      });
      continue;
    }

    rules.push({
      id: `fi-${input.scope}-appear-${index + 1}`,
      name: `fi-${input.scope}-appear-${index + 1}`,
      keyframes,
      animation: base,
      contexts,
      appearIds: [spec.appearId],
    });
  }

  return { rules, findings, compiled };
}

// The reduced-motion policy for imported reveals: `static`. The element stays
// visible and still, which is what the WCAG default asks for. Without this an
// element whose animation a browser refuses to run would stay at `opacity:0` —
// the reveal would become a blank spot on the page.
export function appearReducedMotionCss(rules: readonly CompiledAppearRule[]): string {
  if (rules.length === 0) return "";
  const selectors = rules.map((rule) => `.${rule.name}`).join(",");
  return `@media (prefers-reduced-motion: reduce){${selectors}{animation:none!important;opacity:1!important}}`;
}

// The selector a compiled rule is keyed on. Exported so a test can assert the
// mapping without re-deriving it.
export function appearClassOf(rule: CompiledAppearRule): string {
  return rule.name;
}
