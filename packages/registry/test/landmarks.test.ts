import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Node } from "@senify/section-sdk";
import { SectionTree, mainRange, priorityImageNodeId, type SectionContext } from "../src/components/index.ts";

function node(id: string, type: string, props: Record<string, unknown> = {}, extra: Partial<Node> = {}): Node {
  return { id, type, props, children: [], ...extra } as unknown as Node;
}

function tree(children: Node[]): { rootNodeId: string; nodes: Record<string, Node> } {
  const root = node("root0000", "root", {}, { children: children.map((child) => child.id) });
  return {
    rootNodeId: root.id,
    nodes: Object.fromEntries([root, ...children].map((entry) => [entry.id, entry])),
  };
}

const PAGE = [
  node("nav00000", "navbar", {
    logo: "Studio",
    links: [
      { label: "Start", link: { pageId: "p-home" } },
      { label: "Kontakt", link: { pageId: "p-contact" } },
      { label: "Extern", link: { url: "https://example.com/kontakt", newTab: true } },
    ],
  }),
  node("hero0000", "hero", { headline: "Hallo" }),
  node("text0000", "content", { heading: "Text" }),
  node("foot0000", "footer", { columns: [] }),
];

const CTX: SectionContext = { pagePaths: { "p-home": "/", "p-contact": "/kontakt" }, assets: {} };

function html(children: Node[], ctx = CTX, landmarks = true): string {
  const { rootNodeId, nodes } = tree(children);
  return renderToStaticMarkup(createElement(SectionTree, { rootNodeId, nodes, ctx, landmarks }));
}

describe("page landmarks", () => {
  it("wraps the content between navbar and footer in one <main id=main>", () => {
    const out = html(PAGE);
    expect(out.match(/<main /g)).toHaveLength(1);
    const main = out.slice(out.indexOf("<main "), out.indexOf("</main>"));
    expect(main).toContain('data-section="hero"');
    expect(main).toContain('data-section="content"');
    expect(main).not.toContain('data-section="navbar"');
    expect(main).not.toContain('data-section="footer"');
    expect(out).toContain('id="main"');
  });

  it("gives the page chrome its landmark role without changing the element", () => {
    const out = html(PAGE);
    expect(out).toMatch(/<section role="banner" data-section="navbar"/);
    expect(out).toMatch(/<section role="contentinfo" data-section="footer"/);
  });

  it("puts the skip link in front of everything, in the document language", () => {
    expect(html(PAGE).startsWith('<a href="#main"')).toBe(true);
    expect(html(PAGE)).toContain("Zum Inhalt springen");
    expect(html(PAGE, { ...CTX, lang: "en" })).toContain("Skip to content");
  });

  it("leaves the canvas structure flat (no main, no skip link)", () => {
    const out = html(PAGE, CTX, false);
    expect(out).not.toContain("<main");
    expect(out).not.toContain('href="#main"');
  });

  it("adds no main for a page that is only chrome", () => {
    const out = html([PAGE[0] as Node, PAGE[3] as Node]);
    expect(out).not.toContain("<main");
    expect(out).not.toContain('href="#main"');
  });

  it("mainRange keeps a floating cookie notice outside the content", () => {
    const children = [
      node("nav00000", "navbar"),
      node("hero0000", "hero"),
      node("cook0000", "cookie-note"),
      node("foot0000", "footer"),
    ];
    const { rootNodeId, nodes } = tree(children);
    const ids = nodes[rootNodeId]?.children ?? [];
    expect(mainRange(ids, nodes)).toEqual({ start: 1, end: 1 });
  });
});

describe("aria-current", () => {
  it("marks the navigation link to the current page, and only that one", () => {
    const out = html(PAGE, { ...CTX, currentPath: "/kontakt" });
    const links = [...out.matchAll(/<a [^>]*>(Start|Kontakt|Extern)<\/a>/g)];
    const current = links.filter((match) => match[0].includes('aria-current="page"')).map((match) => match[1]);
    // Desktop list and mobile panel both carry the mark.
    expect(current).toEqual(["Kontakt", "Kontakt"]);
  });

  it("treats a trailing slash like the same page and never marks an external URL", () => {
    const out = html(PAGE, { ...CTX, currentPath: "/kontakt/" });
    expect(out.match(/aria-current="page"/g)).toHaveLength(2);
    expect(out).not.toMatch(/example\.com\/kontakt"[^>]*aria-current/);
  });

  it("marks nothing without a current path (the canvas)", () => {
    expect(html(PAGE, CTX)).not.toContain("aria-current");
  });
});

describe("image loading hints", () => {
  const asset = { assetId: "a1" };
  const ctx: SectionContext = {
    pagePaths: {},
    assets: { a1: { src: "/assets/a1.jpg", width: 1600, height: 900 }, a2: { src: "/assets/a2.jpg", width: 800, height: 600 } },
  };

  it("loads the first image of the first screenful eagerly with high priority", () => {
    const out = html(
      [
        node("nav00000", "navbar"),
        node("med00000", "media", { asset }),
        node("med00001", "media", { asset: { assetId: "a2" } }),
      ],
      ctx,
    );
    const imgs = [...out.matchAll(/<img [^>]*>/g)].map((match) => match[0]);
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toContain('loading="eager"');
    expect(imgs[0]).toContain('fetchPriority="high"');
    expect(imgs[1]).toContain('loading="lazy"');
    expect(imgs[1]).toContain('decoding="async"');
    expect(imgs[1]).not.toContain("fetchPriority");
  });

  it("does not prioritize an image below the first screenful", () => {
    const { rootNodeId, nodes } = tree([
      node("hero0000", "hero"),
      node("text0000", "content"),
      node("med00000", "media", { asset }),
    ]);
    expect(priorityImageNodeId(nodes[rootNodeId]?.children ?? [], nodes)).toBeUndefined();
  });

  it("finds an image primitive inside a hero slot and keeps width and height", () => {
    const hero = node("hero0000", "hero", { headline: "Hi" }, { slots: { visual: ["img00000"] } });
    const image = node("img00000", "image", { asset: "a1", alt: "Team" });
    const { rootNodeId, nodes } = tree([hero]);
    nodes[image.id] = image;
    expect(priorityImageNodeId(nodes[rootNodeId]?.children ?? [], nodes)).toBe("img00000");
    const out = renderToStaticMarkup(createElement(SectionTree, { rootNodeId, nodes, ctx, landmarks: true }));
    expect(out).toMatch(/<img [^>]*loading="eager"[^>]*>/);
    expect(out).toContain('width="1600"');
    expect(out).toContain('height="900"');
  });

  it("never prioritizes a video or 3D media section", () => {
    const { rootNodeId, nodes } = tree([node("med00000", "media", { asset }, { variant: "video" })]);
    expect(priorityImageNodeId(nodes[rootNodeId]?.children ?? [], nodes)).toBeUndefined();
  });
});
