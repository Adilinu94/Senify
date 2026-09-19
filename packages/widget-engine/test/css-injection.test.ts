// The compiler as the last line of defence (ADR-0005, ticket 07 stage 0).
//
// The write path rejects an unsafe declaration loudly; the compiler drops it.
// Both matter: a document can arrive from an older revision, a hand-edited
// draft or a migration, and the published stylesheet must never carry it. The
// text-kind properties (`boxShadow`, `transform`, `filter`, `fontFamily`, …)
// used to pass their raw string through — this suite pins the fix.

import { describe, expect, it } from "vitest";
import { compileCss, type CssDocument } from "../src/index.ts";

function compile(document: CssDocument): string {
  return compileCss(document, { layer: null });
}

describe("the compiler never emits an unsafe value", () => {
  const attacks: [string, string][] = [
    ["boxShadow", "red; } body { background: black"],
    ["transform", "rotate(3deg) url(javascript:alert(1))"],
    ["filter", "blur(2px) url(jav\\61 script:alert(1))"],
    ["backgroundImage", "url(javascript:alert(1))"],
    ["transition", "@import url(x)"],
    ["boxShadow", "0 0 0 1px red !important"],
  ];

  it.each(attacks)("drops %s: %s", (property, value) => {
    const css = compile({
      nodes: [{ id: "n1", primitive: "frame", props: { [property]: value } }],
    });
    expect(css).not.toContain("body {");
    expect(css).not.toContain("javascript");
    expect(css).not.toContain("@import");
    expect(css).not.toContain("!important");
    expect(css).toBe("");
  });

  it("drops an unsafe value in a style rule as well", () => {
    const css = compile({
      nodes: [{ id: "n1", primitive: "button", classIds: ["cta"] }],
      classRules: [{ name: "cta", props: { boxShadow: "red; } body {", color: "#0000ff" } }],
    });
    expect(css).not.toContain("body {");
    expect(css).not.toContain("red;");
    // The rule is still emitted — globally (ticket 14) — with its safe
    // declaration; only the unsafe one is gone.
    expect(css).toContain(`.cta`);
    expect(css).toContain("color: #0000ff;");
  });

  it("keeps ordinary text values and emits them normalized", () => {
    const css = compile({
      nodes: [
        {
          id: "n1",
          primitive: "frame",
          props: {
            boxShadow: "0 2px 4px rgba(0, 0, 0, .3)",
            transform: "TRANSLATEX( 10px )",
          },
        },
      ],
    });
    expect(css).toContain("box-shadow: 0 2px 4px rgba(0, 0, 0, .3);");
    expect(css).toContain("transform: translatex(10px);");
  });

  it("keeps a font stack with quoted names", () => {
    const css = compile({
      nodes: [
        {
          id: "n1",
          primitive: "text",
          props: { fontFamily: "\"Helvetica Neue\", Arial, sans-serif" },
        },
      ],
    });
    expect(css).toContain('font-family: "Helvetica Neue", Arial, sans-serif;');
  });
});
