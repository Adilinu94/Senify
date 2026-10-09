import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createRegistry } from "@senify/registry";
import { SECTION_COMPONENTS } from "../src/components/index.ts";

// A variant is why a user picks a section, so two variants of one section must
// not render the same HTML. Every section with more than one variant is
// rendered once per variant from its golden tree and the outputs must differ.
//
// A few props are not part of a golden tree on purpose (it doubles as the
// thumbnail source): a video address the author adds, and the items the engine
// prefetches into a collection list. The test supplies them, because without
// them the variants have nothing to show.
const EXTRA_PROPS: Record<string, Record<string, unknown>> = {
  media: { videoUrl: "https://cdn.example.test/film.mp4" },
  "collection-list": {
    itemTemplate: { variant: "text", styleProps: {} },
    items: [
      { variant: "text", props: { title: "Erster Artikel", text: "Kurzer Anreißer." } },
      { variant: "text", props: { title: "Zweiter Artikel", text: "Noch ein Anreißer." } },
    ],
  },
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
    "%s: no two variants render the same HTML",
    (type, section) => {
      const props = { ...(section.golden?.tree.props ?? {}), ...(EXTRA_PROPS[type] ?? {}) } as Record<string, unknown>;
      expect(identicalGroups(type, Object.keys(section.variants ?? {}), props)).toEqual([]);
    },
  );
});
