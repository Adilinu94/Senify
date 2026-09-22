import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SectionTree,
  type SectionContext,
} from "@senify/registry/components";
import type { Node, PropValue } from "@senify/section-sdk";

const ctx = { pagePaths: {}, assets: {} };

function render(nodes: Record<string, Node>, rootNodeId = "root"): string {
  return renderToStaticMarkup(
    SectionTree({ rootNodeId, nodes, ctx }),
  );
}

function renderWithContext(
  nodes: Record<string, Node>,
  context: SectionContext,
  rootNodeId = "root",
): string {
  return renderToStaticMarkup(SectionTree({ rootNodeId, nodes, ctx: context }));
}

function mediaNode(): Record<string, Node> {
  return {
    root: { id: "root", type: "page", props: {}, children: ["m"] },
    m: {
      id: "m",
      type: "media",
      variant: "image",
      props: { asset: { assetId: "a1" }, caption: "Motiv" },
    },
  };
}

describe("section components", () => {
  it("renders hero with h1 and ctas", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["h"] },
      h: {
        id: "h",
        type: "hero",
        variant: "centered",
        props: {
          headline: "Hallo Welt",
          ctas: [{ label: "Los", link: { url: "/start" } }],
        },
      },
    });
    expect(html).toContain("<h1");
    expect(html).toContain("Hallo Welt");
    expect(html).toContain('href="/start"');
    expect(html).toContain('data-section="hero"');
    expect(html).toContain('data-node-id="h"');
  });

  it("stamps the motion hooks (pending for reveals, data-motion for CSS effects)", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["h", "s"] },
      h: {
        id: "h",
        type: "hero",
        variant: "centered",
        props: { headline: "Hi" },
        motion: { preset: "fade-up" },
      },
      s: { id: "s", type: "stats", props: {}, motion: { preset: "hover-lift" } },
    });
    expect(html).toContain('data-motion-pending=""');
    expect(html).toContain('data-motion="hover-lift"');
    // A disabled spec stamps nothing at all.
    const off = render({
      root: { id: "root", type: "page", props: {}, children: ["s"] },
      s: {
        id: "s",
        type: "stats",
        props: {},
        motion: { preset: "hover-lift", enabled: false },
      },
    });
    expect(off).not.toContain("data-motion");
  });

  it("renders the 3D surface as island host with a poster and the tuned intensity", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["m"] },
      m: {
        id: "m",
        type: "media",
        variant: "3d-scene",
        props: { scene: "wave" },
        motion: { preset: "webgl-scene", intensity: 8 },
      },
    });
    expect(html).toContain('data-island="webgl-scene"');
    expect(html).toContain('data-scene="wave"');
    expect(html).toContain('data-intensity="8"');
    // The poster stands without JS: a CSS background behind the canvas.
    expect(html).toContain("radial-gradient");
    expect(html).toContain("<canvas");

    // A disabled spec keeps the poster and drops the island host.
    const off = render({
      root: { id: "root", type: "page", props: {}, children: ["m"] },
      m: {
        id: "m",
        type: "media",
        variant: "3d-scene",
        props: {},
        motion: { preset: "webgl-scene", enabled: false },
      },
    });
    expect(off).not.toContain("data-island");
    expect(off).toContain("<canvas");
  });

  it("lets the hero showcase-3d bring a surface only without a filled slot", () => {
    const bare = render({
      root: { id: "root", type: "page", props: {}, children: ["h"] },
      h: { id: "h", type: "hero", variant: "showcase-3d", props: { headline: "Hi" } },
    });
    expect(bare).toContain('data-island="webgl-scene"');

    // A filled visual slot carries its own media surface: the hero adds none.
    const filled = render({
      root: { id: "root", type: "page", props: {}, children: ["h"] },
      h: {
        id: "h",
        type: "hero",
        variant: "showcase-3d",
        props: { headline: "Hi" },
        slots: { visual: ["m"] },
      },
      m: { id: "m", type: "media", variant: "image", props: { asset: { assetId: "a1" } } },
    });
    expect(filled).not.toContain("data-island");
  });

  it("renders faq as native details and marks unknown sections", () => {    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["f", "x"] },
      f: {
        id: "f",
        type: "faq",
        props: { title: "Fragen", items: [{ q: "Was?", a: "Das." }] },
      },
      x: { id: "x", type: "nope", props: {} },
    });
    expect(html).toContain("<details");
    expect(html).toContain("Was?</summary>");
    expect(html).toContain('data-unknown-section="nope"');
  });

  it("marks broken page links instead of dropping them", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["c"] },
      c: {
        id: "c",
        type: "cta",
        props: {
          headline: "Los",
          buttons: [{ label: "Weiter", link: { pageId: "missing" } }],
        },
      },
    });
    expect(html).toContain('href="#"');
    expect(html).toContain("data-broken-link");
  });

  it("renders section style props as css variables", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["h"] },
      h: {
        id: "h",
        type: "hero",
        props: {
          headline: "Stil",
          background: { $token: "bg.inverted" },
          textColor: "#ffffff",
          paddingY: { $token: "space.16" },
        },
      },
    });
    expect(html).toContain("background:var(--bg-inverted)");
    expect(html).toContain("color:#ffffff");
    expect(html).toContain("--section-pad-y:var(--space-16)");
  });

  it("keeps the default markup when no style props are set", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["h"] },
      h: {
        id: "h",
        type: "hero",
        props: { headline: "Ohne Stil" },
      },
    });
    expect(html).toContain('data-section="hero"');
    expect(html).not.toContain("--section-pad-y");
    expect(html).not.toContain("background:");
  });

  it("renders part and layout props in cards and buttons", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["f", "c"] },
      f: {
        id: "f",
        type: "features",
        props: {
          title: "Features",
          items: [{ title: "Schnell", text: "Sehr schnell." }],
          columns: "4",
          gap: { $token: "space.8" },
          contentWidth: "wide",
          cardBackground: { $token: "bg.muted" },
          cardRadius: "12px",
          cardPadding: "2rem",
        },
      },
      c: {
        id: "c",
        type: "cta",
        props: {
          headline: "Los",
          buttons: [{ label: "Start", link: { url: "/start" } }],
          buttonBackground: "#123456",
        },
      },
    });
    expect(html).toContain("md:grid-cols-4");
    expect(html).toContain("gap:var(--space-8)");
    expect(html).toContain("max-w-7xl");
    expect(html).toContain("--card-bg:var(--bg-muted)");
    expect(html).toContain("background-color:var(--card-bg, transparent)");
    expect(html).toContain("--card-radius:12px");
    expect(html).toContain("--card-pad:2rem");
    expect(html).toContain("padding:var(--card-pad, 1.5rem)");
    expect(html).toContain("--button-bg:#123456");
    expect(html).toContain("background-color:var(--button-bg, var(--accent))");
  });

  it("builds a <picture> when the bake delivered variants", () => {
    const html = renderWithContext(mediaNode(), {
      pagePaths: {},
      assets: {
        a1: {
          src: "/assets/a1/motiv.png?v=1",
          width: 1024,
          height: 768,
          blurhash: "L6PZfSi_.AyE_3t7t7R",
          variants: [
            { format: "avif", width: 320, url: "/assets/a1/variants/320.avif?v=1" },
            { format: "webp", width: 320, url: "/assets/a1/variants/320.webp?v=1" },
          ],
        },
      },
    });
    expect(html).toContain("<picture>");
    expect(html).toContain('type="image/avif"');
    expect(html).toContain('type="image/webp"');
    expect(html).toMatch(/srcSet="\/assets\/a1\/variants\/320\.webp\?v=1 320w"/i);
    expect(html).toContain('sizes="100vw"');
    expect(html).toContain('width="1024"');
    expect(html).toContain('height="768"');
    expect(html).toContain("data-blurhash=");
  });

  it("falls back to a plain <img> without variants", () => {
    const html = renderWithContext(mediaNode(), {
      pagePaths: {},
      assets: { a1: "/assets/a1/motiv.png?v=1" },
    });
    expect(html).toContain("<img");
    expect(html).not.toContain("<picture");
    expect(html).not.toMatch(/srcset/i);
    expect(html).not.toContain("data-blurhash");
  });

  it("renders the outlet placeholder with its hint", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["o"] },
      o: { id: "o", type: "outlet", variant: "boxed", props: { hint: "Inhalt hier" } },
    });
    expect(html).toContain('data-section="outlet"');
    expect(html).toContain('data-outlet="empty"');
    expect(html).toContain("Inhalt hier");
  });

  it("renders a card with tag, title and cover", () => {
    const html = renderWithContext(
      {
        root: { id: "root", type: "page", props: {}, children: ["c"] },
        c: {
          id: "c",
          type: "card",
          variant: "image-top",
          props: { tag: "Technik", title: "Kartentitel", cover: { assetId: "a1" } },
        },
      },
      { pagePaths: {}, assets: { a1: "/assets/a1/motiv.png?v=1" } },
    );
    expect(html).toContain('data-section="card"');
    expect(html).toContain("Technik");
    expect(html).toContain("Kartentitel");
    expect(html).toContain("/assets/a1/motiv.png?v=1");
  });

  it("renders prefetched collection items and marks the empty list", () => {
    const listNode = (
      props: Record<string, PropValue>,
    ): Record<string, Node> => ({
      root: { id: "root", type: "page", props: {}, children: ["l"] },
      l: {
        id: "l",
        type: "collection-list",
        variant: "cards",
        props: {
          title: "Neues",
          emptyText: "Noch nichts da.",
          itemTemplate: { variant: "text", styleProps: {} },
          ...props,
        },
      },
    });
    const filled = render(
      listNode({
        items: [
          { variant: "text", props: { title: "Erster Artikel" } },
          { variant: "text", props: { title: "Zweiter Artikel" } },
        ],
      }),
    );
    expect(filled).toContain("Erster Artikel");
    expect(filled).toContain("Zweiter Artikel");
    expect(filled).toContain("data-list-item");
    expect(filled).not.toContain("Noch nichts da.");

    const empty = render(listNode({ items: [] }));
    expect(empty).toContain("Noch nichts da.");
    expect(empty).toContain("data-list-empty");
    expect(empty).not.toContain("data-list-item");

    const paged = render(
      listNode({
        items: [{ variant: "text", props: { title: "Seite zwei" } }],
        pageInfo: { current: 2, count: 3, urls: ["/blog", "/blog/seite/2", "/blog/seite/3"] },
      }),
    );
      expect(paged).toContain('href="/blog/seite/2"');
      expect(paged).toContain('aria-current="page"');
  });

  // Phase 1: a node of the widget catalog renders from the one markup
  // description (`widget-engine/src/markup.ts`), through the same SectionTree
  // the canvas and the bake share.
  it("renders a catalog primitive from the markup description", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["h"] },
      h: { id: "h", type: "heading", props: { level: "h1", text: "Katalog" } },
    });
    // The element comes from the catalog value, the class and the node markers
    // from the description — no section component is involved.
    expect(html).toContain("<h1");
    expect(html).toContain('class="w-heading __senify_scope_h"');
    expect(html).toContain('data-widget="heading"');
    expect(html).toContain('data-node-id="h"');
    expect(html).toContain("Katalog");
    expect(html).not.toContain("data-section");
  });

  // Ticket 21: the compiler anchors `class` rules as `[data-node-id].name` and
  // `scoped` rules as `[data-node-id].__senify_scope_<id>` (ADR-0005). Both
  // selector forms need the class attribute on the element that carries
  // `data-node-id` — in the canvas and in the release, which share this path.
  it("puts assigned classes and the scope class on the node root", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["h", "p"] },
      h: {
        id: "h",
        type: "hero",
        props: { headline: "Klasse" },
        classes: ["accent"],
      },
      p: {
        id: "p",
        type: "heading",
        props: { level: "h2", text: "Primitiv" },
        classes: ["accent"],
      },
    });
    // Section: component class, assigned class and generated scope class.
    expect(html).toMatch(/class="[^"]*accent[^"]*__senify_scope_h"/);
    // Catalog primitive: same contract on the described root.
    expect(html).toMatch(/class="w-heading accent __senify_scope_p"/);
  });

  it("carries the deterministic scope class without any assigned class", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["h"] },
      h: { id: "h", type: "hero", props: { headline: "Scope" } },
    });
    expect(html).toContain("__senify_scope_h");
  });

  it("lets a primitive container take the node's children", () => {
    const html = render({
      root: { id: "root", type: "page", props: {}, children: ["g"] },
      g: { id: "g", type: "grid", props: {}, children: ["t"] },
      t: { id: "t", type: "text", props: { text: "Zelle" } },
    });
    expect(html).toMatch(
      /<div class="w-grid __senify_scope_g"[^>]*><p class="w-text __senify_scope_t"[^>]*>Zelle<\/p>/,
    );
    expect(html).toContain('data-widget="grid"');
    expect(html).toContain('data-widget="text"');
  });

  it("keeps the section component where both vocabularies use the same name", () => {
    // "divider" and "embed" are catalog primitives *and* running sections. The
    // strangler decision (E2 in `.scratch/editor-v2-rebuild/map.md`) leaves the
    // name with the registry until the parity gate, so a legacy page is not
    // silently re-rendered and the old editor's inline anchors keep their hook.
    for (const type of ["divider", "embed"]) {
      const html = render({
        root: { id: "root", type: "page", props: {}, children: ["n"] },
        n: { id: "n", type, props: {} },
      });
      expect(html, type).toContain(`data-section="${type}"`);
      expect(html, type).not.toContain(`data-widget="${type}"`);
    }
  });
});
