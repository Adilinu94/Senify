import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import { bundledSections } from "@senify/registry";
import type { GoldenNode, MotionSpec, Node, NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { bakeSite, motionDataFor, overridesCss, styleRulesCss, type BakeResult } from "@senify/renderer";

// ADR-0020: a site may carry its own breakpoint pair. Every media query the
// bake writes — the override sheet, the site style rules, the motion payload —
// reads it, and a site without one bakes exactly as before.

const OWN = { tablet: 1200, mobile: 810 };

function overridden(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {} },
      "box-abc123": {
        id: "box-abc123",
        type: "frame",
        props: { color: "#112233" },
        overrides: {
          tablet: { props: { paddingY: { $token: "space.8" }, color: "#445566" }, hidden: true },
          mobile: { props: { cardPadding: "12px", color: "#778899" } },
        },
      },
      // Hidden on tablet alone: an exact width range between both numbers.
      "mid-abc124": {
        id: "mid-abc124",
        type: "frame",
        props: {},
        overrides: { tablet: { hidden: true }, mobile: { hidden: false } },
      },
      // Shown on tablet and mobile only: hidden from the tablet number up.
      "low-abc125": {
        id: "low-abc125",
        type: "frame",
        props: {},
        hidden: true,
        overrides: { tablet: { hidden: false }, mobile: { hidden: false } },
      },
    },
  };
}

const page = (): { path: string; tree: NodeTree }[] => [{ path: "/", tree: overridden() }];

describe("override sheet with a site pair", () => {
  it("keeps the default numbers without a pair", () => {
    const css = overridesCss(page());
    expect(css).toContain("@media (max-width: 1023.98px)");
    expect(css).toContain("@media (max-width: 639.98px)");
    expect(overridesCss(page(), null)).toBe(css);
  });

  it("writes the site's numbers for overrides and for the per-device ranges", () => {
    const css = overridesCss(page(), OWN);
    expect(css).toContain("@media (max-width: 1199.98px)");
    expect(css).toContain("@media (max-width: 809.98px)");
    expect(css).toContain("@media (min-width: 1200px)");
    expect(css).toContain("@media (min-width: 810px) and (max-width: 1199.98px)");
    expect(css).not.toContain("1023.98");
    expect(css).not.toContain("639.98");
    expect(css).not.toContain("1024px");
    expect(css).not.toContain("640px");
  });

  it("changes nothing but the numbers", () => {
    const own = overridesCss(page(), OWN)
      .replaceAll("1199.98", "1023.98")
      .replaceAll("809.98", "639.98")
      .replaceAll("min-width: 1200px", "min-width: 1024px")
      .replaceAll("min-width: 810px", "min-width: 640px");
    expect(own).toBe(overridesCss(page()));
  });
});

describe("site style rules with a site pair", () => {
  it("writes the device values of the nodes with the site's numbers", () => {
    const own = styleRulesCss(page(), [], OWN);
    expect(own).toContain("@media (max-width: 1199.98px)");
    expect(own).toContain("@media (max-width: 809.98px)");
    expect(own).not.toContain("1023.98");
    const standard = styleRulesCss(page(), []);
    expect(standard).toContain("@media (max-width: 1023.98px)");
    expect(standard).toContain("@media (max-width: 639.98px)");
  });
});

describe("motion payload with a site pair", () => {
  it("carries the site's queries so the browser switches where the CSS does", () => {
    expect(motionDataFor([]).breakpoints).toEqual({
      tablet: "(max-width: 1023.98px)",
      mobile: "(max-width: 639.98px)",
    });
    expect(motionDataFor([], OWN).breakpoints).toEqual({
      tablet: "(max-width: 1199.98px)",
      mobile: "(max-width: 809.98px)",
    });
  });
});

let counter = 0;
function place(golden: GoldenNode, nodes: Record<string, Node>, parentId: string): string {
  const id = `sb${counter++}`;
  const parent = nodes[parentId];
  if (!parent) throw new Error(`Missing parent ${parentId}`);
  parent.children = [...(parent.children ?? []), id];
  nodes[id] = { id, type: golden.type, variant: golden.variant, props: { ...golden.props } };
  for (const child of golden.children ?? []) place(child, nodes, id);
  return id;
}

function sectionTree(): NodeTree {
  const nodes: Record<string, Node> = { root: { id: "root", type: "page", props: {} } };
  const sections: { type: string; motion?: MotionSpec }[] = [
    { type: "hero" },
    { type: "stats" },
    { type: "cta", motion: { preset: "scroll-reveal" } },
  ];
  for (const section of sections) {
    const definition = bundledSections.find((entry) => entry.type === section.type);
    if (!definition) throw new Error(`Unknown section ${section.type}`);
    const id = place(definition.golden.tree, nodes, "root");
    const node = nodes[id];
    if (!node) continue;
    if (section.motion) node.motion = section.motion;
    if (section.type === "hero") {
      node.overrides = { tablet: { props: { paddingY: { $token: "space.8" } } }, mobile: { props: { cardPadding: "12px" } } };
    }
  }
  return { rootNodeId: "root", nodes };
}

const resolved = resolveTheme(defaultTheme());
const baked: BakeResult[] = [];
afterAll(() => {
  for (const result of baked) rmSync(result.outDir, { recursive: true, force: true });
});

async function bake(breakpoints?: { tablet: number; mobile: number }): Promise<ReturnType<typeof loadBakedSite>> {
  const result = await bakeSite(
    {
      siteName: "Musterstudio",
      baseUrl: "https://beispiel.de",
      ...(breakpoints === undefined ? {} : { breakpoints }),
      pages: [{ id: "p-home", path: "/", title: "Start", tree: sectionTree() }],
      themeCss: emitCss(resolved),
      motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
      profile: "standard",
    },
    { outDir: join(mkdtempSync(join(tmpdir(), "senify-site-breakpoints-")), "dist") },
  );
  baked.push(result);
  return loadBakedSite(result.outDir);
}

describe("bake with a site pair", () => {
  it("bakes the default numbers for a site without a pair", async () => {
    const site = await bake();
    const css = await site.read("assets/sections.css");
    expect(css).toContain("@media (max-width: 1023.98px)");
    expect(css).toContain("@media (max-width: 639.98px)");
    const html = await site.read("index.html");
    expect(html).toContain("(max-width: 1023.98px)");
    expect(html).toContain("(max-width: 639.98px)");
  }, 240000);

  it("bakes the site's numbers into the sheet and into the motion payload", async () => {
    const site = await bake(OWN);
    const css = await site.read("assets/sections.css");
    expect(css).toContain("@media (max-width: 1199.98px)");
    expect(css).toContain("@media (max-width: 809.98px)");
    expect(css).not.toContain("1023.98");
    expect(css).not.toContain("639.98");
    const html = await site.read("index.html");
    const payload = /<script type="application\/json" id="motion-data">([^<]*)<\/script>/.exec(html)?.[1] ?? "";
    expect(payload).toContain("(max-width: 1199.98px)");
    expect(payload).toContain("(max-width: 809.98px)");
    expect(payload).not.toContain("1023.98");
  }, 240000);
});
