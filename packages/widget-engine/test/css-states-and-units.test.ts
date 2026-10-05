import { describe, expect, it } from "vitest";
import {
  HOVER_GUARD,
  STATE_ORDER,
  STYLE_PROPERTIES,
  compileCss,
  compileCssReport,
  declarationsForValues,
  stateSelector,
  stylePropertyFor,
  type CssDocument,
  type DroppedValue,
} from "../src/index.ts";

const compile = (document: CssDocument): string => compileCss(document, { layer: null });

describe("hover guard", () => {
  it("wraps a hover rule in @media (hover: hover) so a tap does not stick", () => {
    const css = compile({
      nodes: [
        {
          id: "btn",
          primitive: "button",
          props: { color: "#010101" },
          states: { hover: { color: "#020202" } },
        },
      ],
    });
    expect(HOVER_GUARD).toBe("@media (hover: hover)");
    expect(css).toContain(
      `@media (hover: hover) {\n  [data-node-id="btn"]:hover {\n    color: #020202;\n  }\n}`,
    );
    // The base rule stays outside the guard.
    expect(css.indexOf(`[data-node-id="btn"] {`)).toBeLessThan(css.indexOf("@media (hover: hover)"));
  });

  it("leaves focus, active and disabled outside the guard", () => {
    const css = compile({
      nodes: [
        {
          id: "btn",
          primitive: "button",
          states: {
            focus: { color: "#010101" },
            active: { color: "#020202" },
            disabled: { color: "#030303" },
          },
        },
      ],
    });
    expect(css).not.toContain("hover: hover");
    expect(css).toContain(`[data-node-id="btn"]:focus {\n  color: #010101;`);
    expect(css).toContain(`[data-node-id="btn"]:active {\n  color: #020202;`);
    expect(css).toContain(`[data-node-id="btn"]:disabled {\n  color: #030303;`);
  });

  it("shares one guard between neighbouring hover rules and keeps the order", () => {
    const css = compile({
      nodes: [
        { id: "a", primitive: "button", states: { hover: { color: "#010101" } } },
        { id: "b", primitive: "button", states: { hover: { color: "#020202" } } },
      ],
    });
    expect(css.match(/@media \(hover: hover\)/g)).toHaveLength(1);
    expect(css.indexOf(`[data-node-id="a"]:hover`)).toBeLessThan(css.indexOf(`[data-node-id="b"]:hover`));
  });

  it("does not move a hover rule across a rule that sits between", () => {
    // Class rules keep the document order. A guarded hover rule between two
    // plain rules must stay between them.
    const css = compile({
      nodes: [
        { id: "n", primitive: "button", classIds: ["first", "second"] },
      ],
      classRules: [
        { name: "first", props: { color: "#010101" } },
        { name: "second", props: { color: "#020202" }, states: { hover: { color: "#030303" } } },
      ],
    });
    const first = css.indexOf(".first {");
    const second = css.indexOf(".second {");
    const hover = css.indexOf(".second:hover {");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(hover).toBeGreaterThan(second);
  });

  it("keeps a device override of a hover rule inside the hover guard, in the device query", () => {
    const css = compile({
      nodes: [
        {
          id: "btn",
          primitive: "button",
          states: { hover: { color: "#010101", color_tablet: "#020202" } },
        },
      ],
    });
    expect(css).toContain(
      `@media (max-width: 1023.98px) {\n  @media (hover: hover) {\n    [data-node-id="btn"]:hover {\n      color: #020202;`,
    );
  });

  it("nests the hover guard inside a custom condition", () => {
    const css = compile({
      nodes: [{ id: "n", primitive: "button", classIds: ["card"] }],
      classRules: [
        {
          name: "card",
          props: {},
          states: { hover: { color: "#010101" } },
          contextStyles: { "(prefers-color-scheme: dark)": { color: "#020202" } },
        },
      ],
    });
    // The dark-mode override of the hover rule: condition outside, guard inside.
    expect(css).toContain(
      `@media (prefers-color-scheme: dark) {\n  @media (hover: hover) {\n    .card:hover {\n      color: #020202;`,
    );
  });

  it("marks hover rules as data so a consumer need not parse the stylesheet", () => {
    const report = compileCssReport(
      {
        nodes: [{ id: "btn", primitive: "button", states: { hover: { color: "#010101" } } }],
      },
      { layer: null },
    );
    const rule = report.rules.find((entry) => entry.state === "hover");
    expect(rule?.stage).toBe("state");
    expect(rule?.selector).toBe(stateSelector("btn", "hover"));
  });
});

