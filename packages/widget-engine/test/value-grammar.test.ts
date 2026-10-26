// The value grammar of the open style space (ADR-0005, ticket 07 stage 0).
//
// The style property space is open — but the value form is checked. This suite
// is the security gate: it must show that every known bypass of a substring
// denylist is caught, and that ordinary CSS keeps working. The attack vectors
// below are the reason the grammar exists; removing one of these tests means
// removing the replacement for the whitelist that used to be the only barrier.

import { describe, expect, it } from "vitest";
import {
  isSafeCssProperty,
  isSafeCssValue,
  normalizeCssText,
  parseCssValue,
  resolveCssEscapes,
  stripCssComments,
} from "../src/index.ts";

// ------------------------------------------------------------- normalization

describe("css value normalization", () => {
  it("resolves a hex escape before anything else", () => {
    expect(resolveCssEscapes("jav\\61 script")).toBe("javascript");
    expect(resolveCssEscapes("u\\72 l")).toBe("url");
    // Six hex digits are one escape; what follows is literal.
    expect(resolveCssEscapes("\\000061bc")).toBe("abc");
    // The space after a hex escape is part of the escape.
    expect(resolveCssEscapes("\\61 b")).toBe("ab");
    // `\61bc` is ONE escape (four hex digits), not `a` + `bc`.
    expect(resolveCssEscapes("\\61bc")).toBe(String.fromCodePoint(0x61bc));
  });

  it("removes comments and turns them into a token separator", () => {
    expect(stripCssComments("red/**/blue")).toBe("red blue");
    expect(stripCssComments("/* lead */red")).toBe(" red");
    expect(stripCssComments("a/*x*/b/*y*/c")).toBe("a b c");
  });

  it("collapses whitespace and keeps the rest", () => {
    expect(normalizeCssText("  calc( 100%  -  20px )\n")).toBe("calc( 100% - 20px )");
  });
});

// -------------------------------------------------------------- attack surface

describe("css value grammar rejects the bypasses of a denylist", () => {
  const rejected: [string, string][] = [
    ["url(javascript:alert(1))", "javascript: in an unquoted url"],
    ["url(jav\\61 script:alert(1))", "escaped javascript: in url"],
    ["u\\72 l(http://fremd.example/x.png)", "escaped url( with a foreign http host"],
    ["URL( JAVASCRIPT:alert(1) )", "uppercase scheme with spaces"],
    ["url('javascript:alert(1)')", "quoted javascript: url"],
    ["url(\"data:text/html,<script>alert(1)</script>\")", "data:text/html"],
    ["url(vbscript:msgbox(1))", "vbscript scheme"],
    ["url(http://fremd.example/x.png)", "plain http url"],
    ["url(//fremd.example/x.png)", "protocol-relative url"],
    ["red; } body { background: black", "block escape with a semicolon"],
    ["red} body{", "block escape with braces"],
    ["@import url(x)", "at-rule"],
    ["width: expression(alert(1))", "colon and expression()"],
    ["expression(alert(1))", "expression()"],
    ["red/**/;}/**/body{", "comment-split block escape"],
    ["url(java/**/script:alert(1))", "comment-split scheme"],
    ["red\\", "dangling escape"],
    ["rgb(0 0 0) !important", "important in a value"],
    ["\u0000red", "control character"],
    ["<script>", "angle brackets"],
    ["\"</style><script>alert(1)</script>\"", "a quoted string that closes the style element"],
    ["'a</STYLE>b'", "an upper-case closing tag inside a string"],
    ["\"\\3c /style>\"", "a hex-escaped < inside a string"],
    ["\"<!--\"", "an HTML comment opener inside a string"],
    ["red blue;", "trailing semicolon"],
    ["var(--x);", "trailing semicolon after a function"],
    ["url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)x", "trailing junk"],
    // ADR-0005: only raster images travel as a data URL. An SVG can carry a
    // script — it becomes an asset (cleaned up) instead of a style value.
    ["url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)", "SVG data URL"],
    ["url(data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>)", "SVG data URL"],
  ];

  it.each(rejected)("rejects %s (%s)", (value) => {
    expect(isSafeCssValue(value)).toBe(false);
    const parsed = parseCssValue(value);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problem.length).toBeGreaterThan(0);
  });

  it("keeps accepting a plain string without an angle bracket", () => {
    expect(isSafeCssValue("\"Hallo Welt\"")).toBe(true);
    expect(isSafeCssValue("'a > b'")).toBe(true);
  });

  it("rejects an unknown function", () => {
    expect(isSafeCssValue("evil(1)")).toBe(false);
    expect(isSafeCssValue("url(relative.png) hack(1)")).toBe(false);
  });

  it("rejects an unknown unit", () => {
    expect(isSafeCssValue("10furlong")).toBe(false);
    expect(isSafeCssValue("1.5widgets")).toBe(false);
  });

  it("rejects an invalid hex color", () => {
    expect(isSafeCssValue("#12")).toBe(false);
    expect(isSafeCssValue("#ggg")).toBe(false);
  });

  it("rejects an unterminated function or string", () => {
    expect(isSafeCssValue("calc(1px")).toBe(false);
    expect(isSafeCssValue("\"open")).toBe(false);
    expect(isSafeCssValue("url(a.png")).toBe(false);
  });

  it("rejects an empty value", () => {
    expect(isSafeCssValue("")).toBe(false);
    expect(isSafeCssValue("   ")).toBe(false);
  });
});

