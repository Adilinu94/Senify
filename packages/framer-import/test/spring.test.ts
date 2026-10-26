import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  springDurationMs,
  springEasing,
  springFrames,
  springFromDuration,
  springGenerator,
  springTimingCss,
} from "../src/spring.ts";

// The reference is not a second formula — it is FRAMER'S OWN SOLVER, taken from
// the `var animator = {…}` block every Framer page inlines. The fixture page
// ships it, so this test does not assert against a hand-written expectation
// that could drift with the port; it runs the original next to the copy.
//
// This is the finding of 26.10.2026: the previous approximation (`4/(ζ·ω0)` plus
// a fixed `cubic-bezier`) was off by up to 8× — every one of the 55 springs in
// the fixtures was too fast. A test that only compared the port to itself would
// have missed that; this one cannot.
const FIXTURE = join(import.meta.dirname, "fixtures", "framer-easier-train-154753", "index.html");

type Animator = {
  spring(options: Record<string, unknown> & { keyframes: [number, number] }): {
    next(timeMs: number): { done: boolean; value: number };
  };
  _Ge?: (options: Record<string, unknown>) => { stiffness: number; damping: number; duration: number };
};

// The bundle is written to a temp module and imported: it is an IIFE that ends
// in `var animator = …`, and a module import keeps the test free of `eval`.
const outDir = mkdtempSync(join(tmpdir(), "senify-framer-animator-"));
let cached: Animator | undefined;

async function framersAnimator(): Promise<Animator> {
  if (cached !== undefined) return cached;
  const html = readFileSync(FIXTURE, "utf8");
  const start = html.indexOf("var animator=");
  if (start === -1) throw new Error("die Fixture bringt keinen animator mehr mit");
  let bundle = html.slice(start, html.indexOf("</script>", start));
  // The bundle only exports four members. `Ge` (the duration/bounce solver) is
  // reached through the same closure, so it is added to the return object for
  // this test — the CODE stays Framer's, only the export list is widened.
  bundle = bundle.replace("var animator=", "var animatorRef=");
  bundle = bundle.replace("return kt})()", "return {...kt, _Ge: Ge}})()");
  // The bundle reads these while it initialises its browser feature flags.
  const scope = `globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ animate: () => ({}) }) };
`;
  const file = join(outDir, "animator.mjs");
  writeFileSync(file, `${scope}${bundle}\nexport default animatorRef;\n`);
  // `pathToFileURL` handles the Windows drive letter and every space/backslash
  // a temp path can carry; string concatenation produced an invalid URL.
  const module = (await import(pathToFileURL(file).href)) as { default: Animator };
  cached = module.default;
  return cached;
}

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

// Framer's appear sampling (`Qe`): 10 ms steps until the generator reports rest.
function framerFrames(
  animator: Animator,
  transition: Record<string, unknown>,
  from: number,
  to: number,
): { durationMs: number; values: number[] } {
  const config = { ...transition } as Record<string, unknown> & { keyframes?: [number, number] };
  // The appear channel writes seconds; `animator.spring()` reads milliseconds.
  if (typeof config["duration"] === "number") config["duration"] = (config["duration"] as number) * 1000;
  delete config["delay"];
  const generator = animator.spring({ ...config, keyframes: [from, to] } as never);
  const values: number[] = [];
  let time = 0;
  let state = generator.next(0);
  values.push(state.value);
  while (!state.done && time < 20000) {
    time += 10;
    state = generator.next(time);
    values.push(state.value);
  }
  return { durationMs: time, values };
}

// Every spring shape the fixtures actually carry, plus the shapes the appear
// channel writes as duration/bounce.
const SHAPES: { transition: Record<string, unknown>; note: string }[] = [
  { transition: { type: "spring", stiffness: 140, damping: 40, mass: 1 }, note: "überdämpft, 8× zu schnell" },
  { transition: { type: "spring", stiffness: 100, damping: 40, mass: 4 }, note: "schwere Masse" },
  { transition: { type: "spring", stiffness: 160, damping: 30, mass: 1 }, note: "Standard-Reveal" },
  { transition: { type: "spring", stiffness: 165, damping: 32, mass: 1 }, note: "Wort-Einblendung" },
  { transition: { type: "spring", stiffness: 52, damping: 16, mass: 1 }, note: "weiche Feder" },
  { transition: { type: "spring", stiffness: 300, damping: 60, mass: 1 }, note: "harte Feder" },
  { transition: { type: "spring", stiffness: 100, damping: 10, mass: 1 }, note: "unterdämpft (überschwingt)" },
  { transition: { type: "spring", stiffness: 137, damping: 30, mass: 4.3 }, note: "krumme Masse" },
  { transition: { type: "spring", stiffness: 137, damping: 30, mass: 1.4 }, note: "krumme Masse, leicht" },
  { transition: { type: "spring", duration: 0.8, bounce: 0 }, note: "Dauer/Bounce, kein Überschwingen" },
  { transition: { type: "spring", duration: 0.6, bounce: 0.3 }, note: "Dauer/Bounce mit Überschwingen" },
  { transition: { type: "spring", duration: 1.1, bounce: 0 }, note: "Dauer/Bounce, lang" },
  { transition: { type: "spring", duration: 0.4 }, note: "Dauer ohne Bounce" },
];

