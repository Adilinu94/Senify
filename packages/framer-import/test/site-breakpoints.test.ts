import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captureFixture, siteBreakpointsOf, type IrBreakpoint } from "@senify/framer-import";

// ADR-0020: the import reads the source's own breakpoints, so the baked page
// switches layouts where the original does.

const FIXTURES = join(import.meta.dirname, "fixtures");

function range(minWidth: number, maxWidth: number | null, id = `r${minWidth}`): IrBreakpoint {
  return { id, minWidth, maxWidth, name: null };
}

describe("siteBreakpointsOf", () => {
  it("reads the usual Framer setup: desktop from 1200, tablet 810–1199, mobile below", () => {
    expect(siteBreakpointsOf([range(1200, null), range(810, 1199.98), range(0, 809.98)])).toEqual({
      tablet: 1200,
      mobile: 810,
    });
  });

  it("reads a wider desktop: tablet runs up to 1439", () => {
    expect(siteBreakpointsOf([range(1440, null), range(810, 1439.98), range(0, 809.98)])).toEqual({
      tablet: 1440,
      mobile: 810,
    });
  });

  it("takes the two smallest boundaries of a four-layout site", () => {
    // ≥1440, 1200–1439, 810–1199, <810: the in-between desktop layout stays desktop.
    expect(
      siteBreakpointsOf([range(1440, null), range(1200, 1439.98), range(810, 1199.98), range(0, 809.98)]),
    ).toEqual({ tablet: 1200, mobile: 810 });
  });

  it("does not care about the order or repeated hashes", () => {
    const once = [range(0, 809.98, "a"), range(810, 1199.98, "b"), range(1200, null, "c")];
    expect(siteBreakpointsOf([...once].reverse())).toEqual({ tablet: 1200, mobile: 810 });
    expect(siteBreakpointsOf([...once, ...once.map((entry) => ({ ...entry, id: `${entry.id}2` }))])).toEqual({
      tablet: 1200,
      mobile: 810,
    });
  });

  it("gives none when the source has fewer than two boundaries", () => {
    expect(siteBreakpointsOf([])).toBeNull();
    // A two-layout site: desktop from 810, mobile below.
    expect(siteBreakpointsOf([range(810, null), range(0, 809.98)])).toBeNull();
  });

  it("gives none for numbers Senify cannot carry", () => {
    // Fractional boundary.
    expect(siteBreakpointsOf([range(1200.5, null), range(810, 1200.48), range(0, 809.98)])).toBeNull();
    // Outside the allowed ranges: mobile below 320, tablet above 1600.
    expect(siteBreakpointsOf([range(1200, null), range(300, 1199.98), range(0, 299.98)])).toBeNull();
    expect(siteBreakpointsOf([range(1800, null), range(810, 1799.98), range(0, 809.98)])).toBeNull();
    // Two boundaries closer than the minimum gap.
    expect(siteBreakpointsOf([range(900, null), range(810, 899.98), range(0, 809.98)])).toBeNull();
  });
});

describe("breakpoints of the real Framer exports", () => {
  it.each([
    ["framer-easier-train-154753", { tablet: 1440, mobile: 810 }],
    ["framer-fluffy-rectangle-418998", { tablet: 1200, mobile: 810 }],
    ["framer-stupendous-football-158496", { tablet: 1200, mobile: 810 }],
  ])("%s breaks at %j", (fixture, expected) => {
    const document = captureFixture(join(FIXTURES, fixture));
    expect(siteBreakpointsOf(document.breakpoints)).toEqual(expected);
  });
});
