import { describe, expect, it } from "vitest";
import { isSafeHref, sanitizeInlineHtml } from "../src/inline-html.ts";

describe("sanitizeInlineHtml", () => {
  it("keeps the inline vocabulary and rebuilds link attributes", () => {
    expect(sanitizeInlineHtml('Hallo <strong>Welt</strong> <a href="/x" onclick="evil()" target="_blank">hier</a>')).toBe(
      'Hallo <strong>Welt</strong> <a href="/x" target="_blank" rel="noopener noreferrer">hier</a>',
    );
  });

  it("drops script and style together with their content", () => {
    expect(sanitizeInlineHtml("a<script>alert(1)</script>b<style>p{}</style>c")).toBe("abc");
  });

  it("unwraps tags outside the list but keeps their text", () => {
    expect(sanitizeInlineHtml('<div class="x"><img src=x onerror=alert(1)>text</div>')).toBe("text");
  });

  it("removes javascript: and data: links but keeps the text", () => {
    expect(sanitizeInlineHtml('<a href="javascript:alert(1)">a</a>')).toBe("<a>a</a>");
    expect(sanitizeInlineHtml('<a href="java\tscript:alert(1)">a</a>')).toBe("<a>a</a>");
    expect(sanitizeInlineHtml('<a href="data:text/html,x">a</a>')).toBe("<a>a</a>");
  });

  it("escapes stray angle brackets and bare ampersands", () => {
    expect(sanitizeInlineHtml("1 < 2 & 3")).toBe("1 &lt; 2 &amp; 3");
    expect(sanitizeInlineHtml("Tom &amp; Jerry &#8217;s")).toBe("Tom &amp; Jerry &#8217;s");
  });

  it("closes what the input left open", () => {
    expect(sanitizeInlineHtml("<p>a <em>b")).toBe("<p>a <em>b</em></p>");
  });
});

describe("isSafeHref", () => {
  it("allows relative references, anchors and the four plain schemes", () => {
    for (const href of ["/a", "./a", "#kontakt", "https://x.de", "mailto:a@b.de", "tel:+49"]) {
      expect(isSafeHref(href)).toBe(true);
    }
    for (const href of ["javascript:1", "data:text/html,x", "vbscript:1", " java script:1", ""]) {
      expect(isSafeHref(href)).toBe(false);
    }
  });
});