// Distances a reveal actually covers: an opacity step (~1), a translation
// (28/40/150 px) and a scale step. The rest threshold is distance-dependent,
// so a port that only tests opacity would pass with the wrong duration.
const DISTANCES = [1, 28, 150];

describe("Framer's spring solver, ported", () => {
  it("reproduces duration and every sampled value of the original", async () => {
    const animator = await framersAnimator();
    const deviations: string[] = [];
    for (const { transition, note } of SHAPES) {
      for (const distance of DISTANCES) {
        const reference = framerFrames(animator, transition, 0, distance);
        const ported = springFrames(transition, 0, distance);
        if (ported.durationMs !== reference.durationMs) {
          deviations.push(
            `${note} @${distance}: Dauer ${ported.durationMs} ms statt ${reference.durationMs} ms`,
          );
          continue;
        }
        const length = Math.max(ported.values.length, reference.values.length);
        for (let index = 0; index < length; index += 1) {
          const expected = reference.values[index] ?? reference.values[reference.values.length - 1] ?? 0;
          const actual = ported.values[index] ?? ported.values[ported.values.length - 1] ?? 0;
          if (Math.abs(expected - actual) > 1e-9) {
            deviations.push(`${note} @${distance} t=${index * 10} ms: ${actual} statt ${expected}`);
            break;
          }
        }
      }
    }
    expect(deviations).toEqual([]);
  });

  it("resolves duration/bounce into the same stiffness and damping", async () => {
    const animator = await framersAnimator();
    // `Ge` is reached from the same closure: the code is Framer's own.
    expect(animator._Ge).toBeTypeOf("function");
    const deviations: string[] = [];
    for (const { duration, bounce } of [
      { duration: 600, bounce: 0.3 },
      { duration: 800, bounce: 0 },
      { duration: 400, bounce: undefined },
      { duration: 1100, bounce: 0 },
    ]) {
      const reference = animator._Ge!({ duration, bounce, velocity: 0, mass: 1 });
      const ported = springFromDuration({ duration, bounce, velocity: 0, mass: 1 });
      if (Math.abs(reference.stiffness - ported.stiffness) > 1e-9) {
        deviations.push(`${duration}/${bounce}: stiffness ${ported.stiffness} statt ${reference.stiffness}`);
      }
      if (Math.abs(reference.damping - ported.damping) > 1e-9) {
        deviations.push(`${duration}/${bounce}: damping ${ported.damping} statt ${reference.damping}`);
      }
    }
    expect(deviations).toEqual([]);
  });

  it("gives the wave that was measured live in the browser", () => {
    // From `docs/research/framer-animationen-abgreifen.md`: the word reveal on
    // `concerned-circumstances-187935` runs 1100 ms with
    // `linear(0, 0.0034, 0.0128, 0.0273, 0.0459, …)`. That curve came out of a
    // real browser, not out of this port — it is the outside check.
    const transition = { type: "spring", duration: 1.1, bounce: 0 };
    expect(springDurationMs(transition, 0, 1)).toBe(1100);
    const easing = springEasing(transition, 1100, 111);
    expect(easing.slice(0, 5)).toEqual([0, 0.0033, 0.0126, 0.0269, 0.0452]);
    // Four decimals of the measured curve: the two agree within one step.
    for (const [index, measured] of [0.0034, 0.0128, 0.0273, 0.0459].entries()) {
      expect(Math.abs((easing[index + 1] ?? 0) - measured)).toBeLessThan(0.0016);
    }
  });

  it("is linear in the distance, so one curve serves every property", () => {
    // This is what lets the compiler emit ONE `linear()` per effect even though
    // Framer samples every property separately: `spring[0,2](t) / 2` equals
    // `spring[0,1](t)`. A port that got this wrong would need a curve per
    // property — or bake the wrong one.
    const transition = { type: "spring", stiffness: 165, damping: 32, mass: 1 };
    const short = springGenerator(transition, 0, 1);
    const long = springGenerator(transition, 0, 2);
    for (const time of [0, 50, 100, 250, 500, 900]) {
      expect(Math.abs(long.next(time).value / 2 - short.next(time).value)).toBeLessThan(1e-12);
    }
  });

  it("writes the curve as a CSS value Framer would write", () => {
    const timing = springTimingCss({ type: "spring", duration: 0.8, bounce: 0 }, 800, 30);
    expect(timing.startsWith("linear(0, ")).toBe(true);
    expect(timing.endsWith(", 1)")).toBe(true);
    // 30 stops, like Framer's own `toString`.
    expect(timing.slice("linear(".length, -1).split(",")).toHaveLength(30);
  });

  it("keeps a plain duration linear", () => {
    // `Ye` in the bundle: no spring, just the stated duration and the two ends.
    expect(springDurationMs({ type: "duration", duration: 0.4 }, 0, 1)).toBe(400);
    const frames = springFrames({ type: "duration", duration: 0.4 }, 0, 40);
    expect(frames.values[0]).toBe(0);
    expect(frames.values[frames.values.length - 1]).toBe(40);
  });
});
