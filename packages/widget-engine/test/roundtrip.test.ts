import { describe, expect, it } from "vitest";
import { defaultTheme } from "@senify/tokens";
import {
  compileCssReport,
  measureCss,
  themeTokenResolver,
  type CssDocument,
} from "../src/index.ts";

// Roundtrip proof (point 8): a small tree with device values, states, classes
// and colour references is compiled once, the result is printed, and the core
// properties are checked — same input yields same output, no catalog default in
// the result, the size is measured.

const P8 = { top: "8", right: "8", bottom: "8", left: "8", isLinked: true, unit: "px" };
const GAP = { row: "16", column: "16", isLinked: true, unit: "px" };

const tree: CssDocument = {
  nodes: [
    {
      id: "root1",
      primitive: "root",
      props: { background: { $token: "color.neutral-50" } },
    },
    {
      id: "sec01",
      primitive: "section",
      // `contentWidth: "regular"` is the catalog default and must not show up.
      props: { contentWidth: "regular", align: "center" },
      children: [
        {
          id: "grid1",
          primitive: "grid",
          props: { columns: 4, columns_tablet: 2, gap: GAP },
          children: [
            {
              id: "head1",
              primitive: "heading",
              props: { fontSize: 32, color: { $token: "color.brand" } },
              states: { hover: { color: { $token: "color.danger" } } },
            },
            {
              id: "btn01",
              primitive: "button",
              props: { padding: P8 },
              classIds: ["cta"],
            },
          ],
        },
      ],
    },
  ],
  classRules: [
    {
      name: "cta",
      props: {
        background: { $token: "color.brand" },
        background_mobile: { $token: "color.warning" },
      },
    },
  ],
};

const options = { resolveToken: themeTokenResolver(defaultTheme()) };

describe("roundtrip", () => {
  it("compiles the tree and reports the measured size", () => {
    const report = compileCssReport(tree, options);
    // The result is printed once so the run leaves the actual CSS behind.
    console.info(
      `[widget-engine] roundtrip: ${report.nodeCount} nodes, ${report.ruleCount} rules, ${report.bytes} bytes\n${report.css}`,
    );

    expect(report.nodeCount).toBe(5);
    expect(report.ruleCount).toBeGreaterThan(0);
    expect(report.bytes).toBe(measureCss(report.css));
    expect(report.bytes).toBeGreaterThan(0);
    expect(report.characters).toBe(report.css.length);
  });

  it("returns the same output for the same input", () => {
    const first = compileCssReport(tree, options);
    const second = compileCssReport(tree, options);
    expect(second.css).toBe(first.css);
    expect(second.bytes).toBe(first.bytes);
    expect(second.rules).toEqual(first.rules);
  });

  it("keeps catalog defaults out of the result", () => {
    const { css } = compileCssReport(tree, options);
    // `contentWidth: "regular"` maps to `max-width: 1120px`; it is the default
    // and so must not be written.
    expect(css).not.toContain("1120px");
    // `align: "center"` is not the default and shows up.
    expect(css).toContain("margin-inline: auto;");
  });

  it("resolves every colour reference and loses none", () => {
    const { css } = compileCssReport(tree, options);
    // Nothing is left as a variable: every token resolved against the theme.
    expect(css).not.toContain("var(--");
    expect(css).toContain(`[data-node-id="root1"] {`);
    // Text keeps its colour …
    expect(css).toContain("color: #024364;"); // head1 base (color.brand)
    expect(css).toContain("color: #dc2626;"); // head1 hover (color.danger)
    // … and backgrounds keep theirs.
    expect(css).toContain("background-color: #024364;"); // cta (color.brand)
    expect(css).toContain("background-color: #b45309;"); // cta mobile (color.warning)
  });

  it("carries device, state and class through the whole tree", () => {
    const { css } = compileCssReport(tree, options);
    expect(css).toContain("@media (max-width: 1023.98px)");
    expect(css).toContain("@media (max-width: 639.98px)");
    expect(css).toContain(`[data-node-id="head1"]:hover {`);
    expect(css).toContain(`[data-node-id="btn01"].cta {`);
  });
});
