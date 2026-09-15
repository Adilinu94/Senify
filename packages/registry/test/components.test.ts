import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTree } from "@senify/registry/components";
import type { Node } from "@senify/section-sdk";

const ctx = { pagePaths: {}, assets: {} };

function render(nodes: Record<string, Node>, rootNodeId = "root"): string {
  return renderToStaticMarkup(
    SectionTree({ rootNodeId, nodes, ctx }),
  );
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

  it("renders faq as native details and marks unknown sections", () => {
    const html = render({
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
});
