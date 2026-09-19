// The rule kinds and stages of the canonical style model (ADR-0005, ticket 07).
//
// The editor document stores rules the way the site registry persists them:
// `class` (global `.cls`, ticket 14), `ambient` (verbatim selector), `scoped`
// (anchored on its one node), pseudo states at the rule (O11) and custom
// conditions (`contextStyles`) beside the three device stages.

import { describe, expect, it } from "vitest";
import { compileCss, type CssDocument } from "../src/index.ts";

function compile(document: CssDocument): string {
  return compileCss(document, { layer: null });
}

const node = (id: string, classIds?: string[]) => ({
  id,
  primitive: "button",
  ...(classIds === undefined ? {} : { classIds }),
});

describe("pseudo states at the rule (O11)", () => {
  it("emits a class state in the class stage, after the plain class rule", () => {
    const css = compile({
      nodes: [node("n1", ["cta"])],
      classRules: [
        {
          name: "cta",
          props: { background: "#f00" },
          states: { hover: { background: "#0f0" }, disabled: { opacity: 0.5 } },
        },
      ],
    });
    const plain = css.indexOf(`.cta {`);
    const hover = css.indexOf(`.cta:hover {`);
    const disabled = css.indexOf(`.cta:disabled {`);
    expect(plain).toBeGreaterThan(-1);
    expect(hover).toBeGreaterThan(plain);
    expect(disabled).toBeGreaterThan(hover);
    expect(css).toContain("background-color: #00ff00;");
    expect(css).toContain("opacity: 0.5;");
  });

  it("lets the rule state win over the node state", () => {
    const css = compile({
      nodes: [
        {
          id: "n1",
          primitive: "button",
          classIds: ["cta"],
          states: { hover: { color: "#111111" } },
        },
      ],
      classRules: [
        {
          name: "cta",
          props: { color: "#f00" },
          states: { hover: { color: "#00ff00" } },
        },
      ],
    });
    const block = css.slice(css.indexOf(`[data-node-id="n1"].cta:hover {`));
    expect(block).toContain("color: #00ff00;");
    expect(block.slice(0, block.indexOf("}"))).not.toContain("#111111");
  });

  it("keeps the node state when the rule has none", () => {
    const css = compile({
      nodes: [
        {
          id: "n1",
          primitive: "button",
          classIds: ["cta"],
          states: { hover: { color: "#111111" } },
        },
      ],
      classRules: [{ name: "cta", props: { color: "#f00" } }],
    });
    expect(css).toContain(`[data-node-id="n1"].cta:hover {`);
    expect(css).toContain("color: #111111;");
  });
});

describe("ambient rules", () => {
  it("emits the verbatim selector without a node anchor", () => {
    const css = compile({
      nodes: [{ id: "n1", primitive: "heading" }],
      classRules: [
        { name: "h1 > span", props: { color: "#123456" }, kind: "ambient", selector: "h1 > span" },
      ],
    });
    expect(css).toContain("h1 > span {");
    expect(css).toContain("color: #123456;");
    expect(css).not.toContain(`[data-node-id="n1"]h1`);
    expect(css).not.toContain("data-node-id");
  });

  it("keeps an ambient rule alive without any node", () => {
    const css = compile({
      nodes: [],
      classRules: [
        { name: "a:hover", props: { color: "#ff0000" }, kind: "ambient", selector: "a:hover" },
      ],
    });
    expect(css).toContain("a:hover {");
  });
});

describe("scoped rules", () => {
  it("anchors the scope selector on its one node", () => {
    const css = compile({
      nodes: [{ id: "n1", primitive: "frame" }],
      classRules: [
        {
          name: "__senify_scope_n1",
          props: { borderRadius: "12px" },
          kind: "scoped",
          selector: ".__senify_scope_n1",
          scope: { nodeId: "n1" },
        },
      ],
    });
    expect(css).toContain(`[data-node-id="n1"].__senify_scope_n1 {`);
    expect(css).toContain("border-radius: 12px;");
  });

  it("drops a scoped rule whose node is gone", () => {
    const css = compile({
      nodes: [{ id: "n2", primitive: "frame" }],
      classRules: [
        {
          name: "__senify_scope_n1",
          props: { borderRadius: "12px" },
          kind: "scoped",
          selector: ".__senify_scope_n1",
          scope: { nodeId: "n1" },
        },
      ],
    });
    expect(css).toBe("");
  });
});

