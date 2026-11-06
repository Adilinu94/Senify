import { describe, expect, it } from "vitest";
import {
  CASCADE_LAYER,
  CASCADE_ORDER,
  CASCADE_PRECEDENCE,
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
  it("declares the stage names and the ADR-0017 precedence matrix", () => {
    expect([...CASCADE_ORDER]).toEqual(["base", "device", "state", "class", "inline"]);
    expect([...CASCADE_PRECEDENCE]).toEqual([
      "class-base",
      "base",
      "local-rule-base",
      "class-device",
      "device",
      "local-rule-device",
      "class-state",
      "state",
      "local-rule-state",
      "inline",
    ]);
    expect(CASCADE_LAYER).toBe("user-authored");
  });

  it("wraps all authored output in the single layer", () => {
    const css = compileCss(document);
    expect(css.startsWith(`@layer ${CASCADE_LAYER} {`)).toBe(true);
    expect(css.endsWith("}")).toBe(true);
    expect(css.match(/@layer /g)).toHaveLength(1);
  });

  it("emits the class base before the local base, then device and state", () => {
    const css = compileCss(document);
    const classBase = css.indexOf(`.highlight {`);
    const base = css.indexOf(`[data-node-id="card"] {`);
    const device = css.indexOf("@media (max-width: 1023.98px)");
    const state = css.indexOf(`[data-node-id="card"]:hover {`);

    expect(classBase).toBeGreaterThan(-1);
    expect(base).toBeGreaterThan(classBase);
    expect(device).toBeGreaterThan(base);
    expect(state).toBeGreaterThan(device);
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

  it("lets the local base override the class base and the local state override the class state", () => {
    const css = compileCss({
      nodes: [node],
      classRules: [
        {
          name: "highlight",
          props: { color: "#0000ff" },
          states: { hover: { color: "#123456" } },
        },
      ],
    });
    expect(classSelector("card", "highlight")).toBe(`[data-node-id="card"].highlight`);
    expect(stateSelector("card", "hover")).toBe(`[data-node-id="card"]:hover`);
    expect(block(css, `.highlight {`)).toContain("color: #0000ff;");
    expect(block(css, `.highlight:hover {`)).toContain("color: #123456;");
    expect(block(css, `[data-node-id="card"] {`)).toContain("color: #ff0000;");
    expect(block(css, `[data-node-id="card"]:hover {`)).toContain("color: #00ff00;");

    const classBase = css.indexOf(`.highlight {`);
    const localBase = css.indexOf(`[data-node-id="card"] {`);
    const classState = css.indexOf(`.highlight:hover {`);
    const localState = css.indexOf(`[data-node-id="card"]:hover {`);
    expect(classBase).toBeLessThan(localBase);
    expect(classState).toBeLessThan(localState);
  });

  it("orders class, local node and scoped rules by condition (ADR-0017)", () => {
    const css = compileCss(
      {
        nodes: [
          {
            id: "card",
            primitive: "button",
            props: { color: "#ff0000", padding_tablet: P4 },
            states: { hover: { color: "#00ff00" } },
            classIds: ["highlight"],
          },
        ],
        classRules: [
          {
            name: "highlight",
            props: { color: "#0000ff", padding_tablet: P8 },
            states: { hover: { color: "#123456" } },
          },
          {
            name: "local",
            kind: "scoped",
            scope: { nodeId: "card" },
            selector: ".local",
            props: { background: "#111111", padding_tablet: P8 },
            states: { hover: { background: "#222222" } },
          },
          {
            name: "ambient",
            kind: "ambient",
            selector: ".ambient",
            props: { borderColor: "#333333" },
          },
        ],
      },
      { layer: null },
    );

    const classBase = css.indexOf(`.highlight {`);
    const ambientBase = css.indexOf(`.ambient {`);
    const nodeBase = css.indexOf(`[data-node-id="card"] {`);
    const scopedBase = css.indexOf(`[data-node-id="card"].local {`);
    const media = css.indexOf("@media (max-width: 1023.98px)");
    const classDevice = css.indexOf(`.highlight {`, media);
    const nodeDevice = css.indexOf(`[data-node-id="card"] {`, media);
    const scopedDevice = css.indexOf(`[data-node-id="card"].local {`, media);
    const classState = css.indexOf(`.highlight:hover {`);
    const nodeState = css.indexOf(`[data-node-id="card"]:hover {`);
    const scopedState = css.indexOf(`[data-node-id="card"].local:hover {`);

    expect(classBase).toBeGreaterThan(-1);
    expect(classBase).toBeLessThan(ambientBase);
    expect(ambientBase).toBeLessThan(nodeBase);
    expect(nodeBase).toBeLessThan(scopedBase);
    expect(scopedBase).toBeLessThan(media);
    expect(media).toBeLessThan(classDevice);
    expect(classDevice).toBeLessThan(nodeDevice);
    expect(nodeDevice).toBeLessThan(scopedDevice);
    expect(scopedDevice).toBeLessThan(classState);
    expect(classState).toBeLessThan(nodeState);
    expect(nodeState).toBeLessThan(scopedState);

    expect(block(css, `.highlight:hover {`)).toContain("color: #123456;");
    expect(block(css, `[data-node-id="card"]:hover {`)).toContain("color: #00ff00;");
    expect(block(css, `[data-node-id="card"].local:hover {`)).toContain("background-color: #222222;");
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
