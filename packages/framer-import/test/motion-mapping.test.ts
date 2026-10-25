import { describe, expect, it } from "vitest";
import { mapFramerMotion, type FramerIrDocument } from "@senify/framer-import";

function documentWith(samples: FramerIrDocument["motion"]): FramerIrDocument {
  return {
    ir: 1,
    source: { kind: "browser", url: "https://example.test", projectId: null, capturedAt: "2026-09-24T00:00:00.000Z", contentHash: "motion" },
    breakpoints: [],
    pages: [],
    styles: { colors: [], textPresets: [], fonts: [] },
    assets: [],
    motion: samples,
    findings: [],
  };
}

describe("Framer motion mapping", () => {
  it("maps measured samples to closed Senify presets with reduced motion", () => {
    const result = mapFramerMotion(documentWith([
      // The appear channel speaks seconds: 0.9 s, 0.12 s delay, 2 s stagger.
      { nodeKey: "headline", library: "framer", trigger: "appear", params: { duration: 0.9, durationUnit: "s", delay: 0.12, stagger: 2 }, raw: "appear" },
      { nodeKey: "section", library: "framer", trigger: "inview", params: { registrations: 1 }, raw: "IO" },
      { nodeKey: "card", library: "framer", trigger: "scroll", params: { delta: 40 }, raw: "scroll" },
      // The WAAPI probe speaks milliseconds: 140 s.
      { nodeKey: "ticker", library: "waapi", trigger: "time", params: { name: "translateX", duration: 140000, durationUnit: "ms", iterations: "endless" }, raw: "loop" },
    ]));
    expect(result.measured).toBe(4);
    expect(result.mapped).toBe(4);
    expect(result.documented).toBe(0);
    expect(result.mappings.map((entry) => entry.preset)).toEqual(["fade-up", "scroll-reveal", "parallax-subtle", "marquee"]);
    expect(result.mappings.every((entry) => entry.spec.reducedMotion === "static")).toBe(true);
    expect(result.mappings[0]?.spec.delay).toBe(0.12);
    // 0.9 s against the default base of 300 ms is a scale of 3: Mapper and
    // runtime agree, the baked reveal runs 900 ms.
    expect(result.mappings[0]?.spec.tokens?.durationScale).toBe(3);
  });

  it("bakes the source duration, not a fraction of it (the 1.4 s reveal)", () => {
    // Measured on a real page: the appear channel writes `duration: 1.4`.
    // The old mapper divided by 300 as if it were milliseconds and produced a
    // scale of 0.0047 — clamped to 0.1, which the renderer turned into 30 ms.
    const result = mapFramerMotion(documentWith([
      { nodeKey: "hero", library: "framer", trigger: "appear", params: { duration: 1.4, durationUnit: "s", fromY: 40 }, raw: "appear 1.4s" },
    ]));
    const scale = result.mappings[0]?.spec.tokens?.durationScale ?? 0;
    expect(scale).toBeCloseTo(4.667, 3);
    // The renderer's formula, quoted from motion.ts:156: the reveal must be
    // 1400 ms, not 30 ms.
    expect(Math.round(scale * 300)).toBe(1400);
  });

  it("takes the theme's base duration instead of assuming 300 ms", () => {
    const sample = { nodeKey: "hero", library: "framer" as const, trigger: "appear" as const, params: { duration: 1.4, durationUnit: "s", fromY: 40 }, raw: "appear 1.4s" };
    const withBase600 = mapFramerMotion(documentWith([sample]), { baseDurationMs: 600 });
    // 1.4 s in a theme whose base is 600 ms is a scale of 2.33 — the same 1400 ms.
    expect(Math.round((withBase600.mappings[0]?.spec.tokens?.durationScale ?? 0) * 600)).toBe(1400);
  });

  it("reads a millisecond sample as milliseconds when it names its unit", () => {
    const result = mapFramerMotion(documentWith([
      { nodeKey: "grow", library: "waapi", trigger: "appear", params: { duration: 600, durationUnit: "ms" }, raw: "waapi 600ms" },
    ]));
    // 600 ms against the 300 ms base is a scale of 2 → 600 ms baked.
    expect(result.mappings[0]?.spec.tokens?.durationScale).toBe(2);
  });

  it("keeps the older convention for a sample without a unit", () => {
    // Documents captured before the field existed carry milliseconds. Dropping
    // the field must not silently turn 600 ms into 0.6 ms.
    const result = mapFramerMotion(documentWith([
      { nodeKey: "old", library: "waapi", trigger: "appear", params: { duration: 600 }, raw: "legacy" },
    ]));
    expect(result.mappings[0]?.spec.tokens?.durationScale).toBe(2);
  });

  it("documents a sample outside the closed registry", () => {
    const result = mapFramerMotion(documentWith([
      { nodeKey: "unknown", library: "framer", trigger: "click", params: { keyframes: 12 }, raw: "click timeline" },
    ]));
    expect(result.mapped).toBe(0);
    expect(result.documented).toBe(1);
    expect(result.findings[0]?.reason).toContain("geschlossene Senify-Motion-Registry");
  });
});
