import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createRegistry } from "@senify/registry";
import { SECTION_COMPONENTS } from "../src/components/index.ts";

// A variant is why a user picks a section, so two variants of one section must
// not render the same HTML. These sets still do (measured with each section's
// golden tree). The list documents the gap and may only shrink: when a variant
// becomes distinct, take it out here, and the test keeps it that way.
// media, logo-cloud, marquee, collection-list and embed: their golden tree carries no
// assets, items or URL, so a difference may only show with real content.
const STILL_IDENTICAL: Record<string, string[][]> = {
  banner: [["bar", "ribbon", "announcement"]],
  navbar: [["default", "transparent", "centered"]],
  footer: [["multi-column", "minimal", "cta-bar"]],
  media: [["image", "video"]],
  "services-process": [["steps", "cards", "timeline"]],
  "logo-cloud": [["grid", "wrap"]],
  projects: [["cards", "list", "showcase"]],
  testimonials: [["cards", "spotlight"]],
  pricing: [["plans-3", "comparison", "simple"]],
  faq: [["accordion", "two-col", "sticky-heading"]],
  team: [["grid", "cards", "compact"]],
  contact: [["split", "form", "info"]],
  newsletter: [["boxed", "inline", "split"]],
  gallery: [["grid", "masonry"]],
  timeline: [["vertical", "horizontal", "cards"]],
  comparison: [["table", "cards"]],
  "cookie-note": [["bar", "card"]],
  marquee: [["text", "logos", "images"]],
  "collection-list": [["cards", "grid", "list"]],
  embed: [["map", "iframe", "social"]],
};

function identicalGroups(type: string, variants: string[], props: Record<string, unknown>): string[][] {
  const Component = SECTION_COMPONENTS[type as keyof typeof SECTION_COMPONENTS] as unknown as
    | ((p: unknown) => unknown)
    | undefined;
  if (Component === undefined) return [];
  const byHtml = new Map<string, string[]>();
  for (const variant of variants) {
    const node = { id: "nodeAAAAAA", type, variant, props, children: [] };
    const html = renderToStaticMarkup(
      createElement(Component as never, { node, ctx: { pagePaths: {}, assets: {} }, slots: {} } as never),
    ).replace(/ data-variant="[^"]*"/g, "");
    byHtml.set(html, [...(byHtml.get(html) ?? []), variant]);
  }
  return [...byHtml.values()].filter((group) => group.length > 1);
}

describe("section variants", () => {
  const sections = createRegistry()
    .list()
    .filter((section) => Object.keys(section.variants ?? {}).length > 1 && section.golden?.tree !== undefined);

  it.each(sections.map((section) => [section.type, section] as const))(
    "%s: variants that render the same HTML are exactly the listed ones",
    (type, section) => {
      const props = (section.golden?.tree.props ?? {}) as Record<string, unknown>;
      const groups = identicalGroups(type, Object.keys(section.variants ?? {}), props);
      expect(groups).toEqual(STILL_IDENTICAL[type] ?? []);
    },
  );
});
