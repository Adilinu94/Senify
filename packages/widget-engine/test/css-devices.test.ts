import { describe, expect, it } from "vitest";
import { BREAKPOINTS } from "@senify/renderer";
import {
  DEVICE_BREAKPOINTS,
  MEDIA_QUERY_OFFSET,
  compileCss,
  mediaMaxWidth,
  mediaQueryFor,
  resetDeviceValue,
  type DeviceValueMap,
} from "../src/index.ts";

const P8 = { top: "8", right: "8", bottom: "8", left: "8", isLinked: true, unit: "px" };
const P4 = { top: "4", right: "4", bottom: "4", left: "4", isLinked: true, unit: "px" };
const P2 = { top: "2", right: "2", bottom: "2", left: "2", isLinked: true, unit: "px" };

function hero(props: DeviceValueMap): string {
  return compileCss({ nodes: [{ id: "hero", primitive: "frame", props }] });
}

const THREE_DEVICES = `@layer user-authored {
  [data-node-id="hero"] {
    padding: 8px;
  }

  @media (max-width: 1023.98px) {
    [data-node-id="hero"] {
      padding: 4px;
    }
  }

  @media (max-width: 639.98px) {
    [data-node-id="hero"] {
      padding: 2px;
    }
  }
}`;

describe("device media queries", () => {
  it("imports the breakpoints from the one existing source", () => {
    // One source: the compiler imports `BREAKPOINTS` from the renderer (the
    // same constant the bake and the editor frames read) instead of keeping its
    // own copy of the numbers. No test locks a text of another file.
    expect(DEVICE_BREAKPOINTS).toEqual({
      tablet: BREAKPOINTS.tablet,
      mobile: BREAKPOINTS.mobile,
    });
    expect(MEDIA_QUERY_OFFSET).toBe(0.02);
    expect(mediaMaxWidth("tablet")).toBe(BREAKPOINTS.tablet - 0.02);
    expect(mediaMaxWidth("mobile")).toBe(BREAKPOINTS.mobile - 0.02);
    expect(mediaQueryFor("tablet")).toBe(`@media (max-width: ${BREAKPOINTS.tablet - 0.02}px)`);
    expect(mediaQueryFor("mobile")).toBe(`@media (max-width: ${BREAKPOINTS.mobile - 0.02}px)`);
  });

  it("emits an empty stylesheet for a node without values", () => {
    expect(hero({})).toBe("");
  });
});

describe("device inheritance", () => {
  it("writes the base value and one override per narrower device", () => {
    expect(hero({ padding: P8, padding_tablet: P4, padding_mobile: P2 })).toBe(THREE_DEVICES);
  });

  it("lets mobile inherit the tablet value when it has no own value", () => {
    const css = hero({ padding: P8, padding_tablet: P4 });
    expect(css).toContain("@media (max-width: 1023.98px)");
    expect(css).not.toContain("@media (max-width: 639.98px)");
  });

  it("orders tablet before mobile so the narrower device wins", () => {
    const css = hero({ padding: P8, padding_tablet: P4, padding_mobile: P2 });
    expect(css.indexOf("1023.98px")).toBeLessThan(css.indexOf("639.98px"));
  });

  it("does not repeat an override that equals the inherited value", () => {
    const css = hero({ padding: P8, padding_tablet: P8 });
    expect(css).toBe(`@layer user-authored {
  [data-node-id="hero"] {
    padding: 8px;
  }
}`);
  });
});

describe("reset per device", () => {
  const values = { padding: P8, padding_tablet: P4, padding_mobile: P2 };

  it("drops the override so the value inherits again", () => {
    const reset = resetDeviceValue(values, "padding", "mobile");
    const css = hero(reset);
    expect(css).not.toContain("@media (max-width: 639.98px)");
    expect(css).toContain("@media (max-width: 1023.98px)");
    expect(css).toBe(hero({ padding: P8, padding_tablet: P4 }));
  });

  it("keeps the stronger override when a weaker device is reset", () => {
    const reset = resetDeviceValue(values, "padding", "tablet");
    const css = hero(reset);
    // Tablet falls back to the base, mobile keeps its own value.
    expect(css).toContain("@media (max-width: 639.98px)");
    expect(css).toBe(
      `@layer user-authored {
  [data-node-id="hero"] {
    padding: 8px;
  }

  @media (max-width: 639.98px) {
    [data-node-id="hero"] {
      padding: 2px;
    }
  }
}`,
    );
  });
});
