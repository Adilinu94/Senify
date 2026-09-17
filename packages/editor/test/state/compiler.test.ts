import { describe, expect, it } from "vitest";
import { toCssDocument } from "@senify/editor/state";
import {
  classSelector,
  compileCss,
  compileCssReport,
  mediaQueryFor,
  nodeSelector,
} from "@senify/widget-engine";
import { baseStore } from "./fixtures.ts";

// Point 6: a tree built only through the new operations, compiled by the one
// compiler, with the classes and device values landing in the output.

function builtCss(): string {
  const store = baseStore();
  store.apply({
    op: "setNodeProp",
    id: "head000001",
    key: "fontSize",
    value: 18,
    device: "tablet",
  });
  store.apply({
    op: "setNodeProp",
    id: "head000001",
    key: "fontSize",
    value: 14,
    device: "mobile",
  });
  store.apply({
    op: "createStyleRule",
    name: "cta",
    props: { background: "#ff0000", background_mobile: "#00ff00" },
  });
  store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
  return compileCss(toCssDocument(store.document));
}

describe("document -> compiler", () => {
  it("wraps everything in the one cascade layer", () => {
    expect(builtCss().startsWith("@layer user-authored {")).toBe(true);
  });

  it("carries base, device and class values into the stylesheet", () => {
    const css = builtCss();
    expect(css).toContain(nodeSelector("head000001") + " {");
    expect(css).toContain("font-size: 24px;");
    expect(css).toContain(mediaQueryFor("tablet"));
    expect(css).toContain(mediaQueryFor("mobile"));
    expect(css).toContain("font-size: 18px;");
    expect(css).toContain("font-size: 14px;");

    expect(css).toContain(classSelector("btn0000001", "cta") + " {");
    expect(css).toContain("background-color: #ff0000;");
    expect(css).toContain("background-color: #00ff00;");
  });

  it("keeps the catalog default out and writes the non-default", () => {
    const css = builtCss();
    // `align: "center"` is not the catalog default, so it shows up.
    expect(css).toContain("margin-inline: auto;");
    // The `text` prop is not a style property and never reaches CSS.
    expect(css).not.toContain("Hallo");
  });

  it("reports the class stage as data on the node", () => {
    const store = baseStore();
    store.apply({ op: "createStyleRule", name: "cta", props: { background: "#ff0000" } });
    store.apply({ op: "assignClass", id: "btn0000001", classId: "cta" });
    const report = compileCssReport(toCssDocument(store.document));
    const classRule = report.rules.find(
      (rule) =>
        rule.selector === classSelector("btn0000001", "cta") && rule.stage === "class",
    );
    expect(classRule?.classIds).toEqual(["cta"]);
    expect(report.ruleCount).toBeGreaterThan(0);
  });
});
