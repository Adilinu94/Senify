// The two class emissions of ticket 14, measured against each other: the
// measured winner (and default) emits one `.cls` per class and dedupes it over
// all carriers, the regional path anchors every class rule on its carrier
// (`[data-node-id].cls`, kept as the documented retreat). The tests pin that
// both describe the same declarations per carrier, that the global rule still
// comes after the base stage (source order carries the class stage), and that
// a node-specific state combination stays anchored — an unanchored `.cls`
// loses against `[data-node-id]:hover` on specificity alone (O1).

import { describe, expect, it } from "vitest";
import { compileCss, compileCssReport, type CssDocument } from "../src/index.ts";

const RULE = {
  name: "cta",
  props: { background: "#ff0000", color: "#ffffff", borderRadius: "8px" },
};

function document(): CssDocument {
  return {
    nodes: [
      { id: "a", primitive: "button", props: { color: "#111111" }, classIds: ["cta"] },
      { id: "b", primitive: "button", classIds: ["cta"] },
      { id: "c", primitive: "button", classIds: ["cta"] },
    ],
    classRules: [RULE],
  };
}

describe("class emission (ticket 14)", () => {
  it("anchors every class rule on its carrier in regional mode", () => {
    const report = compileCssReport(document(), { classEmission: "regional" });
    const classRules = report.rules.filter((rule) => rule.classIds.includes("cta"));
    expect(classRules.map((rule) => rule.selector)).toEqual([
      `[data-node-id="a"].cta`,
      `[data-node-id="b"].cta`,
      `[data-node-id="c"].cta`,
    ]);
  });

  it("emits one global rule per class by default", () => {
    const report = compileCssReport(document());
    const classRules = report.rules.filter((rule) => rule.classIds.includes("cta"));
    expect(classRules).toHaveLength(1);
    expect(classRules[0]?.selector).toBe(".cta");
  });

  it("describes the same declarations per carrier under both emissions", () => {
    const regional = compileCssReport(document(), { classEmission: "regional" });
    const global = compileCssReport(document());
    const anchored = regional.rules.filter((rule) => rule.classIds.includes("cta"));
    const unanchored = global.rules.filter((rule) => rule.classIds.includes("cta"));
    expect(anchored[0]?.declarations).toEqual(unanchored[0]?.declarations);
    expect(anchored[1]?.declarations).toEqual(anchored[0]?.declarations);
    expect(anchored[2]?.declarations).toEqual(anchored[0]?.declarations);
  });

  it("keeps the class stage after the base stage in global mode", () => {
    const css = compileCss(document(), { layer: null });
    const base = css.indexOf(`[data-node-id="a"] {`);
    const global = css.indexOf(".cta {");
    expect(base).toBeGreaterThan(-1);
    expect(global).toBeGreaterThan(base);
  });

  it("keeps a node state combination anchored in global mode", () => {
    const css = compileCss(
      {
        nodes: [
          {
            id: "a",
            primitive: "button",
            classIds: ["cta"],
            states: { hover: { color: "#00ff00" } },
          },
        ],
        classRules: [{ name: "cta", props: { color: "#ff0000" } }],
      },
      { layer: null },
    );
    expect(css).toContain(".cta {");
    expect(css).toContain(`[data-node-id="a"].cta:hover {`);
    expect(css).toContain("color: #ff0000;");
    expect(css).not.toContain(`[data-node-id="a"].cta {`);
  });

  it("emits rule states globally in global mode", () => {
    const css = compileCss(
      {
        nodes: [{ id: "a", primitive: "button", classIds: ["cta"] }],
        classRules: [
          { name: "cta", props: { color: "#ff0000" }, states: { hover: { color: "#00ff00" } } },
        ],
      },
      { layer: null },
    );
    expect(css).toContain(".cta:hover {");
    expect(css).toContain("color: #00ff00;");
    expect(css).not.toContain(`[data-node-id="a"].cta:hover {`);
  });
});
