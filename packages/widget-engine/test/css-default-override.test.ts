import { describe, expect, it } from "vitest";
import { compileCss } from "../src/css/index.ts";

const MOBILE = "@media (max-width: 639.98px)";
const compile = (doc: Parameters<typeof compileCss>[0]): string => compileCss(doc, { layer: null });
const zeroPadding = { top: "0rem", right: "0rem", bottom: "0rem", left: "0rem", isLinked: true, unit: "rem" };
const padding = (value: string) => ({ top: value, right: value, bottom: value, left: value, isLinked: true, unit: "rem" });

// A value equal to the control default is only redundant when nothing below it
// set the property. Against a lower value it is an override and must be emitted.
describe("default values that override a lower layer", () => {
  it("keeps a mobile default after a tablet value (grid columns)", () => {
    const css = compile({
      nodes: [{ id: "g1", primitive: "grid", props: { columns: 4, columns_tablet: 2, columns_mobile: 3 } }],
    });
    expect(css).toContain(MOBILE);
    expect(css).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
  });

  it("keeps display: block on mobile over display: flex (stacking a row)", () => {
    const css = compile({
      nodes: [{ id: "f1", primitive: "frame", props: { display: "flex", display_mobile: "block" } }],
    });
    expect(css).toMatch(new RegExp(`${MOBILE.replace(/[()]/g, "\\$&")}[\\s\\S]*display: block`));
  });

  it("keeps padding 0 on mobile after a larger tablet padding", () => {
    const css = compile({
      nodes: [
        {
          id: "f2",
          primitive: "frame",
          props: { padding: padding("3rem"), padding_tablet: padding("1rem"), padding_mobile: zeroPadding },
        },
      ],
    });
    expect(css).toMatch(new RegExp(`${MOBILE.replace(/[()]/g, "\\$&")}[\\s\\S]*padding`));
  });

  it("keeps a class that resets display to the default over another class", () => {
    const css = compile({
      nodes: [{ id: "f3", primitive: "frame", classIds: ["box", "compact"] }],
      classRules: [
        { name: "box", props: { display: "flex" } },
        { name: "compact", props: { display: "block" } },
      ],
    });
    expect(css).toMatch(/\.compact \{\s*display: block;/);
  });

  it("keeps a hover state that sets the default over a non-default base", () => {
    const css = compile({
      nodes: [{ id: "f4", primitive: "frame", props: { display: "flex" }, states: { hover: { display: "block" } } }],
    });
    expect(css).toMatch(/:hover \{\s*display: block;/);
  });

  it("still omits a default when nothing is below it", () => {
    expect(compile({ nodes: [{ id: "f5", primitive: "frame", props: { display: "block" } }] })).not.toContain("display");
  });

  it("still omits a device value equal to the value below it", () => {
    const css = compile({
      nodes: [{ id: "f6", primitive: "frame", props: { display: "flex", display_tablet: "flex" } }],
    });
    expect(css).not.toContain("@media");
  });
});
