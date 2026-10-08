import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTree, cssEntryNodeIds, type SectionContext } from "@senify/registry/components";
import type { MotionSpec, Node } from "@senify/section-sdk";

// Reveals above the fold enter through CSS (the baked page ships the rules);
// the stamp must say so, and everything else keeps the pending marker.

function page(
  children: { id: string; type: string; motion?: MotionSpec; slots?: Record<string, string[]>; children?: string[] }[],
): Record<string, Node> {
  const nodes: Record<string, Node> = {
    root: { id: "root", type: "page", props: {}, children: children.map((child) => child.id) },
  };
  for (const child of children) {
    nodes[child.id] = {
      id: child.id,
      type: child.type,
      props: {},
      ...(child.motion === undefined ? {} : { motion: child.motion }),
      ...(child.slots === undefined ? {} : { slots: child.slots }),
      ...(child.children === undefined ? {} : { children: child.children }),
    };
  }
  return nodes;
}

const FADE: MotionSpec = { preset: "fade-up" };

describe("cssEntryNodeIds", () => {
  it("takes the eligible reveals of the first screenful: chrome plus the first two content sections", () => {
    const nodes = page([
      { id: "nav", type: "navbar", motion: FADE },
      { id: "hero", type: "hero", motion: FADE },
      { id: "feat", type: "features", motion: { preset: "scroll-reveal" } },
      { id: "stats", type: "stats", motion: FADE },
      { id: "cta", type: "cta", motion: FADE },
    ]);
    expect([...cssEntryNodeIds(nodes.root?.children ?? [], nodes)].sort()).toEqual([
      "feat",
      "hero",
      "nav",
    ]);
  });

  it("follows a node into its slots and children", () => {
    const nodes = page([
      { id: "hero", type: "hero", slots: { visual: ["pic"] } },
      { id: "pic", type: "media", motion: { preset: "fade-up-deblur" } },
    ]);
    // `pic` is a root child here, but a slot child below must count as well.
    nodes.root = { id: "root", type: "page", props: {}, children: ["hero"] };
    expect([...cssEntryNodeIds(["hero"], nodes)]).toEqual(["pic"]);
  });

  it("leaves the presets that rebuild the DOM, hover triggers and disabled specs to the script", () => {
    const nodes = page([
      { id: "a", type: "hero", motion: { preset: "masked-headline" } },
      { id: "b", type: "features", motion: { preset: "stagger-cascade" } },
      { id: "c", type: "stats", motion: { preset: "fade-up", trigger: "hover" } },
      { id: "d", type: "cta", motion: { preset: "fade-up", enabled: false } },
    ]);
    expect(cssEntryNodeIds(nodes.root?.children ?? [], nodes).size).toBe(0);
  });

  it("starts an explicit load trigger on load wherever the node sits", () => {
    const nodes = page([
      { id: "a", type: "hero" },
      { id: "b", type: "features" },
      { id: "c", type: "stats" },
      { id: "late", type: "cta", motion: { preset: "fade-up", trigger: "load" } },
      { id: "scroll", type: "divider", motion: FADE },
    ]);
    expect([...cssEntryNodeIds(nodes.root?.children ?? [], nodes)]).toEqual(["late"]);
  });

  it("keeps an id that could not live in a selector on the script path", () => {
    const nodes = page([{ id: 'a"]{}', type: "hero", motion: FADE }]);
    expect(cssEntryNodeIds(nodes.root?.children ?? [], nodes).size).toBe(0);
  });
});

describe("the stamp", () => {
  const base: SectionContext = { pagePaths: {}, assets: {} };
  const html = (nodes: Record<string, Node>, context: SectionContext): string =>
    renderToStaticMarkup(SectionTree({ rootNodeId: "root", nodes, ctx: context }));

  const nodes = page([
    { id: "hero", type: "hero", motion: FADE },
    { id: "feat", type: "features" },
    { id: "stats", type: "stats" },
    { id: "cta", type: "cta", motion: FADE },
  ]);

  it("marks the first-screen reveal as entering and the rest as pending on the baked page", () => {
    const out = html(nodes, { ...base, cssEntry: true });
    expect(out).toContain('data-motion-enter="fade-up"');
    expect(out.match(/data-motion-enter/g)).toHaveLength(1);
    // The one below the fold still waits for the script.
    expect(out.match(/data-motion-pending=""/g)).toHaveLength(1);
    const hero = /<section[^>]*data-node-id="hero"[^>]*>/.exec(out)?.[0] ?? "";
    expect(hero).toContain("data-motion-enter");
    expect(hero).not.toContain("data-motion-pending");
  });

  it("keeps the canvas on the pending marker: no entry rule exists there", () => {
    const out = html(nodes, base);
    expect(out).not.toContain("data-motion-enter");
    expect(out.match(/data-motion-pending=""/g)).toHaveLength(2);
  });

  it("stamps a catalog primitive the same way", () => {
    const tree: Record<string, Node> = {
      root: { id: "root", type: "page", props: {}, children: ["h"] },
      h: {
        id: "h",
        type: "heading",
        props: { level: "h1", text: "Katalog" },
        motion: FADE,
      },
    };
    const out = html(tree, { ...base, cssEntry: true });
    expect(out).toContain('data-motion-enter="fade-up"');
    expect(out).not.toContain("data-motion-pending");
    expect(html(tree, base)).toContain('data-motion-pending=""');
  });
});
