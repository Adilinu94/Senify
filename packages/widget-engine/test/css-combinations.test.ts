import { describe, expect, it } from "vitest";
import {
  compileCss,
  compileCssReport,
  type CssDocument,
} from "../src/index.ts";

// Device + state + class combined. The cascade decision (O1) keeps the fixed
// stage order base -> device -> state -> class -> inline; a state and a class
// expand over every device, and a node that carries both gets the combined rule
// `[data-node-id].cls:hover` with the class values over the state values.

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

const GOLDEN = `[data-node-id="card"] {
  color: #ff0000;
}

@media (max-width: 1023.98px) {
  [data-node-id="card"] {
    color: #111111;
  }
}

@media (hover: hover) {
  [data-node-id="card"]:hover {
    background-color: #00ff00;
  }
}

@media (max-width: 639.98px) {
  @media (hover: hover) {
    [data-node-id="card"]:hover {
      background-color: #0000ff;
    }
  }
}

.highlight {
  background-color: #222222;
}

@media (hover: hover) {
  [data-node-id="card"].highlight:hover {
    background-color: #222222;
  }
}

@media (max-width: 1023.98px) {
  .highlight {
    background-color: #333333;
  }

  @media (hover: hover) {
    [data-node-id="card"].highlight:hover {
      background-color: #333333;
    }
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

  it("combines class and state into one selector", () => {
    // Klasse + Zustand: `[data-node-id].highlight:hover`.
    expect(css).toContain(`[data-node-id="card"].highlight:hover {`);
  });

  it("combines device, state and class in one rule", () => {
    // Gerät + Zustand + Klasse: the combined selector inside the tablet media.
    const tablet = css.slice(
      css.indexOf("@media (max-width: 1023.98px)", css.indexOf(".highlight")),
    );
    expect(tablet.startsWith("@media (max-width: 1023.98px)")).toBe(true);
    expect(tablet).toContain(`[data-node-id="card"].highlight:hover {`);
    expect(tablet).toContain("background-color: #333333;");
  });

  it("orders the stages state before class", () => {
    expect(css.indexOf(`[data-node-id="card"]:hover {`)).toBeLessThan(
      css.indexOf(`.highlight {`),
    );
  });

  it("lets the class win inside the combined rule (O1)", () => {
    // The class sets `background`; the state sets `background` too. The class
    // is the stronger stage, so the combined rule carries the class value.
    expect(css).toContain(`[data-node-id="card"].highlight:hover {\n    background-color: #222222;`);
    expect(css).not.toContain(`[data-node-id="card"].highlight:hover {\n    background-color: #00ff00;`);
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
  it("reports the combined rule with its modifiers", () => {
    const report = compileCssReport(doc, { layer: null });
    const combined = report.rules.find(
      (rule) => rule.selector === `[data-node-id="card"].highlight:hover` && rule.media === null,
    );
    expect(combined).toBeDefined();
    expect(combined?.stage).toBe("class");
    expect(combined?.state).toBe("hover");
    expect(combined?.classIds).toEqual(["highlight"]);
    expect(combined?.declarations).toEqual([
      { property: "background-color", value: "#222222" },
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
    // Each rule opens exactly one block, each media wrapper one more. Eight
    // rules; the wrappers are the device queries (tablet base, mobile state,
    // tablet class) and the hover guard around every hover rule: state desktop,
    // state mobile, class desktop, class tablet.
    expect(report.ruleCount).toBe(8);
    expect(blockCount).toBe(report.ruleCount + 3 + 4);
  });
});
