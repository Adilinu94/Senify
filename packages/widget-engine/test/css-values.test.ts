import { describe, expect, it } from "vitest";
import {
  camelToKebab,
  collapseSides,
  compileCss,
  deepEqualProp,
  formatColor,
  formatGaps,
  formatKeyword,
  formatLength,
  formatSpacing,
  formatUnitless,
  hasOwnUnit,
  withUnit,
} from "../src/index.ts";

describe("lengths and units", () => {
  it("appends the unit of the control to a bare number", () => {
    expect(formatLength(16, "px")).toBe("16px");
    expect(formatLength(50, "%")).toBe("50%");
    expect(formatLength(1.5, "rem")).toBe("1.5rem");
    expect(formatLength(0, "px")).toBe("0");
  });

  it("keeps a string that brings its own unit", () => {
    expect(formatLength("24px", "rem")).toBe("24px");
    expect(formatLength("calc(50% - 4px)", "px")).toBe("calc(50% - 4px)");
    expect(withUnit("16", "rem")).toBe("16rem");
    expect(hasOwnUnit("16rem")).toBe(true);
    expect(hasOwnUnit("16")).toBe(false);
  });

  it("needs no unit for values that are numbers", () => {
    expect(formatUnitless(1.5)).toBe("1.5");
    expect(formatUnitless(700)).toBe("700");
    expect(formatUnitless("bold")).toBe("bold");
    expect(formatUnitless(0.5000000000000001)).toBe("0.5");
    expect(formatUnitless(true)).toBeUndefined();
  });
});

describe("colors", () => {
  it("normalizes hex literals", () => {
    expect(formatColor("#FFF")).toBe("#ffffff");
    expect(formatColor("#AbCdEf")).toBe("#abcdef");
  });

  it("resolves a token reference", () => {
    expect(formatColor({ $token: "brand.primary" })).toBe("var(--brand-primary)");
  });

  it("applies opacity", () => {
    expect(formatColor({ color: "#ff0000", alpha: 0.5 })).toBe("rgba(255, 0, 0, 0.5)");
    expect(formatColor({ color: "#ff0000", alpha: 1 })).toBe("#ff0000");
  });

  it("passes functional colors through", () => {
    expect(formatColor("currentColor")).toBe("currentColor");
    expect(formatColor("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(formatColor("")).toBeUndefined();
  });
});

describe("four-fold and pair values", () => {
  it("collapses equal sides into the shortest shorthand", () => {
    expect(collapseSides(["8px", "8px", "8px", "8px"])).toBe("8px");
    expect(collapseSides(["8px", "16px", "8px", "16px"])).toBe("8px 16px");
    expect(collapseSides(["8px", "16px", "4px", "16px"])).toBe("8px 16px 4px");
    expect(collapseSides(["8px", "16px", "4px", "2px"])).toBe("8px 16px 4px 2px");
  });

  it("formats a dimensions value with its unit", () => {
    expect(
      formatSpacing({ top: "1", right: "2", bottom: "1", left: "2", isLinked: false, unit: "rem" }),
    ).toBe("1rem 2rem");
    expect(
      formatSpacing({ top: "0", right: "0", bottom: "0", left: "0", isLinked: true, unit: "px" }),
    ).toBe("0");
    expect(formatSpacing("16px")).toBeUndefined();
  });

  it("formats a gaps value", () => {
    expect(formatGaps({ row: "8", column: "8", isLinked: true, unit: "px" })).toBe("8px");
    expect(formatGaps({ row: "8", column: "24", isLinked: false, unit: "px" })).toBe("8px 24px");
  });
});

describe("keywords and names", () => {
  it("translates an enum through a value map", () => {
    expect(formatKeyword("center", { left: "0", center: "auto" })).toBe("auto");
    expect(formatKeyword("nope", { left: "0", center: "auto" })).toBeUndefined();
    expect(formatKeyword("flex")).toBe("flex");
    expect(formatKeyword(true)).toBeUndefined();
  });

  it("builds the CSS property name from the camelCase prop", () => {
    expect(camelToKebab("borderTopWidth")).toBe("border-top-width");
    expect(camelToKebab("color")).toBe("color");
  });
});

describe("default detection", () => {
  it("compares nested values by structure", () => {
    expect(deepEqualProp({ a: 1, b: "x" }, { b: "x", a: 1 })).toBe(true);
    expect(deepEqualProp({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqualProp([1, 2], [1, 2])).toBe(true);
    expect(deepEqualProp("#fff", "#FFF")).toBe(false);
  });
});

describe("compiled output", () => {
  it("writes a four-fold and a pair value into the rule", () => {
    const css = compileCss(
      {
        nodes: [
          {
            id: "box",
            primitive: "frame",
            props: {
              padding: { top: "8", right: "16", bottom: "8", left: "16", isLinked: false, unit: "px" },
              gap: { row: "24", column: "24", isLinked: true, unit: "px" },
            },
          },
        ],
      },
      { layer: null },
    );
    expect(css).toBe(`[data-node-id="box"] {\n  padding: 8px 16px;\n  gap: 24px;\n}`);
  });
});
