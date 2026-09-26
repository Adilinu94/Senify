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
      { nodeKey: "headline", library: "framer", trigger: "appear", params: { duration: 900, delay: 120, stagger: 2 }, raw: "appear" },
      { nodeKey: "section", library: "framer", trigger: "inview", params: { registrations: 1 }, raw: "IO" },
      { nodeKey: "card", library: "framer", trigger: "scroll", params: { delta: 40 }, raw: "scroll" },
      { nodeKey: "ticker", library: "waapi", trigger: "time", params: { name: "translateX", duration: 140000, iterations: "endless" }, raw: "loop" },
    ]));
    expect(result.measured).toBe(4);
    expect(result.mapped).toBe(4);
    expect(result.documented).toBe(0);
    expect(result.mappings.map((entry) => entry.preset)).toEqual(["fade-up", "scroll-reveal", "parallax-subtle", "marquee"]);
    expect(result.mappings.every((entry) => entry.spec.reducedMotion === "static")).toBe(true);
    expect(result.mappings[0]?.spec.delay).toBe(120);
    expect(result.mappings[0]?.spec.tokens?.durationScale).toBe(3);
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
