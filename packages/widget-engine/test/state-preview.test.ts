import { describe, expect, it } from "vitest";
import {
  CASCADE_LAYER,
  FORCED_STATE_ATTRIBUTE,
  compileCss,
  forcedStateCss,
  forcedStateSelector,
  type CssDocument,
} from "../src/index.ts";

const doc: CssDocument = {
  nodes: [
    {
      id: "card",
      primitive: "button",
      props: { color: "#ff0000" },
      states: {
        hover: { background: "#00ff00", background_tablet: "#0000ff" },
        focus: { color: "#123456" },
      },
      classIds: ["highlight"],
    },
    {
      id: "plain",
      primitive: "text",
      props: { color: "#333333" },
    },
  ],
  classRules: [{ name: "highlight", props: { background: "#222222" } }],
};

describe("forced state preview", () => {
  it("leaves the release stylesheet untouched", () => {
    const before = compileCss(doc);
    // Generating the preview is a pure function of the document.
    forcedStateCss(doc, "hover");
    const after = compileCss(doc);
    expect(after).toBe(before);
    expect(after).not.toContain(FORCED_STATE_ATTRIBUTE);
    expect(after.startsWith(`@layer ${CASCADE_LAYER} {`)).toBe(true);
  });

  it("paints the hover state through the root attribute", () => {
    const preview = forcedStateCss(doc, "hover");
    expect(preview).toContain(`[${FORCED_STATE_ATTRIBUTE}="hover"] [data-node-id="card"] {`);
    expect(preview).toContain("background-color: #00ff00;");
  });

  it("carries the device override into the media query", () => {
    const preview = forcedStateCss(doc, "hover");
    expect(preview).toContain("@media (max-width: 1023.98px)");
    const media = preview.slice(preview.indexOf("@media (max-width: 1023.98px)"));
    expect(media).toContain(`[${FORCED_STATE_ATTRIBUTE}="hover"] [data-node-id="card"] {`);
    expect(media).toContain("background-color: #0000ff;");
  });

  it("mirrors the combined class + state rule", () => {
    const preview = forcedStateCss(doc, "hover");
    expect(preview).toContain(
      `[${FORCED_STATE_ATTRIBUTE}="hover"] [data-node-id="card"].highlight {`,
    );
    // Class wins over state (O1), so the forced combined rule shows the class value.
    expect(preview).toContain("background-color: #222222;");
  });

  it("forces another state and yields its own attribute value", () => {
    const focus = forcedStateCss(doc, "focus");
    expect(focus).toContain(`[${FORCED_STATE_ATTRIBUTE}="focus"] [data-node-id="card"] {`);
    expect(focus).toContain("color: #123456;");
    expect(focus).not.toContain("#00ff00");
  });

  it("writes nothing for a state no node carries", () => {
    expect(forcedStateCss(doc, "active")).toBe("");
  });

  it("is unlayered chrome so it beats the authored layer", () => {
    const preview = forcedStateCss(doc, "hover");
    expect(preview).not.toContain("@layer");
    // The release rule stays in the layer; the chrome rule does not.
    expect(compileCss(doc)).toContain("@layer");
  });
});

describe("forced state helpers", () => {
  it("builds the preview selector", () => {
    expect(forcedStateSelector("hero-1", "hover")).toBe(
      `[data-force-state="hover"] [data-node-id="hero-1"]`,
    );
  });

  it("honours a custom attribute and a node filter", () => {
    const preview = forcedStateCss(doc, "hover", {
      attribute: "data-preview-state",
      nodeIds: ["plain"],
    });
    expect(preview).toBe("");
    const card = forcedStateCss(doc, "hover", {
      attribute: "data-preview-state",
      nodeIds: ["card"],
    });
    expect(card).toContain(`[data-preview-state="hover"] [data-node-id="card"] {`);
    expect(card).not.toContain(`[${FORCED_STATE_ATTRIBUTE}="hover"]`);
  });
});