describe("focus-visible and focus-within", () => {
  it("emits both after :focus and before :active", () => {
    expect(STATE_ORDER.indexOf("focus-visible")).toBe(STATE_ORDER.indexOf("focus") + 1);
    expect(STATE_ORDER.indexOf("focus-within")).toBeLessThan(STATE_ORDER.indexOf("active"));
  });

  it("writes the pseudo classes", () => {
    const css = compile({
      nodes: [
        {
          id: "field",
          primitive: "frame",
          states: {
            "focus-within": { borderColor: "#010101" },
            "focus-visible": { outline: "2px solid #020202" },
            focus: { outline: "none" },
          },
        },
      ],
    });
    expect(css).toContain(`[data-node-id="field"]:focus-visible {\n  outline: 2px solid #020202;`);
    expect(css).toContain(`[data-node-id="field"]:focus-within {\n  border-color: #010101;`);
    // `:focus-visible` follows `:focus`, so the ring wins for keyboard users.
    expect(css.indexOf(":focus-visible")).toBeGreaterThan(css.indexOf(":focus {"));
    // Not guarded: a keyboard exists on every device.
    expect(css).not.toContain("hover: hover");
  });
});

describe("open-space numbers", () => {
  const decl = (values: Record<string, string | number>) =>
    Object.fromEntries(
      declarationsForValues("frame", values).map((entry) => [entry.property, entry.value]),
    );

  it("gives a bare number the unit px where the property is a length", () => {
    expect(
      decl({
        paddingTop: 12,
        marginTop: -8,
        rowGap: 16,
        columnGap: 4,
        borderTopWidth: 2,
        outlineOffsetX: 1,
        scrollMarginBottom: 80,
        textUnderlineOffset: 3,
      }),
    ).toEqual({
      "padding-top": "12px",
      "margin-top": "-8px",
      "row-gap": "16px",
      "column-gap": "4px",
      "border-top-width": "2px",
      "outline-offset-x": "1px",
      "scroll-margin-bottom": "80px",
      "text-underline-offset": "3px",
    });
  });

  it("keeps the number bare where the property takes no unit", () => {
    expect(
      decl({
        zoom: 1.2,
        tabSize: 4,
        fillOpacity: 0.5,
        gridRowStart: 2,
        animationIterationCount: 3,
        "--ratio": 1.5,
      }),
    ).toEqual({
      zoom: "1.2",
      "tab-size": "4",
      "fill-opacity": "0.5",
      "grid-row-start": "2",
      "animation-iteration-count": "3",
      "--ratio": "1.5",
    });
  });

  it("writes zero without a unit", () => {
    expect(decl({ paddingTop: 0, rowGap: "0" })).toEqual({ "padding-top": "0", "row-gap": "0" });
  });

  it("treats a string that is only a number like the number", () => {
    expect(decl({ paddingTop: "12", rowGap: "1.5", zoom: "2" })).toEqual({
      "padding-top": "12px",
      "row-gap": "1.5px",
      zoom: "2",
    });
  });

  it("does not touch a value that brings its own unit or is a function", () => {
    expect(
      decl({ paddingTop: "1rem", rowGap: "calc(1rem + 2px)", scrollMarginTop: "var(--header)" }),
    ).toEqual({
      "padding-top": "1rem",
      "row-gap": "calc(1rem + 2px)",
      "scroll-margin-top": "var(--header)",
    });
  });
});

describe("style table additions", () => {
  it("knows the properties an agent could not write before", () => {
    for (const name of [
      "display",
      "visibility",
      "alignSelf",
      "justifySelf",
      "justifyItems",
      "gridAutoRows",
      "gridAutoColumns",
      "scrollMarginTop",
      "objectFit",
      "objectPosition",
      "whiteSpace",
      "textOverflow",
      "textWrap",
      "wordBreak",
      "textIndent",
      "textShadow",
      "outline",
      "outlineOffset",
      "cursor",
      "pointerEvents",
    ]) {
      expect(stylePropertyFor(name), name).toBeDefined();
      // Both spellings reach the same entry.
      const css = stylePropertyFor(name)?.css;
      if (css !== undefined) expect(stylePropertyFor(css)?.prop).toBe(name);
    }
  });

  it("emits them with their CSS names", () => {
    const out = Object.fromEntries(
      declarationsForValues("text", {
        display: "none",
        alignSelf: "center",
        objectFit: "cover",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        textWrap: "balance",
        textShadow: "0 1px 2px #000000",
        cursor: "pointer",
        outlineOffset: 4,
        scrollMarginTop: 80,
      }).map((entry) => [entry.property, entry.value]),
    );
    expect(out).toEqual({
      display: "none",
      "align-self": "center",
      "object-fit": "cover",
      "white-space": "nowrap",
      "text-overflow": "ellipsis",
      "text-wrap": "balance",
      "text-shadow": "0 1px 2px #000000",
      cursor: "pointer",
      "outline-offset": "4px",
      "scroll-margin-top": "80px",
    });
  });

  it("keeps a table property of a primitive's own control ahead of the generic one", () => {
    // `frame.display` owns `display`; the generic table entry must not write it twice.
    const declarations = declarationsForValues("frame", { display: "grid" });
    expect(declarations.filter((entry) => entry.property === "display")).toHaveLength(1);
  });

  it("keeps a unique emission position per property", () => {
    const names = STYLE_PROPERTIES.map((spec) => spec.prop);
    expect(new Set(names).size).toBe(names.length);
    const css = STYLE_PROPERTIES.map((spec) => spec.css ?? spec.prop);
    expect(new Set(css).size).toBe(css.length);
  });
});

