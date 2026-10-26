import { describe, expect, it } from "vitest";
import { sanitizeInlineHtml } from "../src/inline-html.ts";

// Der Sanitizer baute bisher JEDES Attribut neu auf und liess dabei nur `href`,
// `target`, `rel` und ein geprueftes `style` durch. Eine `class` fiel weg.
//
// Das war fuer den Import ein echter Verlust: ein gemessener Wort-Effekt haengt
// an der Klasse seines `<span>`, weil das Wort als Inline-Markup gerendert wird
// und keinen eigenen Knoten hat. Gemessen am 26.10.2026 auf
// `concerned-circumstances-187935`: die vier Woerter der Hauptueberschrift
// tragen Delay 0/50/100/150 ms — die Klasse war im Baum, das Markup verlor sie
// beim zweiten Sanitizer-Lauf (`markup.ts`), und alle vier Effekte liefen nicht.
//
// Die Regel bleibt eng: nur Namen aus Buchstaben, Ziffern, Bindestrich und
// Unterstrich, ein Name pro Token. Nichts, was eine zweite Deklaration oder
// einen Selektor einschmuggeln koennte.
describe("sanitizeInlineHtml: die Klasse eines Inline-Elements", () => {
  it("keeps a generated animation class on a span", () => {
    expect(sanitizeInlineHtml('<span class="fi-p1-waapi-3">Wort</span>')).toBe(
      '<span class="fi-p1-waapi-3">Wort</span>',
    );
  });

  it("keeps several allowed tokens and drops the rest", () => {
    expect(sanitizeInlineHtml('<span class="a b  c">x</span>')).toBe('<span class="a b c">x</span>');
    // A token with a character outside the shape goes; the others stay.
    expect(sanitizeInlineHtml('<span class="ok bad{color:red} ok2">x</span>')).toBe(
      '<span class="ok ok2">x</span>',
    );
  });

  it("does not let a class break out of the attribute", () => {
    // A quote and a second attribute must not survive. The class token with the
    // quote fails the name check and the whole fragment stays text.
    const out = sanitizeInlineHtml('<span class="a\\" onmouseover=\\"alert(1)">x</span>');
    expect(out).not.toContain("onmouseover");
    expect(out).not.toContain("alert");
  });

  it("accepts an input that IS markup, because that is its job", () => {
    // The sanitizer parses markup: a `<b>` in the INPUT is a `<b>` in the OUTPUT.
    // (This is why a class value must never be able to close its own quote -
    // that check is above. A bare `<b>` in the text is not an escape.)
    expect(sanitizeInlineHtml("Wort <b>fett</b>")).toBe("Wort <b>fett</b>");
  });

  it("keeps a class next to the allowed style attribute", () => {
    expect(sanitizeInlineHtml('<span class="fi-x" style="color:red">x</span>')).toBe(
      '<span class="fi-x" style="color:red">x</span>',
    );
  });

  it("drops a class on a tag that is not allowed at all", () => {
    // The tag itself goes (its text stays), so the class goes with it.
    expect(sanitizeInlineHtml('<div class="fi-x">text</div>')).toBe("text");
  });

  it("keeps the class of a link", () => {
    expect(sanitizeInlineHtml('<a href="/x" class="fi-y">Text</a>')).toBe(
      '<a href="/x" class="fi-y">Text</a>',
    );
  });
});
