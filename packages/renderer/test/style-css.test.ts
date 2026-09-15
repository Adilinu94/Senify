import { describe, expect, it } from "vitest";
import type { NodeTree } from "@senify/section-sdk";
import { BREAKPOINTS, overridesCss } from "@senify/renderer";

function page(tree: NodeTree): { path: string; tree: NodeTree }[] {
  return [{ path: "/", tree }];
}

describe("style override css", () => {
  it("emits media queries for tablet and mobile overrides", () => {
    const tree: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {} },
        "hero-abc123": {
          id: "hero-abc123",
          type: "hero",
          props: {
            background: { $token: "bg.base" },
            cardBackground: "#ffffff",
          },
          overrides: {
            tablet: { props: { paddingY: { $token: "space.8" } } },
            mobile: { props: { cardPadding: "12px" } },
          },
        },
      },
    };
    const css = overridesCss(page(tree));
    expect(css).toContain(`@media (max-width: ${BREAKPOINTS.tablet - 0.02}px)`);
    expect(css).toContain(`@media (max-width: ${BREAKPOINTS.mobile - 0.02}px)`);
    expect(css).toContain('[data-node-id="hero-abc123"]');
    expect(css).toContain("--section-pad-y: var(--space-8);");
    expect(css).toContain("--card-pad: 12px;");
  });

  it("hides nodes and stays empty without overrides", () => {
    const empty: NodeTree = {
      rootNodeId: "root",
      nodes: { root: { id: "root", type: "page", props: {} } },
    };
    expect(overridesCss(page(empty))).toBe("");

    const hidden: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {} },
        "faq-xyz789": {
          id: "faq-xyz789",
          type: "faq",
          props: {},
          overrides: { mobile: { hidden: true } },
        },
      },
    };
    const css = overridesCss(page(hidden));
    expect(css).toContain("display: none;");
    expect(css).toContain('[data-node-id="faq-xyz789"]');
  });
});
