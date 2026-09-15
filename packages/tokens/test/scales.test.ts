import { describe, expect, it } from "vitest";
import {
  buildColorScale,
  buildFluidSize,
  buildRadius,
  buildShadow,
  buildSpacing,
  buildTypeScale,
  shadeToHex,
  springDurationMs,
  springToLinear,
} from "@senify/tokens";
import { parseColor, relativeLuminance } from "@senify/tokens";

describe("shade scales", () => {
  it("builds ten steps with falling luminance", () => {
    const scale = buildColorScale("#4f46e5");
    expect(Object.keys(scale).sort()).toEqual([
      "100",
      "200",
      "300",
      "400",
      "50",
      "500",
      "600",
      "700",
      "800",
      "900",
    ]);
    const luminance = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"].map(
      (step) => relativeLuminance(parseColor(scale[step] ?? "")),
    );
    for (let index = 1; index < luminance.length; index += 1) {
      expect(luminance[index]).toBeLessThan(luminance[index - 1] ?? 0);
    }
    for (const value of Object.values(scale)) {
      expect(value).toMatch(/^oklch\(/);
      expect(() => shadeToHex(value)).not.toThrow();
    }
  });
});

describe("fluid type", () => {
  it("emits clamp() between viewports", () => {
    const size = buildFluidSize(16, 20);
    expect(size).toMatch(/^clamp\(1rem, -?[\d.]+vw \+ [\d.]+rem, 1\.25rem\)$/);
  });

  it("builds roles with tags and rhythm", () => {
    const scale = buildTypeScale(16, 1.25);
    expect(scale.h1.tag).toBe("h1");
    expect(scale.body.tag).toBe("p");
    expect(scale.body.lineHeight).toBeGreaterThan(scale.h1.lineHeight);
    expect(scale.display.letterSpacing).toContain("-");
  });
});

describe("spacing, radius, shadow", () => {
  it("covers the framer rhythm on a 4px grid", () => {
    const spacing = buildSpacing(4);
    expect(spacing["0"]).toBe("0");
    expect(spacing["1"]).toBe("0.25rem");
    expect(spacing["4"]).toBe("1rem");
    expect(spacing["5"]).toBe("1.25rem");
    expect(spacing["20"]).toBe("5rem");
    expect(spacing["50"]).toBe("12.5rem");
  });

  it("scales radius from a base length", () => {
    const radius = buildRadius("0.5rem");
    expect(radius).toEqual({
      sm: "0.25rem",
      md: "0.5rem",
      lg: "1rem",
      xl: "1.5rem",
      full: "9999px",
    });
  });

  it("tints shadows with the brand color", () => {
    const shadow = buildShadow("#4f46e5");
    expect(shadow.md).toContain("rgb(79 70 229 / 0.12)");
  });
});

describe("springs", () => {
  it("samples an underdamped spring as linear()", () => {
    const css = springToLinear({ type: "spring", stiffness: 180, damping: 12 });
    expect(css.startsWith("linear(0, ")).toBe(true);
    expect(css.endsWith(", 1)")).toBe(true);
    const stops = css.slice("linear(".length, -1).split(", ");
    expect(stops.length).toBeGreaterThan(10);
  });

  it("derives realistic durations from stiffness and damping", () => {
    const bouncy = springDurationMs({ type: "spring", stiffness: 180, damping: 12 });
    expect(bouncy).toBeGreaterThan(500);
    expect(bouncy).toBeLessThan(1000);
    const soft = springDurationMs({ type: "spring", stiffness: 170, damping: 26 });
    expect(soft).toBeLessThan(bouncy);
  });

  it("samples overdamped springs without oscillation", () => {
    const css = springToLinear(
      { type: "spring", stiffness: 100, damping: 30 },
      { steps: 12 },
    );
    const values = css
      .slice("linear(".length, -1)
      .split(", ")
      .map((stop) => Number.parseFloat(stop.split(" ")[0] ?? "0"));
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index] ?? 0).toBeGreaterThanOrEqual((values[index - 1] ?? 0) - 0.001);
    }
    expect(values[values.length - 1]).toBe(1);
  });
});
