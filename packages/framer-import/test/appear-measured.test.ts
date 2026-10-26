import { describe, expect, it } from "vitest";
import { compileAppearRules } from "../src/appear-css.ts";
import type { IrAppearSpec } from "../src/ir.ts";

// The measured reveal: what the browser actually played, not what the static
// appear JSON describes. Framer's runtime hands `element.animate()` a ready-made
// CSS timing function — a sampled `linear(…)` curve with one stop per frame of
// the solved spring. Written verbatim it reproduces the motion exactly; deriving
// a spring from stiffness and damping would only approximate it.
//
// Measured on `rare-works` (26.10.2026): 299 of 391 animations carry such a
// curve, 283 of them `linear(…)`. The probe used to cut the string at 120
// characters, which left a curve that ended at 7.9 % — a value CSS rejects, so
// every measured reveal was dropped as `invalid-value` and the baked page showed
// the headline as one block instead of word by word.
const MEASURED: IrAppearSpec = {
  appearId: "n4",
  variants: {
    default: {
      initial: { opacity: 0.001, y: 28 },
      animate: {
        opacity: 1,
        y: 0,
        transition: {
          type: "sampled",
          duration: 0.9,
          delay: 0.2,
          easing: "linear(0 0%,0.3422 7.9545%,0.7176 20%,1 100%)",
        },
      },
    },
  },
};

const compile = (specs: IrAppearSpec[]): ReturnType<typeof compileAppearRules> =>
  compileAppearRules({
    specs,
    breakpoints: [],
    nodeIdByAppearId: new Map(specs.map((spec) => [spec.appearId, "fi1"])),
    scope: "test",
  });

describe("gemessene Einblendung als CSS", () => {
  it("schreibt die gemessene Timing-Kurve unverändert in die Animation", () => {
    const result = compile([MEASURED]);
    expect(result.rules).toHaveLength(1);
    const animation = result.rules[0]?.animation["animation"] ?? "";
    expect(animation).toContain("linear(0 0%,0.3422 7.9545%,0.7176 20%,1 100%)");
    // Duration and delay come from the measurement too (seconds in the channel).
    expect(animation).toContain("0.9s");
    expect(animation).toContain("0.2s");
  });

  it("nimmt Start- und Endzustand aus der Messung, nicht aus einem Preset", () => {
    const result = compile([MEASURED]);
    const keyframes = result.rules[0]?.keyframes[0] ?? "";
    expect(keyframes).toContain("opacity:0.001");
    expect(keyframes).toContain("translateY(28px)");
    expect(keyframes).toContain("opacity:1");
    expect(keyframes).toContain("transform:none");
  });

  it("lässt eine Kurve mit Prozent-Stützstellen ganz, auch wenn sie lang ist", () => {
    // A solved spring comes with one stop per frame: 140 of them, ~1400 chars.
    const stops = Array.from({ length: 140 }, (_, index) => {
      const t = index / 139;
      return `${(1 - (1 - t) ** 3).toFixed(4)} ${(t * 100).toFixed(4)}%`;
    }).join(",");
    const curve = `linear(${stops})`;
    const result = compile([
      {
        ...MEASURED,
        variants: {
          default: {
            ...MEASURED.variants["default"],
            animate: { ...MEASURED.variants["default"]?.animate, transition: { duration: 1, easing: curve } },
          },
        },
      },
    ]);
    const animation = result.rules[0]?.animation["animation"] ?? "";
    // The END of the curve is what was lost before: the string stopped at 7.9 %
    // and the declaration became invalid CSS.
    expect(animation).toContain("100.0000%)");
  });

  it("fällt ohne gemessene Kurve auf die Feder zurück, die der Kanal nennt", () => {
    const result = compile([
      {
        appearId: "spring",
        variants: {
          default: {
            initial: { opacity: 0 },
            animate: { opacity: 1, transition: { type: "spring", stiffness: 100, damping: 20, mass: 1 } },
          },
        },
      },
    ]);
    const animation = result.rules[0]?.animation["animation"] ?? "";
    expect(animation).not.toContain("linear(");
    expect(/ease-out|cubic-bezier/.test(animation)).toBe(true);
  });
});
