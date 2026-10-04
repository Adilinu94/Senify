import { describe, expect, it } from "vitest";
import { parseCssValue } from "../src/css/value-grammar.ts";

describe("custom properties inside function arguments", () => {
  it("keeps `--name` as one identifier in var() with and without fallback", () => {
    expect(parseCssValue("var(--brand)")).toEqual({ ok: true, value: "var(--brand)" });
    expect(parseCssValue("var(--token-1f29b48f-b9fc, #254139)")).toEqual({
      ok: true,
      value: "var(--token-1f29b48f-b9fc, #254139)",
    });
  });

  it("keeps nested var() fallbacks and shorthand fallbacks intact", () => {
    expect(parseCssValue("var(--a, var(--b, 8px 4px))")).toEqual({
      ok: true,
      value: "var(--a, var(--b, 8px 4px))",
    });
  });

  it("still reads a spaced minus as the arithmetic operator", () => {
    expect(parseCssValue("calc(100% - 20px)")).toEqual({ ok: true, value: "calc(100% - 20px)" });
    expect(parseCssValue("calc(var(--w) - 2px)")).toEqual({ ok: true, value: "calc(var(--w) - 2px)" });
  });

  it("accepts vendor-prefixed identifiers as arguments", () => {
    expect(parseCssValue("var(--x, -webkit-fill-available)")).toEqual({
      ok: true,
      value: "var(--x, -webkit-fill-available)",
    });
  });
});
