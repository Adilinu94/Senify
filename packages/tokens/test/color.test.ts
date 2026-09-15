import { describe, expect, it } from "vitest";
import {
  hexToRgb,
  oklchToCss,
  parseColor,
  relativeLuminance,
  rgbToHex,
  rgbToOklch,
} from "@senify/tokens";

describe("color math", () => {
  it("roundtrips hex colors", () => {
    for (const hex of ["#4f46e5", "#ffffff", "#000000", "#6f6a63", "#abc"]) {
      expect(rgbToHex(hexToRgb(hex)).toLowerCase()).toBe(
        hex.length === 4
          ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase()
          : hex.toLowerCase(),
      );
    }
  });

  it("matches known oklch anchors", () => {
    const white = rgbToOklch({ r: 255, g: 255, b: 255 });
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeCloseTo(0, 3);
    const black = rgbToOklch({ r: 0, g: 0, b: 0 });
    expect(black.l).toBeCloseTo(0, 3);
    const red = rgbToOklch({ r: 255, g: 0, b: 0 });
    expect(red.l).toBeCloseTo(0.628, 2);
    expect(red.c).toBeCloseTo(0.258, 2);
    expect(red.h).toBeCloseTo(29.2, 0);
    expect(oklchToCss({ l: 1, c: 0, h: 0 })).toBe("oklch(1 0 0)");
  });

  it("parses rgb() and oklch() notations", () => {
    expect(parseColor("rgb(255, 0, 0)")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor("rgb(100% 0% 0%)")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor("oklch(1 0 0)")).toEqual({ r: 255, g: 255, b: 255 });
    expect(() => parseColor("papayawhip")).toThrow();
    expect(() => parseColor("#xyz")).toThrow();
  });

  it("rejects alpha-carrying inputs instead of dropping alpha", () => {
    expect(() => parseColor("#ff000080")).toThrow(/alpha/i);
    expect(() => parseColor("rgb(255 0 0 / 50%)")).toThrow(/alpha/i);
    expect(() => parseColor("rgba(255, 0, 0, 0.5)")).toThrow(/alpha/i);
    expect(() => parseColor("oklch(0.6 0.2 30 / 50%)")).toThrow(/alpha/i);
  });

  it("computes relative luminance endpoints", () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});