describe("custom conditions (contextStyles)", () => {
  it("wraps a bare condition in a media query", () => {
    const css = compile({
      nodes: [{ id: "n1", primitive: "button", classIds: ["cta"] }],
      classRules: [
        {
          name: "cta",
          props: { color: "#111111" },
          contextStyles: { "(orientation: landscape)": { color: "#222222" } },
        },
      ],
    });
    expect(css).toContain("@media (orientation: landscape) {");
    expect(css).toContain("color: #222222;");
  });

  it("takes a full at-rule prelude verbatim", () => {
    const css = compile({
      nodes: [{ id: "n1", primitive: "frame" }],
      classRules: [
        {
          name: "card",
          props: { color: "#111111" },
          kind: "ambient",
          selector: ".card",
          contextStyles: { "@supports (display: grid)": { display: "grid" } },
        },
      ],
    });
    expect(css).toContain("@supports (display: grid) {");
    expect(css).toContain("display: grid;");
  });

  it("nests the device block inside the condition", () => {
    const css = compile({
      nodes: [{ id: "n1", primitive: "button", classIds: ["cta"] }],
      classRules: [
        {
          name: "cta",
          props: { color: "#111111" },
          contextStyles: { "(orientation: landscape)": { color: "#222222", color_mobile: "#333333" } },
        },
      ],
    });
    const context = css.indexOf("@media (orientation: landscape) {");
    const nested = css.indexOf("@media (max-width: 639.98px) {", context);
    expect(context).toBeGreaterThan(-1);
    expect(nested).toBeGreaterThan(context);
    expect(css).toContain("color: #333333;");
  });

  it("combines a condition with a rule state", () => {
    const css = compile({
      nodes: [{ id: "n1", primitive: "button", classIds: ["cta"] }],
      classRules: [
        {
          name: "cta",
          props: { color: "#f00" },
          states: { hover: { color: "#00ff00" } },
          contextStyles: { "(orientation: landscape)": { color: "#0000ff" } },
        },
      ],
    });
    const context = css.indexOf("@media (orientation: landscape) {");
    expect(context).toBeGreaterThan(-1);
    expect(css.indexOf(`.cta:hover`, context)).toBeGreaterThan(context);
    expect(css).toContain("color: #0000ff;");
  });

  it("sorts several conditions by id", () => {
    const css = compile({
      nodes: [{ id: "n1", primitive: "frame" }],
      classRules: [
        {
          name: "card",
          props: { color: "#111111" },
          kind: "ambient",
          selector: ".card",
          contextStyles: {
            "(min-width: 900px)": { color: "#222222" },
            "(orientation: landscape)": { color: "#333333" },
          },
        },
      ],
    });
    expect(css.indexOf("(min-width: 900px)")).toBeLessThan(
      css.indexOf("(orientation: landscape)"),
    );
  });
});

describe("raw at-rules", () => {
  it("emits a safe keyframes block", () => {
    const css = compile({
      nodes: [],
      classRules: [
        {
          name: "spin",
          props: {},
          kind: "ambient",
          selector: ".spin",
          rawCss: "@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }",
        },
      ],
    });
    expect(css).toContain("@keyframes spin {");
    expect(css).toContain("transform: rotate(360deg);");
  });

  it("drops rawCss that is not a keyframes block", () => {
    for (const rawCss of [
      "@import url(https://evil.example/x.css)",
      "@keyframes x {} body { background: black }",
      "@keyframes x { from { color: red } } @import url(x)",
      "body { color: red }",
    ]) {
      const css = compile({
        nodes: [],
        classRules: [
          { name: "x", props: {}, kind: "ambient", selector: ".x", rawCss },
        ],
      });
      expect(css).not.toContain("@import");
      expect(css).not.toContain("body");
    }
  });

  it("normalizes an escaped rawCss before emitting it", () => {
    const css = compile({
      nodes: [],
      classRules: [
        {
          name: "x",
          props: {},
          kind: "ambient",
          selector: ".x",
          rawCss: "@\\6b eyframes spin { from { opacity: 0; } }",
        },
      ],
    });
    expect(css).toContain("@keyframes spin {");
  });
});
