import { describe, expect, it } from "vitest";
import type { Node } from "@senify/section-sdk";
import { islandsForNode } from "../src/islands.ts";
import { renderIslandsScript } from "../src/motion.ts";

describe("widget island", () => {
  it("detects a widget node", () => {
    const node: Node = { id: "n1", type: "ribbon-gallery", props: {}, children: [] };
    expect(islandsForNode(node)).toContain("widget");
  });
  it("renders a mount block with the widget url map", () => {
    const script = renderIslandsScript(new Set(["widget"]), { widgets: { "ribbon-gallery": "/assets/widgets/ribbon-gallery.abcd1234.js" } });
    expect(script).toContain('[data-island="widget"]');
    expect(script).toContain("/assets/widgets/ribbon-gallery.abcd1234.js");
    expect(script).toContain("data-props");
    expect(script).toContain('getAttribute("data-widget-state") !== "failed"');
  });
  it("renders nothing without the widget kind", () => {
    expect(renderIslandsScript(new Set(), {})).toBe("");
  });
  it("marks a widget without a bundle url as failed", () => {
    const script = renderIslandsScript(new Set(["widget"]), {});
    expect(script).toContain("var urls = {};");
    expect(script).toContain('host.setAttribute("data-widget-state", "failed")');
  });
  it("leaves other primitives alone", () => {
    const node: Node = { id: "h1", type: "hero", props: {}, children: [] };
    expect(islandsForNode(node)).not.toContain("widget");
  });
});
