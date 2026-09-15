import { describe, expect, it } from "vitest";
import { pageOutline, selectNodes } from "@senify/mcp";
import type { NodeTree } from "@senify/section-sdk";

function tree(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {}, children: ["hero-1", "features-1", "gone"] },
      "hero-1": {
        id: "hero-1",
        type: "hero",
        variant: "centered",
        props: {
          headline: "Ein sehr langer Headline-Text, der im Outline gekürzt werden soll",
          ctas: [{ label: "Los" }, { label: "Mehr" }],
        },
      },
      "features-1": {
        id: "features-1",
        type: "features",
        props: { title: "Warum wir", items: [{}, {}] },
        hidden: true,
      },
    },
  };
}

const page = () => ({
  id: "page-1",
  path: "/",
  title: "Start",
  draftVersion: 4,
  draft: tree(),
});

describe("page outline", () => {
  it("summarises the top-level sections token-efficiently", () => {
    const outline = pageOutline(page());
    expect(outline.pageId).toBe("page-1");
    expect(outline.draftVersion).toBe(4);
    expect(outline.sections.map((section) => section.type)).toEqual([
      "hero",
      "features",
      "missing",
    ]);
    const hero = outline.sections[0];
    expect(hero?.variant).toBe("centered");
    expect(hero?.summary).toContain("headline:");
    expect(hero?.summary.length).toBeLessThan(120);
    expect(hero?.summary).toContain("ctas: 2 items");
    expect(outline.sections[1]?.hidden).toBe(true);
    expect(outline.sections[2]?.summary).toContain("not part of the tree");
  });

  it("selects full nodes by id and reports missing ones", () => {
    const { nodes, missing } = selectNodes(page(), ["hero-1", "nope"]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.props.headline).toContain("langer Headline");
    expect(missing).toEqual(["nope"]);
  });
});