describe("diagnostics", () => {
  it("reports a value that is not valid CSS instead of dropping it silently", () => {
    const report = compileCssReport(
      {
        nodes: [
          {
            id: "n",
            primitive: "frame",
            props: {
              color: "#010101",
              fontSize: "wide",
              "--x": "ok",
              "bad;name": "1",
              filter: "url(javascript:alert(1))",
              background: { nested: true },
            },
          },
        ],
      },
      { layer: null },
    );
    const byProperty = Object.fromEntries(report.diagnostics.map((entry) => [entry.property, entry]));
    expect(byProperty["background"]?.reason).toBe("invalid-value");
    expect(byProperty["filter"]?.reason).toBe("invalid-value");
    expect(byProperty["bad;name"]?.reason).toBe("unsafe-property");
    expect(byProperty["fontSize"]).toBeUndefined();
    expect(report.diagnostics.every((entry) => entry.selector === `[data-node-id="n"]`)).toBe(true);
    // The stylesheet itself stays clean.
    expect(report.css).not.toContain("javascript");
    expect(report.css).not.toContain("bad;name");
  });

  it("reports a free property that holds an object as unsupported", () => {
    const report = compileCssReport(
      { nodes: [{ id: "n", primitive: "frame", props: { scrollSnapType: { a: 1 } as never } }] },
      { layer: null },
    );
    expect(report.diagnostics).toEqual([
      {
        selector: `[data-node-id="n"]`,
        property: "scrollSnapType",
        reason: "unsupported-shape",
        value: { a: 1 },
      },
    ]);
  });

  it("reports a keyword the property does not know", () => {
    const report = compileCssReport(
      { nodes: [{ id: "n", primitive: "image", props: { fit: "stretch" } }] },
      { layer: null },
    );
    expect(report.diagnostics.map((entry) => [entry.property, entry.reason])).toEqual([
      ["fit", "invalid-value"],
    ]);
  });

  it("points at the rule of a state or a class, not only the node", () => {
    const report = compileCssReport(
      {
        nodes: [
          { id: "n", primitive: "frame", classIds: ["pill"], states: { hover: { filter: "url(javascript:1)" } } },
        ],
        classRules: [{ name: "pill", props: { backdropFilter: "url(javascript:1)" } }],
      },
      { layer: null },
    );
    // Every drop names the rule it would have been part of: the node state, the
    // global class rule and the anchored class-over-state combination.
    const selectors = [...new Set(report.diagnostics.map((entry) => entry.selector))].sort();
    expect(selectors).toEqual([".pill", `[data-node-id="n"].pill:hover`, `[data-node-id="n"]:hover`]);
  });

  it("reports a bad value once, however many devices repeat it", () => {
    const report = compileCssReport(
      {
        nodes: [
          {
            id: "n",
            primitive: "frame",
            props: { filter: "url(javascript:1)", filter_tablet: "url(javascript:1)", filter_mobile: "url(javascript:1)" },
          },
        ],
      },
      { layer: null },
    );
    expect(report.diagnostics.filter((entry) => entry.property === "filter")).toHaveLength(1);
  });

  it("stays empty for a valid document and does not report intentional omissions", () => {
    const report = compileCssReport(
      {
        nodes: [
          {
            id: "n",
            primitive: "list",
            props: { ordered: false, marker: "disc", color: "#010101", unknownBehaviourKey: "x" },
          },
        ],
      },
      { layer: null },
    );
    expect(report.diagnostics).toEqual([]);
  });

  it("passes drops to a caller-supplied callback too", () => {
    const seen: DroppedValue[] = [];
    declarationsForValues(
      "frame",
      { filter: "url(javascript:1)" },
      { onDrop: (drop) => seen.push(drop) },
    );
    expect(seen).toEqual([{ property: "filter", reason: "invalid-value", value: "url(javascript:1)" }]);
  });
});
