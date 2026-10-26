// Framer's own spring solver, ported from the page the import is reading.
//
// Why this file exists: until now the appear channel's spring was APPROXIMATED.
// `4 / (ζ·ω0)` (the 2 % settle formula) was used as the duration and a fixed
// `cubic-bezier` as the easing — the comment in `appear-css.ts` called that "the
// closest honest approximation". Measured on 26.10.2026 against the solver the
// page itself ships, that approximation is not close:
//
//   stiffness 140 / damping 40   ours 0.20 s   Framer 1.57 s   8.0x too fast
//   stiffness 300 / damping 60   ours 0.15 s   Framer 1.17 s   8.0x too fast
//   stiffness 165 / damping 32   ours 0.25 s   Framer 1.05 s   4.2x too fast
//   stiffness  52 / damping 16   ours 0.50 s   Framer 1.46 s   2.9x too fast
//
// 55 of the 58 springs in `test/fixtures` were off by more than 15 %, all of
// them too fast. The cause is not a unit or a typo: the settle formula answers
// "when is the spring within 2 % of its target", while Framer answers "when is
// it within a distance-dependent rest threshold" — two different questions.
//
// Where the reference comes from: every Framer page inlines a ~11 KB
// `var animator = {…}` with exactly four members (`animateAppearEffects`,
// `getActiveVariantHash`, `spring`, `startOptimizedAppearAnimation`). `spring`
// returns the generator Framer hands to `Element.animate`. Loading that bundle
// in Node and comparing it with the curve measured live in the browser gave an
// exact match (`linear(0, 0.0034, 0.0128, 0.0273, 0.0459, …)`, deviation
// 0.0000) — so the ported code is checked against the original, not against a
// second approximation.
//
// The port keeps Framer's own constants and control flow (rest thresholds,
// 10 ms sampling, 20 s ceiling, the 30-step `linear()` serialisation). What it
// does NOT do: change the curve. A spring is a linear system, so the normalised
// shape does not depend on the distance; only the settle time does.

export type SpringTransition = {
  type?: string;
  stiffness?: number;
  damping?: number;
  mass?: number;
  // SECONDS, like the appear channel it comes from (`IrAppearTransition`).
  // Framer's own `animator.spring()` speaks milliseconds; this module converts
  // at the one place that resolves the config, so no caller has to guess.
  duration?: number;
  bounce?: number;
  velocity?: number;
  delay?: number;
};

