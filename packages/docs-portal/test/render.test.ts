import { describe, expect, it } from "vitest";
import { renderPage, slugifyHeading } from "@senify/docs-portal";
import type { DocsPage } from "@senify/docs-portal";

function page(body: string): DocsPage {
  return {
    path: "/test",
    title: "Test",
    description: "Testseite",
    group: "Guides",
    order: 1,
    body,
  };
}

describe("markdown rendering", () => {
  it("renders markdown to html with heading ids and a toc", () => {
    const rendered = renderPage(
      page("## Erste Schritte\n\nText.\n\n### Details & Mehr\n\nNoch mehr."),
    );
    expect(rendered.html).toContain('<h2 id="erste-schritte">Erste Schritte</h2>');
    expect(rendered.html).toContain('<h3 id="details-mehr">');
    expect(rendered.toc).toEqual([
      { id: "erste-schritte", text: "Erste Schritte", depth: 2 },
      { id: "details-mehr", text: "Details & Mehr", depth: 3 },
    ]);
  });

  it("renders tables and code fences", () => {
    const rendered = renderPage(
      page("| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```json\n{}\n```"),
    );
    expect(rendered.html).toContain("<table>");
    expect(rendered.html).toContain("<pre>");
  });

  it("de-duplicates repeated heading ids", () => {
    const rendered = renderPage(page("## Theme\n\ntext\n\n## Theme\n\ntext"));
    expect(rendered.html).toContain('id="theme"');
    expect(rendered.html).toContain('id="theme-2"');
    expect(rendered.toc.map((entry) => entry.id)).toEqual(["theme", "theme-2"]);
  });

  it("transliterates umlauts in heading slugs", () => {
    expect(slugifyHeading("Größe & Präzision")).toBe("groesse-praezision");
    expect(slugifyHeading("Ärger über Öfen")).toBe("aerger-ueber-oefen");
  });
});