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
import { springDurationMs, springTimingCss, type SpringTransition } from "./spring.ts";

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

// The time a spring needs to come to rest, as FRAMER computes it.
//
// The previous `4 / (ζ·ω0)` (2 % band) answered a different question: Framer
// samples the real solver until it is within a DISTANCE-DEPENDENT rest
// threshold. Measured on 26.10.2026 against the page's own `animator.spring`:
// 55 of 58 springs in the fixtures were too fast, by up to 8× (stiffness 140 /
// damping 40: 0.20 s instead of 1.57 s). The port lives in `spring.ts`.
export function appearSettleSeconds(transition: IrAppearTransition | undefined): number {
  if (transition === undefined) return 0.4;
  if (transition.type !== "spring") {
    return Math.min(Math.max(transition.duration ?? 0.4, 0.15), 1.6);
  }
  // The channel's `duration` is seconds, the solver returns milliseconds. Three
  // decimals, the resolution the declaration is written with.
  return round(Math.max(0.01, springDurationMs(transition as SpringTransition, 0.001, 1) / 1000), 3);
}

function easingOf(transition: IrAppearTransition | undefined): string {
  // The browser's own timing function, handed over by the runtime: a sampled
  // `linear(…)` curve or a `cubic-bezier(…)`. Written verbatim, the effect moves
  // exactly as the source does — no spring has to be re-derived from numbers.
  const sampled = (transition as { easing?: string } | undefined)?.easing;
  if (typeof sampled === "string" && /^(linear|cubic-bezier|ease|steps)/.test(sampled)) {
    return sampled;
  }
  if (transition?.type !== "spring") return "ease";
  // No measured curve: SOLVE the spring instead of guessing a bezier. Before
  // this, a damped spring became `ease-out` and an underdamped one a fixed
  // overshoot curve — neither is the source's motion. The solver is Framers own
  // (see `spring.ts`), sampled the way Framer samples it.
  return springTimingCss(
    transition as SpringTransition,
    Math.max(1, Math.round(appearSettleSeconds(transition) * 1000)),
  );
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
// One keyframe state: opacity, transform and the deblur of a word reveal. A
// missing opacity means the element's own (1 at rest, 0 as the start of a
// reveal). `withFilter` makes the frame spell the filter even when it is zero:
// an animation from `blur(12px)` to `none` interpolates in the browser, but a
// written `blur(0px)` says the same thing in a way every engine agrees on.
function frameOf(state: IrAppearState | undefined, isStart: boolean, withFilter = false): string {
  const opacity = state?.opacity;
  const resolved = opacity === undefined ? (isStart ? 0 : 1) : Math.min(1, Math.max(0, opacity));
  const blur = state?.blur;
  const filter =
    blur !== undefined || withFilter ? `;filter:blur(${round(Math.max(0, blur ?? 0))}px)` : "";
  return `opacity:${round(resolved, 4)};transform:${appearTransform(state)}${filter}`;
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
      // A deblur on either side makes the whole effect use `filter`, so both
      // frames spell it (`blur(0px)` at rest): browsers interpolate a missing
      // filter as `none`, which is not the same as a zero blur to every engine.
      const withFilter = variant.initial?.blur !== undefined || (animate as { blur?: number }).blur !== undefined;
      keyframes.push(
        `@keyframes ${name}{from{${frameOf(variant.initial, true, withFilter)}}to{${frameOf(animate, false, withFilter)}}}`,
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
