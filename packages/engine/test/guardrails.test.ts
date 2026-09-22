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

  it("applies the site profile to the hard gate", () => {
    const tree: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {} },
        a: { id: "a", type: "hero", props: {}, motion: { preset: "fade-up", intensity: 9 } },
        b: { id: "b", type: "hero", props: {}, motion: { preset: "char-split" } },
      },
    };
    expect(hardGuardrailsForTree(tree, "clean").map((entry) => entry.code).sort()).toEqual([
      "profile-intensity-cap",
      "profile-preset",
    ]);
    expect(hardGuardrailsForTree(tree, "showcase")).toEqual([]);
    // With a profile the profile message is the pin gate (no duplicate).
    const pins: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {} },
        a: { id: "a", type: "hero", props: {}, motion: { preset: "scrub-pin" } },
        b: { id: "b", type: "features", props: {}, motion: { preset: "sticky-stack" } },
      },
    };
    const violations = hardGuardrailsForTree(pins, "standard");
    expect(violations.map((entry) => entry.code)).toEqual(["profile-pin"]);
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

  it("blocks profile violations at submit and publish", () => {
    const withMotion = page("page-1", {
      a: {
        id: "a",
        type: "hero",
        props: {},
        motion: { preset: "fade-up", intensity: 9 },
      },
      b: { id: "b", type: "features", props: {}, motion: { preset: "char-split" } },
    });
    const cleanSite: Site = { ...site, profile: "clean" };
    const report = runChecks({
      stage: "publish",
      pages: [withMotion],
      site: cleanSite,
      theme: defaultTheme(),
    });
    const codes = report.hard.map((entry) => entry.code);
    expect(codes).toContain("profile-intensity-cap");
    expect(codes).toContain("profile-preset");
    // The standard profile allows both presets once the dial fits.
    const moderate = page("page-1", {
      a: {
        id: "a",
        type: "hero",
        props: {},
        motion: { preset: "fade-up", intensity: 7 },
      },
      b: { id: "b", type: "features", props: {}, motion: { preset: "char-split" } },
    });
    const standard = runChecks({
      stage: "publish",
      pages: [moderate],
      site,
      theme: defaultTheme(),
    });
    expect(standard.hard.map((entry) => entry.code)).not.toContain("profile-intensity-cap");
    expect(standard.hard.map((entry) => entry.code)).not.toContain("profile-preset");
  });

  // Ticket 04, publish versions: an instance pinning an older definition
  // version would ship the newer definition silently — the release blocks with
  // the exact instance, the review only hints (site-wide over all pages).
  it("blocks publish on component drift and hints at submit", () => {
    const component = (instanceVersion: number) => {
      const p = page("page-1", {
        "def-card": {
          id: "def-card",
          type: "__component",
          props: { name: "Karte", version: 2 },
          children: ["def-head"],
        },
        "def-head": { id: "def-head", type: "block", props: { headline: "Titel" } },
        "inst-a": {
          id: "inst-a",
          type: "__component_instance",
          props: { componentId: "def-card", componentVersion: instanceVersion },
        },
      });
      // The tree walk starts at the root: the definition and the instance must
      // hang under it, or nothing is found.
      p.draft.nodes["root"]!.children = ["def-card", "inst-a"];
      return p;
    };

    const submit = runChecks({
      stage: "submit",
      pages: [component(1)],
      site,
      theme: defaultTheme(),
    });
    expect(submit.hard.some((entry) => entry.code === "component-drift")).toBe(false);
    expect(submit.soft.find((entry) => entry.code === "component-drift")?.nodeId).toBe("inst-a");

    const publish = runChecks({
      stage: "publish",
      pages: [component(1)],
      site,
      theme: defaultTheme(),
    });
    const blocked = publish.hard.find((entry) => entry.code === "component-drift");
    expect(blocked?.nodeId).toBe("inst-a");
    expect(blocked?.pageId).toBe("page-1");
    expect(blocked?.message).toContain("version 1");
    expect(blocked?.message).toContain("version 2");
    expect(blocked?.suggestion).toContain("update_component_instances");

    const resolved = runChecks({
      stage: "publish",
      pages: [component(2)],
      site,
      theme: defaultTheme(),
    });
    expect(resolved.hard.some((entry) => entry.code === "component-drift")).toBe(false);
  });
});