// ------------------------------------------------------------- passing values

describe("css value grammar lets ordinary CSS through", () => {
  const accepted: string[] = [
    // lengths, numbers, keywords
    "16px",
    "-2px",
    "0",
    "1.5rem",
    "50%",
    "100dvh",
    "0.3s",
    "90deg",
    "1fr 2fr",
    "auto",
    "flex",
    "border-box",
    "currentColor",
    "uppercase",
    // colors
    "#ff0000",
    "#f00",
    "#ff000080",
    "rgb(255, 0, 0)",
    "rgba(0, 0, 0, .5)",
    "hsl(210 40% 50%)",
    "oklch(0.7 0.1 200)",
    "color-mix(in srgb, red 40%, blue)",
    // functions
    "var(--x)",
    "var(--x, #fff)",
    "calc(50% - 4px)",
    "calc((100% - 20px) / 2)",
    "clamp(1rem, 2vw, 2rem)",
    "minmax(0, 1fr)",
    "repeat(3, minmax(0, 1fr))",
    "fit-content(20rem)",
    "translate3d(0, -2px, 0)",
    "rotate(5deg)",
    "scale(1.05)",
    "linear-gradient(135deg, #fff 0%, #000 100%)",
    "radial-gradient(circle at 50% 0%, #fff, #000)",
    "conic-gradient(from 90deg, red, blue)",
    "cubic-bezier(0.4, 0, 0.2, 1)",
    // The sampled form of a solved spring (CSS `linear()` easing). Framer hands
    // its effects to the browser with exactly this curve — measured 26.10.2026:
    // `linear(0, 0.0089, 0.0315, …)`. Without the function in the allow-list the
    // easing of every imported spring was dropped by the value grammar.
    "linear(0, 0.0089, 0.0315, 0.0628, 1)",
    "linear(0, 1)",
    "steps(4, end)",
    "blur(4px)",
    "drop-shadow(0 2px 4px rgba(0, 0, 0, .3))",
    "polygon(0 0, 100% 0, 50% 100%)",
    "inset(10px 20px)",
    "env(safe-area-inset-top)",
    "attr(data-label)",
    "counter(item)",
    "url(/assets/a.png)",
    "url(./a.png)",
    "url(../img/a.avif)",
    "url(#filter-id)",
    "url(https://cdn.example/a.avif)",
    "url('https://cdn.example/a.avif')",
    "url(data:image/png;base64,iVBORw0KGgo=)",
    // strings and lists
    "\"Helvetica Neue\", Arial, sans-serif",
    "'Open Sans', system-ui",
    "16px 24px",
    "0 2px 4px rgba(0, 0, 0, .3)",
    "opacity 0.3s ease, transform 0.3s ease",
    "1px solid #e5e5e5",
  ];

  it.each(accepted)("accepts %s", (value) => {
    expect(isSafeCssValue(value)).toBe(true);
    const parsed = parseCssValue(value);
    expect(parsed.ok).toBe(true);
  });

  it("returns the normalized form it validated", () => {
    const parsed = parseCssValue("URL( 'https://cdn.example/a.avif' )");
    expect(parsed).toEqual({ ok: true, value: "url('https://cdn.example/a.avif')" });
  });

  it("normalizes an escape before validating and emitting it", () => {
    // `\75 rl` resolves to `url`, so this is a plain relative url — and the
    // emitted text is the resolved form, not the original.
    const parsed = parseCssValue("\\75 rl(/a.png)");
    expect(parsed).toEqual({ ok: true, value: "url(/a.png)" });
  });

  it("normalizes function names and units to lower case", () => {
    const parsed = parseCssValue("CALC(100% - 2PX)");
    expect(parsed).toEqual({ ok: true, value: "calc(100% - 2px)" });
  });
});

// ------------------------------------------------------------ property names

describe("css property names", () => {
  it("accepts ordinary and vendor-prefixed names and custom properties", () => {
    for (const name of [
      "color",
      "border-radius",
      "background-color",
      "grid-template-columns",
      "scroll-snap-type",
      "clip-path",
      "-webkit-line-clamp",
      "--brand-color",
      "--x1",
    ]) {
      expect(isSafeCssProperty(name)).toBe(true);
    }
  });

  it("rejects names that would break out of the declaration", () => {
    for (const name of [
      "",
      " ",
      "co lor",
      "color:red",
      "color}",
      "color;",
      "color{",
      "--",
      "-",
      "1color",
      "color/*x*/",
      "url(x)",
    ]) {
      expect(isSafeCssProperty(name)).toBe(false);
    }
  });
});
