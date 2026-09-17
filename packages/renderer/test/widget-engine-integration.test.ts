import { describe, expect, it } from "vitest";
import type { NodeTree } from "@senify/section-sdk";
import { BREAKPOINTS, overridesCss } from "@senify/renderer";
import { defaultTheme } from "@senify/tokens";
import {
  DEVICE_BREAKPOINTS,
  compileCssReport,
  mediaQueryFor,
  nodeSelector,
  nodeTreeToCssDocument,
  themeTokenResolver,
} from "@senify/widget-engine";

// Point 7: the stylesheet the compiler produces is readable by the existing
// renderer — same node addressing (`[data-node-id]`), same breakpoints (the
// renderer's `BREAKPOINTS`) and the rules available as data. The renderer keeps
// its own override stylesheet; the compiler is fed through the bridge, so no
// second style pipeline is added to `packages/renderer`.

const tree: NodeTree = {
  rootNodeId: "root",
  nodes: {
    root: { id: "root", type: "page", props: {}, children: ["hero-abc123"] },
    "hero-abc123": {
      id: "hero-abc123",
      type: "hero",
      props: { background: { $token: "bg.base" }, color: "#111111" },
      overrides: { tablet: { props: { background: { $token: "bg.muted" } } } },
    },
  },
};

function compiled() {
  return compileCssReport(nodeTreeToCssDocument(tree), {
    resolveToken: themeTokenResolver(defaultTheme()),
  });
}

describe("renderer reads the compiler output", () => {
  it("shares the node selector with the bake", () => {
    expect(nodeSelector("hero-abc123")).toBe(`[data-node-id="hero-abc123"]`);
    expect(overridesCss([{ path: "/", tree }])).toContain(nodeSelector("hero-abc123"));
    expect(compiled().css).toContain(nodeSelector("hero-abc123"));
  });

  it("shares the one breakpoint source", () => {
    expect(DEVICE_BREAKPOINTS).toEqual({
      tablet: BREAKPOINTS.tablet,
      mobile: BREAKPOINTS.mobile,
    });
    const query = `@media (max-width: ${BREAKPOINTS.tablet - 0.02}px)`;
    expect(mediaQueryFor("tablet")).toBe(query);
    expect(overridesCss([{ path: "/", tree }])).toContain(query);
    expect(compiled().css).toContain(query);
  });

  it("exposes the rules as node-addressable data", () => {
    const report = compiled();
    const device = report.rules.find(
      (rule) => rule.selector === nodeSelector("hero-abc123") && rule.stage === "device",
    );
    expect(device?.media).toBe(mediaQueryFor("tablet"));
    expect(report.rules.some((rule) => rule.selector === nodeSelector("hero-abc123"))).toBe(true);
  });

  it("resolves the tree's style tokens to concrete colours", () => {
    // The bridge feeds the renderer tree into the compiler; the token refs of
    // the tree resolve against the theme and no colour is lost.
    const { css } = compiled();
    expect(css).not.toContain("var(--");
    expect(css).toContain("color: #111111;");
  });
});
