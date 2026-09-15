import { describe, expect, it } from "vitest";
import { createRegistry } from "@senify/registry";
import {
  buildLlmsTxt,
  buildRobots,
  buildSitemap,
  collectJsonLd,
  pageToMarkdown,
  renderJsonLdScript,
} from "@senify/renderer";

const definitions = new Map(
  createRegistry()
    .list()
    .map((section) => [section.type, section]),
);

describe("aeo outputs", () => {
  it("extracts headings, paragraphs and bullets to markdown", () => {
    const md = pageToMarkdown(
      {
        path: "/",
        title: "Start",
        description: "Agentur für Websites.",
        tree: {
          rootNodeId: "root",
          nodes: {
            root: { id: "root", type: "page", props: {}, children: ["h", "f"] },
            h: {
              id: "h",
              type: "hero",
              props: { headline: "Hallo", sub: "Sub", ctas: [{ label: "Los", link: { url: "/x" } }] },
            },
            f: {
              id: "f",
              type: "faq",
              props: {
                title: "Fragen",
                items: [{ q: "Was?", a: "Das." }],
              },
            },
          },
        },
      },
      definitions,
    );
    expect(md.startsWith("# Start\n\nAgentur für Websites.\n")).toBe(true);
    expect(md).toContain("## Hallo");
    expect(md).toContain("## Fragen");
    expect(md).toContain("- Was? — Das.");
    expect(md).not.toContain("/x");
  });

  it("builds llms.txt, sitemap and robots", () => {
    const llms = buildLlmsTxt("Studio", "https://beispiel.de", [
      { path: "/", title: "Start", description: "Home." },
      { path: "/kontakt", title: "Kontakt" },
    ]);
    expect(llms).toContain("# Studio");
    expect(llms).toContain("- [Start](https://beispiel.de/index.md): Home.");
    expect(llms).toContain("- [Kontakt](https://beispiel.de/kontakt.md)");

    const sitemap = buildSitemap("https://beispiel.de", ["/", "/kontakt"]);
    expect(sitemap).toContain("<loc>https://beispiel.de/</loc>");
    expect(sitemap).toContain("<loc>https://beispiel.de/kontakt</loc>");

    const robots = buildRobots("https://beispiel.de");
    expect(robots).toContain("Sitemap: https://beispiel.de/sitemap.xml");
  });

  it("collects validated faq json-ld", () => {
    const { entities, warnings } = collectJsonLd({
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {}, children: ["f", "e"] },
        f: {
          id: "f",
          type: "faq",
          props: { items: [{ q: "Was?", a: "Das." }] },
        },
        e: { id: "e", type: "faq", props: { items: [] } },
      },
    });
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({ "@type": "FAQPage" });
    expect(warnings).toHaveLength(1);
    const script = renderJsonLdScript(entities);
    expect(script).toContain('type="application/ld+json"');
    expect(renderJsonLdScript([])).toBe("");
  });
});
