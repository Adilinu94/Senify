import { describe, expect, it } from "vitest";
import {
  BREAKPOINT_LIMITS,
  DEFAULT_BREAKPOINTS,
  checkBreakpoints,
  compileCss,
  forcedStateCss,
  isDefaultBreakpoints,
  mediaMaxWidth,
  mediaQueryFor,
  resolveBreakpoints,
  type CssDocument,
} from "../src/index.ts";

// ADR-0020: the two breakpoint numbers of a site. The platform default stays
// 1024 / 640; a site may carry its own pair, checked against guard rails.

const P8 = { top: "8", right: "8", bottom: "8", left: "8", isLinked: true, unit: "px" };
const P4 = { top: "4", right: "4", bottom: "4", left: "4", isLinked: true, unit: "px" };
const P2 = { top: "2", right: "2", bottom: "2", left: "2", isLinked: true, unit: "px" };

const doc: CssDocument = {
  nodes: [
    {
      id: "hero",
      primitive: "frame",
      props: { padding: P8, padding_tablet: P4, padding_mobile: P2 },
    },
  ],
};

describe("checkBreakpoints", () => {
  it("takes the platform default and the setups the Framer import needs", () => {
    for (const pair of [DEFAULT_BREAKPOINTS, { tablet: 1200, mobile: 810 }, { tablet: 1440, mobile: 810 }]) {
      expect(checkBreakpoints(pair)).toEqual({ ok: true, value: pair });
    }
  });

  it("takes the edges of both ranges", () => {
    const { tablet, mobile, minGap } = BREAKPOINT_LIMITS;
    expect(checkBreakpoints({ tablet: tablet.max, mobile: mobile.max }).ok).toBe(true);
    expect(checkBreakpoints({ tablet: tablet.min + minGap, mobile: mobile.min }).ok).toBe(true);
    expect(checkBreakpoints({ tablet: tablet.min, mobile: tablet.min - minGap }).ok).toBe(true);
  });

  it("refuses what is no pair of whole numbers", () => {
    for (const input of [null, undefined, "1024", 1024, [1024, 640], {}, { tablet: 1024 }, { mobile: 640 }]) {
      expect(checkBreakpoints(input).ok, JSON.stringify(input)).toBe(false);
    }
    for (const input of [
      { tablet: 1024.5, mobile: 640 },
      { tablet: 1024, mobile: 639.9 },
      { tablet: "1024", mobile: 640 },
      { tablet: Number.NaN, mobile: 640 },
      { tablet: Number.POSITIVE_INFINITY, mobile: 640 },
    ]) {
      const result = checkBreakpoints(input);
      expect(result.ok, JSON.stringify(input)).toBe(false);
      if (!result.ok) expect(result.message).toContain("whole numbers");
    }
  });

  it("refuses a value outside its range and names the range", () => {
    const low = checkBreakpoints({ tablet: BREAKPOINT_LIMITS.tablet.min - 1, mobile: 320 });
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.message).toContain("tablet breakpoint must lie between 641 and 1600");
    const high = checkBreakpoints({ tablet: BREAKPOINT_LIMITS.tablet.max + 1, mobile: 640 });
    expect(high.ok).toBe(false);
    const small = checkBreakpoints({ tablet: 1024, mobile: BREAKPOINT_LIMITS.mobile.min - 1 });
    expect(small.ok).toBe(false);
    if (!small.ok) expect(small.message).toContain("mobile breakpoint must lie between 320 and 900");
    expect(checkBreakpoints({ tablet: 1600, mobile: BREAKPOINT_LIMITS.mobile.max + 1 }).ok).toBe(false);
  });

  it("keeps the layouts apart by the minimum gap", () => {
    const { minGap } = BREAKPOINT_LIMITS;
    expect(checkBreakpoints({ tablet: 760, mobile: 760 - minGap }).ok).toBe(true);
    const tight = checkBreakpoints({ tablet: 760, mobile: 760 - minGap + 1 });
    expect(tight.ok).toBe(false);
    if (!tight.ok) expect(tight.message).toContain("at least 120 px larger");
    expect(checkBreakpoints({ tablet: 700, mobile: 800 }).ok).toBe(false);
  });
});

describe("resolveBreakpoints", () => {
  it("falls back to the default and passes a site pair through", () => {
    expect(resolveBreakpoints()).toBe(DEFAULT_BREAKPOINTS);
    expect(resolveBreakpoints(null)).toBe(DEFAULT_BREAKPOINTS);
    const own = { tablet: 1200, mobile: 810 };
    expect(resolveBreakpoints(own)).toBe(own);
  });

  it("knows the default pair", () => {
    expect(isDefaultBreakpoints({ tablet: 1024, mobile: 640 })).toBe(true);
    expect(isDefaultBreakpoints({ tablet: 1200, mobile: 640 })).toBe(false);
    expect(isDefaultBreakpoints({ tablet: 1024, mobile: 810 })).toBe(false);
  });
});

describe("compile with a site pair", () => {
  it("writes the default queries without an option and with the default pair", () => {
    const css = compileCss(doc);
    expect(css).toContain("@media (max-width: 1023.98px)");
    expect(css).toContain("@media (max-width: 639.98px)");
    expect(compileCss(doc, { breakpoints: DEFAULT_BREAKPOINTS })).toBe(css);
  });

  it("writes the site's queries and none of the default ones", () => {
    const css = compileCss(doc, { breakpoints: { tablet: 1200, mobile: 810 } });
    expect(css).toContain("@media (max-width: 1199.98px)");
    expect(css).toContain("@media (max-width: 809.98px)");
    expect(css).not.toContain("1023.98");
    expect(css).not.toContain("639.98");
  });

  it("keeps the tablet override ahead of the mobile one in the cascade order", () => {
    const css = compileCss(doc, { breakpoints: { tablet: 1440, mobile: 810 } });
    const tablet = css.indexOf("@media (max-width: 1439.98px)");
    const mobile = css.indexOf("@media (max-width: 809.98px)");
    expect(tablet).toBeGreaterThan(-1);
    expect(mobile).toBeGreaterThan(tablet);
  });

  it("changes nothing but the numbers", () => {
    const own = compileCss(doc, { breakpoints: { tablet: 1200, mobile: 810 } });
    const back = own.replace("1199.98", "1023.98").replace("809.98", "639.98");
    expect(back).toBe(compileCss(doc));
  });

  it("reads the pair in the media helpers", () => {
    const own = { tablet: 1200, mobile: 810 };
    expect(mediaMaxWidth("tablet", own)).toBe(1199.98);
    expect(mediaMaxWidth("mobile", own)).toBe(809.98);
    expect(mediaQueryFor("tablet", own)).toBe("@media (max-width: 1199.98px)");
    expect(mediaQueryFor("mobile", own)).toBe("@media (max-width: 809.98px)");
  });

  it("carries the pair into the forced state preview", () => {
    const stateDoc: CssDocument = {
      nodes: [
        {
          id: "card",
          primitive: "button",
          props: { color: "#ff0000" },
          states: { hover: { background: "#00ff00", background_tablet: "#0000ff" } },
        },
      ],
    };
    const preview = forcedStateCss(stateDoc, "hover", { breakpoints: { tablet: 1200, mobile: 810 } });
    expect(preview).toContain("@media (max-width: 1199.98px)");
    expect(preview).not.toContain("1023.98");
  });
});
