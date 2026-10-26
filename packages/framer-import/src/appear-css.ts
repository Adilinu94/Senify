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
//  3. A spring is not a CSS timing function, so it is SOLVED, not approximated.
//     `spring.ts` is Framer's own solver; this file turns its frames into
//     keyframes. The earlier version used `4/(ζ·ω0)` and a fixed `cubic-bezier`
//     — measured against the page's own solver that was up to 8× too fast on 55
//     of 58 springs, so the reveal was visible but wrong. See `spring.ts` for
//     the comparison.
//
// The output is style rules, not a CSS string: `@keyframes` travels as the
// rule's `rawCss` (ADR-0005 allows exactly that at-rule) and the animation
// declaration as a normal property, scoped per breakpoint through
// `contextStyles` (`@media …`). That way the editor shows the rule like any
// other and the bake compiles it through the same path as everything else.

import type { IrAppearSpec, IrAppearState, IrAppearTransition, IrAppearVariant, IrBreakpoint } from "./ir.ts";
import { springDurationMs, springTimingCss } from "./spring.ts";

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

// The time a spring needs to come to rest, as FRAMER computes it: sample the
// real solver (10 ms steps, distance-dependent rest threshold) until it stops.
// The previous `4/(ζ·ω0)` formula answered a different question and was up to
// 8× too short — see `spring.ts`.
export function appearSettleSeconds(transition: IrAppearTransition | undefined): number {
  if (transition === undefined) return 0.4;
  if (transition.type !== "spring") {
    return Math.min(Math.max(transition.duration ?? 0.4, 0.15), 1.6);
  }
  // The appear channel's `duration` is seconds; the solver returns milliseconds.
  const seconds = springDurationMs(transition, 0, 1) / 1000;
  return Math.max(0.01, seconds);
}

// One effect's timing, as Framer assembles it: every animated property runs on
// its own spring, all of them over the LONGEST settle time (`We` returns
// `longestDuration`), with a `linear()` curve. Because a spring is linear in its
// distance, the normalised curve is the same for every property — the shape is
// sampled once, at the property that settles last.
//
// What stays approximate, stated rather than hidden: CSS applies one duration
// and one curve to all properties of an animation, so a property that settles
// EARLIER than the longest is stretched to the longest. Measured on the 165/32
// spring (opacity 1050 ms, 28 px 750 ms): the residual is 1.05 % of the travel,
// i.e. 0.3 px — below the sub-pixel grid, so it is not visible. Framer itself
// animates every property over the longest duration too, so this is not a
// simplification of the source; it is its behaviour.
export type EffectTiming = {
  durationMs: number;
  easing: string;
  delay: number;
};

export function effectTiming(
  initial: IrAppearState | undefined,
  animate: IrAppearState,
  transition: IrAppearTransition | undefined,
): EffectTiming {
  const from = initial ?? {};
  const pairs: [from: number, to: number][] = [];
  const pair = (a: number | undefined, b: number | undefined, rest: number): void => {
    const start = a ?? rest;
    const end = b ?? rest;
    if (start !== end) pairs.push([start, end]);
  };
  pair(from.opacity, animate.opacity, 1);
  pair(from.x, animate.x, 0);
  pair(from.y, animate.y, 0);
  pair(from.scale, animate.scale, 1);
  pair(from.rotate, animate.rotate, 0);
  pair(from.rotateX, animate.rotateX, 0);
  pair(from.rotateY, animate.rotateY, 0);
  pair(from.skewX, animate.skewX, 0);
  pair(from.skewY, animate.skewY, 0);
  pair(from.blur, animate.blur, 0);
  pair(from.transformPerspective, animate.transformPerspective, 0);

  const delay = Math.max(0, transition?.delay ?? 0);
  // A plain duration transition (`Ye`): the source's own value, no curve to solve.
  if (transition === undefined || transition.type !== "spring") {
    return {
      durationMs: Math.round(appearSettleSeconds(transition) * 1000),
      easing: easingOfTween(transition),
      delay,
    };
  }

  let durationMs = 0;
  for (const [start, end] of pairs) {
    // The distance decides the rest threshold, so it decides the settle time.
    durationMs = Math.max(durationMs, springDurationMs(transition, start, end));
  }
  if (durationMs === 0) durationMs = springDurationMs(transition, 0, 1);
  return {
    durationMs,
    // 30 stops: Framer's own serialisation (`toString` calls the sampler with
    // 30), so the baked curve has the fidelity the source itself would write.
    easing: springTimingCss(transition, durationMs),
    delay,
  };
}

// The easing of a non-spring transition: Framer writes `ease` on the appear
// entry (default `ease`), and a hand-written page may carry its own curve.
function easingOfTween(transition: IrAppearTransition | undefined): string {
  const ease = (transition as { ease?: unknown } | undefined)?.ease;
  if (typeof ease === "string" && /^(ease|ease-in|ease-out|ease-in-out|linear)$/.test(ease.trim())) {
    return ease.trim();
  }
  if (Array.isArray(ease) && ease.length === 4 && ease.every((value) => typeof value === "number")) {
    return `cubic-bezier(${ease.join(", ")})`;
  }
  return "ease";
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
      // Framer animates every property of one effect on its OWN spring but gives
      // all of them the LONGEST settle time and a normalised curve. A spring is
      // linear in its distance, so one `linear()` covers opacity, translate and
      // scale of the same effect — no curve per property.
      const timing = effectTiming(variant.initial, animate as IrAppearState, transition);
      // A deblur on either side makes the whole effect use `filter`, so both
      // frames spell it (`blur(0px)` at rest): browsers interpolate a missing
      // filter as `none`, which is not the same as a zero blur to every engine.
      const withFilter = variant.initial?.blur !== undefined || (animate as { blur?: number }).blur !== undefined;
      keyframes.push(
        `@keyframes ${name}{from{${frameOf(variant.initial, true, withFilter)}}to{${frameOf(animate, false, withFilter)}}}`,
      );
      const declaration = `${name} ${timing.durationMs}ms ${timing.easing} ${Math.round(timing.delay * 1000)}ms both`;
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
