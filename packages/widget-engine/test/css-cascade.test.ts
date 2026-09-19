import { describe, expect, it } from "vitest";
import {
  CASCADE_LAYER,
  CASCADE_ORDER,
  STATE_ORDER,
  classSelector,
  compileCss,
  inlineStyleFor,
  nodeSelector,
  stateSelector,
} from "../src/index.ts";
import type { CssNode } from "../src/index.ts";

const P8 = { top: "8", right: "8", bottom: "8", left: "8", isLinked: true, unit: "px" };
const P4 = { top: "4", right: "4", bottom: "4", left: "4", isLinked: true, unit: "px" };

const node: CssNode = {
  id: "card",
  primitive: "button",
  props: { padding: P8, color: "#ff0000", padding_tablet: P4 },
  states: { hover: { color: "#00ff00" } },
  classIds: ["highlight"],
  inline: { color: "#000000" },
};

const document = {
  nodes: [node],
  classRules: [{ name: "highlight", props: { color: "#0000ff" } }],
};

// The block that starts at the first occurrence of the given rule header.
function block(css: string, header: string): string {
  const start = css.indexOf(header);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("cascade decision", () => {
  it("declares the five levels weak to strong", () => {
    expect([...CASCADE_ORDER]).toEqual(["base", "device", "state", "class", "inline"]);
    expect(CASCADE_LAYER).toBe("user-authored");
  });

  it("wraps all authored output in the single layer", () => {
    const css = compileCss(document);
    expect(css.startsWith(`@layer ${CASCADE_LAYER} {`)).toBe(true);
    expect(css.endsWith("}")).toBe(true);
    expect(css.match(/@layer /g)).toHaveLength(1);
  });

  it("emits the stages in cascade order", () => {
    const css = compileCss(document);
    const base = css.indexOf(`[data-node-id="card"] {`);
    const device = css.indexOf("@media (max-width: 1023.98px)");
    const state = css.indexOf(`[data-node-id="card"]:hover {`);
    const userClass = css.indexOf(`.highlight {`);

    expect(base).toBeGreaterThan(-1);
    expect(device).toBeGreaterThan(base);
    expect(state).toBeGreaterThan(device);
    expect(userClass).toBeGreaterThan(state);
  });

  it("lets the device rule override the base rule", () => {
    const css = compileCss(document);
    expect(block(css, `[data-node-id="card"] {`)).toContain("padding: 8px;");
    expect(block(css, `[data-node-id="card"] {`)).toContain("color: #ff0000;");
    expect(block(css, "@media (max-width: 1023.98px) {")).toContain("padding: 4px;");
  });

  it("lets the state rule override the base rule", () => {
    const css = compileCss(document);
    expect(block(css, `[data-node-id="card"]:hover {`)).toBe(
      `[data-node-id="card"]:hover {\n    color: #00ff00;\n  }`,
    );
  });

  it("lets the user class override the state rule", () => {
    const css = compileCss(document);
    // Ticket 14: the plain class rule is global (`.highlight`, one simple
    // selector) and still wins against base/device/state through source order;
    // where the node has its own state, the anchored combination
    // (`[data-node-id].highlight:hover`, three simple selectors) carries the
    // class values over the state values.
    expect(classSelector("card", "highlight")).toBe(`[data-node-id="card"].highlight`);
    expect(stateSelector("card", "hover")).toBe(`[data-node-id="card"]:hover`);
    expect(block(css, `.highlight {`)).toContain("color: #0000ff;");
    expect(block(css, `[data-node-id="card"].highlight:hover {`)).toContain("color: #0000ff;");
  });

  it("leaves the inline value as the strongest level, outside the layer", () => {
    const css = compileCss(document);
    expect(css).not.toContain("#000000");
    expect(inlineStyleFor(node)).toBe("color: #000000");
  });
});

// O11 (17.09.): vier Pseudo-States, `disabled` nach `active`. Der Inspektor baut
// vier Zustands-Reiter; der Compiler muss dieselbe Reihenfolge tragen, sonst
// gewinnt `disabled` gegen `active`, sobald beide am selben Knoten stehen.
describe("pseudo states (O11)", () => {
  it("orders the four states weak to strong, disabled last", () => {
    expect([...STATE_ORDER]).toEqual(["hover", "focus", "active", "disabled"]);
    expect(stateSelector("card", "disabled")).toBe(`[data-node-id="card"]:disabled`);
  });

  it("emits a disabled rule in the state stage, after active", () => {
    const css = compileCss({
      nodes: [
        {
          id: "btn",
          primitive: "button",
          props: { color: "#111111" },
          states: {
            disabled: { color: "#999999" },
            active: { color: "#333333" },
          },
        },
      ],
    });
    const active = css.indexOf(`[data-node-id="btn"]:active {`);
    const disabled = css.indexOf(`[data-node-id="btn"]:disabled {`);
    expect(active).toBeGreaterThan(-1);
    expect(disabled).toBeGreaterThan(active);
    expect(block(css, `[data-node-id="btn"]:disabled {`)).toContain("color: #999999;");
  });
});

describe("selectors", () => {
  it("builds one stable selector from the node id", () => {
    expect(nodeSelector("hero-1")).toBe(`[data-node-id="hero-1"]`);
    expect(nodeSelector('sag "x"')).toBe(`[data-node-id="sag \\"x\\""]`);
  });

  it("ignores a class rule that no node carries", () => {
    const css = compileCss({
      nodes: [{ id: "solo", primitive: "frame", props: { padding: P8 } }],
      classRules: [{ name: "unused", props: { color: "#123456" } }],
    });
    expect(css).not.toContain("unused");
  });
});

describe("tree", () => {
  it("walks a node, its children, then its slots", () => {
    const css = compileCss(
      {
        nodes: [
          {
            id: "root",
            primitive: "root",
            props: { background: "#101010" },
            children: [
              {
                id: "child",
                primitive: "frame",
                props: { display: "grid" },
                slots: { item: [{ id: "slot-item", primitive: "text", props: { color: "#202020" } }] },
              },
            ],
            slots: { aside: [{ id: "aside-item", primitive: "text", props: { color: "#303030" } }] },
          },
        ],
      },
      { layer: null },
    );
    expect(css.indexOf('"root"')).toBeLessThan(css.indexOf('"child"'));
    expect(css.indexOf('"child"')).toBeLessThan(css.indexOf('"slot-item"'));
    expect(css.indexOf('"slot-item"')).toBeLessThan(css.indexOf('"aside-item"'));
  });
});

describe("stability", () => {
  const first = compileCss(document);
  const second = compileCss(document);

  it("returns the same output for the same input", () => {
    expect(first).toBe(second);
  });

  it("does not depend on the key order of the value bag", () => {
    const a = compileCss({
      nodes: [{ id: "s", primitive: "frame", props: { padding: P8, color: "#ff0000" } }],
    });
    const b = compileCss({
      nodes: [{ id: "s", primitive: "frame", props: { color: "#ff0000", padding: P8 } }],
    });
    expect(a).toBe(b);
  });

  it("keeps the document order of the nodes", () => {
    const css = compileCss({
      nodes: [
        { id: "b", primitive: "text", props: { color: "#000001" } },
        { id: "a", primitive: "text", props: { color: "#000002" } },
      ],
    });
    expect(css.indexOf('"b"')).toBeLessThan(css.indexOf('"a"'));
  });
});
