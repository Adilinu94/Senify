import { describe, expect, it } from "vitest";
import type { NodeTree } from "@senify/section-sdk";
import { defaultTheme } from "@senify/tokens";
import { hardGuardrailsForTree, runChecks, type Page, type Site } from "@senify/engine";

const site: Site = {
  id: "site-1",
  name: "Test",
  slug: "test",
  profile: "standard",
  themeId: null,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

function page(id: string, nodes: NodeTree["nodes"], path = "/"): Page {
  return {
    id,
    siteId: site.id,
    path,
    title: "Seite",
    meta: { description: "Beschreibung" },
    draft: { rootNodeId: "root", nodes: { root: { id: "root", type: "page", props: {} }, ...nodes } },
    draftVersion: 1,
    template: null,
    layoutId: null,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };
}

describe("hard guardrails", () => {
  it("allows one pin and two parallax layers", () => {
    const tree: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {} },
        a: { id: "a", type: "hero", props: {}, motion: { preset: "scrub-pin" } },
        b: { id: "b", type: "media", props: {}, motion: { preset: "parallax-subtle" } },
        c: { id: "c", type: "media", props: {}, motion: { preset: "parallax-subtle" } },
      },
    };
    expect(hardGuardrailsForTree(tree)).toEqual([]);
  });

  it("flags pin and parallax excess with a suggestion", () => {
    const pins: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {} },
        a: { id: "a", type: "hero", props: {}, motion: { preset: "scrub-pin" } },
        b: { id: "b", type: "features", props: {}, motion: { preset: "sticky-stack" } },
      },
    };
    const violations = hardGuardrailsForTree(pins);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.code).toBe("pin-excess");
    expect(violations[0]?.suggestion).toContain("one pin preset");

    const parallax: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {} },
        a: { id: "a", type: "media", props: {}, motion: { preset: "parallax-subtle" } },
        b: { id: "b", type: "media", props: {}, motion: { preset: "parallax-subtle" } },
        c: { id: "c", type: "media", props: {}, motion: { preset: "parallax-subtle" } },
      },
    };
    expect(hardGuardrailsForTree(parallax)[0]?.code).toBe("parallax-excess");
  });
});

describe("check pipeline", () => {
  it("flags broken internal links in submit and write stages", () => {
    const withLink = page("page-1", {
      a: {
        id: "a",
        type: "cta",
        props: { buttons: [{ label: "Los", link: { pageId: "missing" } }] },
      },
    });
    const report = runChecks({
      stage: "submit",
      pages: [withLink],
      site,
      theme: defaultTheme(),
    });
    const issue = report.hard.find((entry) => entry.code === "broken-link");
    expect(issue?.field).toContain("buttons[0]");
    expect(issue?.suggestion).toContain("existing page");
  });

  it("flags missing alt texts only when an asset is present", () => {
    const gallery = page("page-1", {
      a: {
        id: "a",
        type: "gallery",
        props: {
          items: [
            { asset: { assetId: "img-1" } },
            { asset: { assetId: "img-2" }, caption: "Mit Text" },
          ],
        },
      },
    });
    const report = runChecks({
      stage: "submit",
      pages: [gallery],
      site,
      theme: defaultTheme(),
    });
    const altIssues = report.hard.filter((entry) => entry.code === "missing-alt-text");
    expect(altIssues).toHaveLength(1);
    expect(altIssues[0]?.field).toBe("items[0].caption");
  });

  it("flags node-level contrast pairs below AA", () => {
    const contrast = page("page-1", {
      a: {
        id: "a",
        type: "hero",
        props: {
          background: { $token: "bg.base" },
          textColor: { $token: "bg.base" },
        },
      },
    });
    const report = runChecks({
      stage: "publish",
      pages: [contrast],
      site,
      theme: defaultTheme(),
    });
    expect(report.hard.some((entry) => entry.code === "contrast")).toBe(true);
  });

  it("reports soft notices without blocking", () => {
    const empty = page("page-1", {});
    empty.meta = {};
    const report = runChecks({
      stage: "submit",
      pages: [empty],
      site,
      theme: defaultTheme(),
    });
    expect(report.hard).toEqual([]);
    const codes = report.soft.map((entry) => entry.code);
    expect(codes).toContain("missing-description");
    expect(codes).toContain("empty-page");
  });
});
