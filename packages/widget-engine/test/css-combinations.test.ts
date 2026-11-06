import { describe, expect, it } from "vitest";
import {
  compileCss,
  compileCssReport,
  type CssDocument,
} from "../src/index.ts";

// Device + state + class combined. ADR-0017 keeps the condition order
// class-base -> base -> class-device -> device -> class-state -> state, and a
// class state and a node state stay separate rules: the later local state wins
// the same-condition tie. No anchored `[data-node-id].cls:hover` combination
// is needed any more.

const doc: CssDocument = {
  nodes: [
    {
      id: "card",
      primitive: "button",
      props: { color: "#ff0000", color_tablet: "#111111" },
      states: { hover: { background: "#00ff00", background_mobile: "#0000ff" } },
      classIds: ["highlight"],
    },
  ],
  classRules: [
    {
      name: "highlight",
      props: { background: "#222222", background_tablet: "#333333" },
    },
  ],
};

const GOLDEN = `.highlight {
  background-color: #222222;
}

[data-node-id="card"] {
  color: #ff0000;
}

@media (max-width: 1023.98px) {
  .highlight {
    background-color: #333333;
  }
}

@media (max-width: 1023.98px) {
  [data-node-id="card"] {
    color: #111111;
  }
}

[data-node-id="card"]:hover {
  background-color: #00ff00;
}

@media (max-width: 639.98px) {
  [data-node-id="card"]:hover {
    background-color: #0000ff;
  }
}`;

describe("device x state x class (golden)", () => {
  it("writes every combination into one stylesheet in stage order", () => {
    expect(compileCss(doc, { layer: null })).toBe(GOLDEN);
  });

  it("keeps the same input stable across calls", () => {
    expect(compileCss(doc, { layer: null })).toBe(compileCss(doc, { layer: null }));
  });
});

describe("combination coverage", () => {
  const css = compileCss(doc, { layer: null });

  it("combines device and state into the media rule", () => {
    // Gerät + Zustand: the hover rule inside the mobile media query.
    expect(css).toContain("@media (max-width: 639.98px)");
    const media = css.slice(css.indexOf("@media (max-width: 639.98px)"));
    expect(media).toContain(`[data-node-id="card"]:hover {`);
    expect(media).toContain("background-color: #0000ff;");
  });

  it("keeps class and node state as separate rules", () => {
    expect(css).toContain(".highlight {");
    expect(css).toContain(`[data-node-id="card"]:hover {`);
    expect(css).not.toContain(`[data-node-id="card"].highlight:hover {`);
  });

  it("emits the class device before the local device", () => {
    const tablet = css.slice(css.indexOf("@media (max-width: 1023.98px)"));
    const classDevice = tablet.indexOf(".highlight {");
    const nodeDevice = tablet.indexOf(`[data-node-id="card"] {`);
    expect(classDevice).toBeGreaterThan(-1);
    expect(nodeDevice).toBeGreaterThan(classDevice);
    expect(tablet).toContain("background-color: #333333;");
  });

  it("orders class base before local base and state", () => {
    const classBase = css.indexOf(`.highlight {`);
    const nodeBase = css.indexOf(`[data-node-id="card"] {`);
    const nodeState = css.indexOf(`[data-node-id="card"]:hover {`);
    expect(classBase).toBeLessThan(nodeBase);
    expect(nodeBase).toBeLessThan(nodeState);
  });

  it("lets the local node state keep its background over the class base", () => {
    // The class sets `background`; the node state sets `background` too. The
    // local state is the later rule at the same condition and wins.
    expect(css).toContain(`[data-node-id="card"]:hover {\n  background-color: #00ff00;`);
    expect(css.indexOf(`[data-node-id="card"]:hover {`)).toBeGreaterThan(
      css.indexOf(".highlight {"),
    );
  });

  it("writes no combined rule without a class", () => {
    const alone = compileCss(
      { nodes: [{ id: "solo", primitive: "button", props: { color: "#010101" }, states: { hover: { color: "#020202" } } }] },
      { layer: null },
    );
    expect(alone).toContain(`[data-node-id="solo"]:hover {`);
    expect(alone).not.toContain(".highlight");
    expect(alone).not.toContain(":hover.hover");
  });

  it("writes no combined rule without a state", () => {
    const alone = compileCss(
      {
        nodes: [{ id: "solo", primitive: "button", props: { color: "#010101" }, classIds: ["flat"] }],
        classRules: [{ name: "flat", props: { background: "#030303" } }],
      },
      { layer: null },
    );
    expect(alone).toContain(`.flat {`);
    expect(alone).not.toContain(".flat:hover");
  });
});

describe("compiled rules as data", () => {
  it("reports the class base and the local state as separate rules", () => {
    const report = compileCssReport(doc, { layer: null });
    const classBase = report.rules.find(
      (rule) => rule.selector === ".highlight" && rule.media === null,
    );
    expect(classBase).toBeDefined();
    expect(classBase?.stage).toBe("class");
    expect(classBase?.state).toBeNull();
    expect(classBase?.classIds).toEqual(["highlight"]);
    expect(classBase?.declarations).toEqual([
      { property: "background-color", value: "#222222" },
    ]);

    const localState = report.rules.find(
      (rule) => rule.selector === `[data-node-id="card"]:hover` && rule.media === null,
    );
    expect(localState).toBeDefined();
    expect(localState?.stage).toBe("state");
    expect(localState?.state).toBe("hover");
    expect(localState?.classIds).toEqual([]);
    expect(localState?.declarations).toEqual([
      { property: "background-color", value: "#00ff00" },
    ]);
  });

  it("reports the state rule inside its media query", () => {
    const report = compileCssReport(doc, { layer: null });
    const state = report.rules.find(
      (rule) => rule.selector === `[data-node-id="card"]:hover` && rule.media !== null,
    );
    expect(state?.media).toBe("@media (max-width: 639.98px)");
    expect(state?.stage).toBe("state");
  });

  it("keeps the rule count in sync with the stylesheet", () => {
    const report = compileCssReport(doc, { layer: null });
    const blockCount = (report.css.match(/\{/g) ?? []).length;
    // Each rule opens exactly one block, each media wrapper one more. Six
    // rules, three media wrappers: class tablet, node tablet, state mobile.
    expect(report.ruleCount).toBe(6);
    expect(blockCount).toBe(report.ruleCount + 3);
  });
});
