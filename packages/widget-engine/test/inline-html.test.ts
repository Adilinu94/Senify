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

describe("sanitizeInlineHtml mit einer Import-Klasse", () => {
  // The import writes one class on a word span so each word of a Framer headline
  // can play its own reveal (`senify-inline-derived-7`). The sanitizer is an
  // allow-list: only that shape passes, so a page cannot smuggle its own class
  // through it.
  it("keeps the import's word class and nothing else", () => {
    expect(sanitizeInlineHtml('<span class="senify-inline-derived-7">Run</span>')).toBe(
      '<span class="senify-inline-derived-7">Run</span>',
    );
    expect(sanitizeInlineHtml('<span class="evil">Run</span>')).toBe("<span>Run</span>");
    expect(sanitizeInlineHtml('<span class="senify-inline-x evil">Run</span>')).toBe("<span>Run</span>");
    expect(sanitizeInlineHtml('<span class="senify-inline-a b">Run</span>')).toBe("<span>Run</span>");
  });
});

describe("sanitizeInlineHtml mit einem style-Attribut", () => {
  it("behaelt eine Deklaration, die die Grammatik besteht", () => {
    expect(
      sanitizeInlineHtml('<span style="background-color:rgb(255, 249, 189);padding:0px 2px">Wort</span>'),
    ).toBe('<span style="background-color:rgb(255, 249, 189);padding:0px 2px">Wort</span>');
  });

  it("wirft die einzelne Deklaration weg, die die Grammatik verletzt", () => {
    // `expression` ist kein Wert der Grammatik, `color` darf bleiben.
    expect(sanitizeInlineHtml('<span style="color:red;width:expression(alert(1))">Wort</span>')).toBe(
      '<span style="color:red">Wort</span>',
    );
  });

  it("nimmt eine Property mit, die es nicht kennt (ADR-0005: offenes CSS)", () => {
    // Die Grammatik zählt die erlaubten Wert-Formen auf, nicht die bekannten
    // Property-Namen — eine Property, die es nicht gibt, ist kein Angriff.
    expect(sanitizeInlineHtml('<span style="color:red;evil-property:1">Wort</span>')).toBe(
      '<span style="color:red;evil-property:1">Wort</span>',
    );
  });

  it("lässt nichts zu, was eine Ressource laedt", () => {
    expect(sanitizeInlineHtml('<span style="background-image:url(https://x.de/a.png)">W</span>')).toBe(
      "<span>W</span>",
    );
    expect(sanitizeInlineHtml('<span style="background-image:var(--x, url(https://x.de/a.png))">W</span>')).toBe(
      "<span>W</span>",
    );
  });

  it("haelt eine eigene Variable (die Theme-Farben kommen als Variable)", () => {
    expect(sanitizeInlineHtml('<span style="color:var(--token-abc, rgb(0, 0, 0))">W</span>')).toBe(
      '<span style="color:var(--token-abc, rgb(0, 0, 0))">W</span>',
    );
  });

  it("haelt eine Semikolon-Liste in einem Wert", () => {
    expect(sanitizeInlineHtml(`<span style='font-family:"a;b", sans-serif'>W</span>`)).toContain("font-family:");
  });

  it("baut das Attribut ohne Style weg, wenn nichts uebrig bleibt", () => {
    expect(sanitizeInlineHtml('<span style="background-image:url(https://x.de/a.png)">W</span>')).not.toContain("style=");
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
