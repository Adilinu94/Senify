import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@senify/registry";

describe("markdown rendering", () => {
  it("renders formatting, links and lists", () => {
    const html = renderMarkdown("Hallo **Welt**! Siehe [uns](/ueber-uns).\n\n- eins\n- zwei");
    expect(html).toContain("<strong>Welt</strong>");
    expect(html).toContain('<a href="/ueber-uns">uns</a>');
    expect(html).toContain("<li>eins</li>");
  });

  it("strips scripts and javascript urls", () => {
    const html = renderMarkdown(
      'Text <script>alert(1)</script> und [klick](javascript:alert(2)).',
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Text");
  });
});