// Framer's defaults (`g` in the animator bundle).
const DEFAULTS = {
  stiffness: 100,
  damping: 10,
  mass: 1,
  velocity: 0,
  duration: 800,
  bounce: 0.3,
  restSpeedGranular: 0.01,
  restSpeedDefault: 2,
  restDeltaGranular: 0.005,
  restDeltaDefault: 0.5,
  minDuration: 0.01,
  maxDuration: 10,
  minDamping: 0.05,
  maxDamping: 1,
  // `oe` in the bundle: the tiny offset that keeps the solver off a zero.
  epsilon: 0.001,
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

// `ne(e, r) = e * sqrt(1 - r²)` — the damped angular frequency factor.
const dampedOf = (value: number, ratio: number): number => value * Math.sqrt(1 - ratio * ratio);

// `Ge`: duration + bounce to stiffness/damping/mass. Newton over the analytic
// decay, 11 iterations, starting at `5 / duration` — Framer's numbers, not a
// "good enough" solve: a different iteration count lands on a different spring.
export function springFromDuration(input: {
  duration?: number;
  bounce?: number;
  velocity?: number;
  mass?: number;
}): { stiffness: number; damping: number; duration: number } {
  const mass = input.mass ?? DEFAULTS.mass;
  const bounce = input.bounce ?? DEFAULTS.bounce;
  const velocity = input.velocity ?? DEFAULTS.velocity;
  const ratio = clamp(1 - bounce, DEFAULTS.minDamping, DEFAULTS.maxDamping);
  // The duration arrives in milliseconds and is solved in seconds.
  const seconds = clamp((input.duration ?? DEFAULTS.duration) / 1000, DEFAULTS.minDuration, DEFAULTS.maxDuration);
  // Framer's `Ke`: Newton from `5/duration`, 11 iterations. The loop runs while
  // `s < 12`, i.e. the last step is s = 11 — one more than the 10 a naive port
  // would copy.
  const iterations = 12;

  let solve: (value: number) => number;
  let derivative: (value: number) => number;
  if (ratio < 1) {
    solve = (value) => {
      const scaled = value * ratio;
      const exponent = scaled * seconds;
      const offset = scaled - velocity;
      const frequency = dampedOf(value, ratio);
      const decay = Math.exp(-exponent);
      return DEFAULTS.epsilon - (offset / frequency) * decay;
    };
    derivative = (value) => {
      const exponent = value * ratio * seconds;
      const offset = exponent * velocity + velocity;
      const squared = value * value * ratio * ratio * seconds;
      const decay = Math.exp(-exponent);
      const frequency = dampedOf(value * value, ratio);
      // The sign is Framer's `-s(m) + oe > 0 ? -1 : 1`, not `s(m) + oe`:
      // inverting it made Newton walk away from the root (stiffness 314 instead
      // of 269 for duration 600 / bounce 0.3) and the effect ran three times
      // too slow. Measured against `Ge` in the page bundle.
      return ((-solve(value) + DEFAULTS.epsilon > 0 ? -1 : 1) * ((offset - squared) * decay)) / frequency;
    };
  } else {
    solve = (value) => {
      const decay = Math.exp(-value * seconds);
      const offset = (value - velocity) * seconds + 1;
      return -DEFAULTS.epsilon + decay * offset;
    };
    derivative = (value) => {
      const decay = Math.exp(-value * seconds);
      const offset = (velocity - value) * seconds * seconds;
      return decay * offset;
    };
  }

  let root = 5 / seconds;
  for (let iteration = 1; iteration < iterations; iteration += 1) {
    root -= solve(root) / derivative(root);
  }
  const duration = seconds * 1000;
  if (!Number.isFinite(root)) {
    return { stiffness: DEFAULTS.stiffness, damping: DEFAULTS.damping, duration };
  }
  const stiffness = root * root * mass;
  return { stiffness, damping: ratio * 2 * Math.sqrt(mass * stiffness), duration };
}

type Resolved = {
  stiffness: number;
  damping: number;
  mass: number;
  velocity: number;
  duration: number;
  isResolvedFromDuration: boolean;
};

// `ze`: decide whether the transition speaks stiffness/damping/mass or
// duration/bounce, and resolve the latter into the former.
function resolveConfig(transition: SpringTransition): Resolved {
  const has = (keys: readonly string[]): boolean => keys.some((key) => (transition as Record<string, unknown>)[key] !== undefined);
  const base: Resolved = {
    stiffness: transition.stiffness ?? DEFAULTS.stiffness,
    damping: transition.damping ?? DEFAULTS.damping,
    mass: transition.mass ?? DEFAULTS.mass,
    velocity: transition.velocity ?? DEFAULTS.velocity,
    duration: transition.duration ?? DEFAULTS.duration,
    isResolvedFromDuration: false,
  };
  // Framer only converts when the physical parameters are absent: a transition
  // that names both is taken at its word.
  if (!has(["stiffness", "damping", "mass"]) && has(["duration", "bounce"])) {
    // `duration` is seconds here and milliseconds in Framer's own API.
    const resolved = springFromDuration({
      ...transition,
      duration: (transition.duration ?? DEFAULTS.duration / 1000) * 1000,
      velocity: 0,
      mass: DEFAULTS.mass,
    });
    return {
      ...base,
      stiffness: resolved.stiffness,
      damping: resolved.damping,
      mass: DEFAULTS.mass,
      velocity: 0,
      duration: resolved.duration,
      isResolvedFromDuration: true,
    };
  }
  return base;
}

export type SpringGenerator = {
  // Time in milliseconds, value in the unit of `from`/`to`.
  next(timeMs: number): { done: boolean; value: number };
};

export type SpringState = { done: boolean; value: number };

// `E`: the generator Framer builds per animated property. `from` and `to` are
// the property's own values, so the rest thresholds are distance-dependent.
export function springGenerator(transition: SpringTransition, from: number, to: number): SpringGenerator {
  const { stiffness, damping, mass, velocity, duration, isResolvedFromDuration } = resolveConfig(transition);
  // Framer hands the velocity over in seconds and negated (`-O(t.velocity||0)`).
  const initialVelocity = -velocity / 1000;
  const ratio = damping / (2 * Math.sqrt(stiffness * mass));
  const distance = to - from;
  // Per-millisecond angular frequency: `next()` takes milliseconds.
  const omega = Math.sqrt(stiffness / mass) / 1000;
  // A travel under 5 units is measured with the fine thresholds: a 0.001
  // opacity is treated like a progress value, 40 px like a distance.
  const fine = Math.abs(distance) < 5;
  const restSpeed = fine ? DEFAULTS.restSpeedGranular : DEFAULTS.restSpeedDefault;
  const restDelta = fine ? DEFAULTS.restDeltaGranular : DEFAULTS.restDeltaDefault;

  let valueAt: (timeMs: number) => number;
  let velocityAt: (timeMs: number) => number;

  if (ratio < 1) {
    const frequency = dampedOf(omega, ratio);
    const coefficient = (initialVelocity + ratio * omega * distance) / frequency;
    valueAt = (time) => {
      const decay = Math.exp(-ratio * omega * time);
      return to - decay * (coefficient * Math.sin(frequency * time) + distance * Math.cos(frequency * time));
    };
    const a = ratio * omega * coefficient + distance * frequency;
    const b = ratio * omega * distance - coefficient * frequency;
    velocityAt = (time) => Math.exp(-ratio * omega * time) * (a * Math.sin(frequency * time) + b * Math.cos(frequency * time));
  } else if (ratio === 1) {
    valueAt = (time) => to - Math.exp(-omega * time) * (distance + (initialVelocity + omega * distance) * time);
    const a = initialVelocity + omega * distance;
    velocityAt = (time) => Math.exp(-omega * time) * (omega * a * time - initialVelocity);
  } else {
    const frequency = omega * Math.sqrt(ratio * ratio - 1);
    // `Math.min(±frequency * time, 300)` keeps `sinh`/`cosh` finite.
    const expOf = (time: number): { decay: number; spread: number } => ({
      decay: Math.exp(-ratio * omega * time),
      spread: Math.min(frequency * time, 300),
    });
    valueAt = (time) => {
      const { decay, spread } = expOf(time);
      return (
        to -
        (decay * ((initialVelocity + ratio * omega * distance) * Math.sinh(spread) + frequency * distance * Math.cosh(spread))) /
          frequency
      );
    };
    const a = (initialVelocity + ratio * omega * distance) / frequency;
    const b = ratio * omega * a - distance * frequency;
    const c = ratio * omega * distance - a * frequency;
    velocityAt = (time) => {
      const { decay, spread } = expOf(time);
      return decay * (b * Math.sinh(spread) + c * Math.cosh(spread));
    };
  }

  const state: SpringState = { done: false, value: from };
  return {
    next(time) {
      if (!isResolvedFromDuration && ratio < 1) {
        // Analytic form: the rest test is the only stop.
        const value = valueAt(time);
        const speed = velocityAt(time) * 1000;
        state.done = Math.abs(speed) <= restSpeed && Math.abs(to - value) <= restDelta;
        state.value = state.done ? to : value;
        return { done: state.done, value: state.value };
      }
      const value = valueAt(time);
      if (isResolvedFromDuration) {
        // A bounce/duration spring has a stated length; the curve is read to
        // that length and no further.
        state.done = time >= duration;
      } else {
        const speed = velocityAt(time) * 1000;
        state.done = Math.abs(speed) <= restSpeed && Math.abs(to - value) <= restDelta;
      }
      state.value = state.done ? to : value;
      return { done: state.done, value: state.value };
    },
  };
}

// Framer's sampling for the appear path (`Qe`): 10 ms steps until the generator
// reports rest, ceiling 10 s. The duration is the time of the LAST sample — the
// one that reported rest — so `values.length` is `duration / 10 + 1`.
export function springFrames(
  transition: SpringTransition,
  from: number,
  to: number,
  stepMs = 10,
): { durationMs: number; values: number[] } {
  const generator = springGenerator(transition, from, to);
  const values: number[] = [];
  let time = 0;
  let state = generator.next(0);
  values.push(state.value);
  while (!state.done && time < 10000) {
    time += stepMs;
    state = generator.next(time);
    values.push(state.value);
  }
  return { durationMs: time, values };
}

// The settle time of one property, in milliseconds.
export function springDurationMs(transition: SpringTransition, from: number, to: number, stepMs = 10): number {
  return springFrames(transition, from, to, stepMs).durationMs;
}

// The normalised curve 0 → 1 of the same spring, sampled at `stops` points over
// `durationMs`. This is what goes into the `animation` shorthand: because a
// spring is linear in its keyframes, the normalised shape is the same for every
// distance (checked against Framer's generator: `kf[0,2]/2` equals `kf[0,1]` at
// every sampled time), so one curve can serve every property of an effect.
export function springEasing(transition: SpringTransition, durationMs: number, stops = 30): number[] {
  const generator = springGenerator(transition, 0, 1);
  const count = Math.max(2, stops);
  const values: number[] = [];
  if (durationMs <= 0) return [0, 1];
  for (let index = 0; index < count; index += 1) {
    const time = (durationMs * index) / (count - 1);
    const state = generator.next(time);
    values.push(Math.round(state.value * 1e4) / 1e4);
  }
  return values;
}

// Framer's own serialisation (`toString`): `"{duration}ms linear(…)"`, 30
// samples. The CSS `animation` shorthand takes the same text, so a baked effect
// carries the curve exactly as the source described it.
export function springTimingCss(transition: SpringTransition, durationMs: number, stops = 30): string {
  const values = springEasing(transition, durationMs, stops);
  return `linear(${values.join(", ")})`;
}
