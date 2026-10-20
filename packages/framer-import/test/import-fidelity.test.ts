import { describe, expect, it } from "vitest";
import { captureHtml, mapDocument, normalize, ruleScopeOf } from "../src/index.ts";
import { expandBox, splitDeclarations, splitSpaces } from "../src/css-util.ts";

const page = (body: string, css = "", head = ""): string =>
  `<html lang="en"><head><title>t</title>${head}<style>${css}</style></head><body><div id="main" data-framer-hydrate-v2>${body}</div></body></html>`;

function run(html: string) {
  const document = captureHtml({ html });
  const normalized = normalize(document, { mode: "fidelity" });
  const mapped = mapDocument(document, normalized.rules);
  const nodes = Object.values(mapped.document.nodes).filter((node) => node.primitive !== "root");
  return { document, normalized, mapped, nodes };
}

describe("css-util", () => {
  it("does not split declarations inside url() or quotes", () => {
    expect(splitDeclarations("a:1;background:url(data:image/png;base64,AAA);b:'x;y'")).toEqual([
      "a:1",
      "background:url(data:image/png;base64,AAA)",
      "b:'x;y'",
    ]);
  });

  it("keeps calc() and var() fallbacks whole in box shorthands", () => {
    expect(splitSpaces("calc(10px + 2%) var(--p, 8px 4px)")).toEqual(["calc(10px + 2%)", "var(--p, 8px 4px)"]);
    expect(expandBox("1px 2px")).toEqual({ top: "1px", right: "2px", bottom: "1px", left: "2px" });
  });
});

describe("capture fidelity", () => {
  it("keeps the page language and the SEO head", () => {
    const html = page(
      "<p>x</p>",
      "",
      '<meta name="description" content="Beschreibung"><meta property="og:title" content="OG Titel"><meta property="og:image" content="/og.png">',
    );
    const { document, mapped } = run(html);
    const first = document.pages[0];
    expect(first?.lang).toBe("en");
    expect(first?.description).toBe("Beschreibung");
    expect(first?.meta).toEqual({ ogTitle: "OG Titel", ogImage: "/og.png" });
    expect(mapped.document.nodes["root"]?.props["lang"]).toBe("en");
  });

  it("maps a linked wrapper to a linked frame that keeps its children", () => {
    const { nodes } = run(page('<a href="/projekt" target="_blank"><div><span>Karte</span></div></a>'));
    const frame = nodes.find((node) => node.primitive === "frame" && node.props["link"] === "/projekt");
    expect(frame).toBeDefined();
    expect(frame?.props["newTab"]).toBe(true);
    expect(frame?.children?.length).toBeGreaterThan(0);
  });

  it("reports a linked wrapper as an info: the target and the children are kept", () => {
    const { mapped } = run(page('<a href="/projekt"><div><span>Karte</span></div></a>'));
    const finding = mapped.findings.find((entry) => entry.message.startsWith("Link-Wrapper"));
    expect(finding?.severity).toBe("info");
    expect(finding?.message).toContain("/projekt");
  });

  it("keeps image alt text", () => {
    const { nodes } = run(page('<img src="a.png" alt="Logo Acme" width="100" height="50">'));
    expect(nodes.find((node) => node.primitive === "image")?.props["alt"]).toBe("Logo Acme");
  });

  it("keeps the spaces of a text whose words sit in separate spans", () => {
    // Framer's word-by-word reveal puts every word and every space in a span of
    // its own. Without the space spans the words run together and the text can
    // no longer wrap.
    const { nodes } = run(
      page('<div data-framer-component-type="RichTextContainer"><p><span>Wir</span><span> </span><span>sind</span></p></div>'),
    );
    const body = nodes.find((node) => String(node.props["html"] ?? "").includes("Wir"));
    expect(String(body?.props["html"])).toContain("<span>Wir</span><span> </span><span>sind</span>");
  });

  it("keeps React's fragment markers out of the text of a paragraph with a link", () => {
    // Framer's server markup wraps a link in `<!--$-->…<!--/$-->`. Taken as part of the
    // inner markup they came out as the visible text `<!--$-->` (the footer credit of
    // easier-train, which then wrapped into a second line).
    const { nodes } = run(
      page(
        '<div data-framer-component-type="RichTextContainer"><p>Reserved by <!--$--><a href="https://x.com/n" target="_blank">Nivrit</a><!--/$--></p></div>',
      ),
    );
    const html = nodes.map((node) => String(node.props["html"] ?? "")).join("|");
    expect(html).toContain("Reserved by");
    expect(html).toContain(">Nivrit</a>");
    expect(html).not.toContain("<!--");
    expect(html).not.toContain("&lt;!--");
  });

  it("keeps an empty line between two paragraphs", () => {
    // Framer writes a blank line as a paragraph that holds only a `<br>`. Without the
    // `<br>` the paragraph is empty, has no height, and the text after it moved up by
    // one line (easier-train: 25 px on every page below the first text).
    const { nodes } = run(
      page(
        '<div data-framer-component-type="RichTextContainer"><p>Erster</p><p><br class="framer-text trailing-break"></p><p>Dritter</p></div>',
      ),
    );
    const body = nodes.find((node) => String(node.props["html"] ?? "").includes("Erster"));
    expect(String(body?.props["html"])).toBe("<p>Erster</p><p><br></p><p>Dritter</p>");
  });

  it("keeps the text between inline elements", () => {
    const { nodes } = run(page('<div data-framer-component-type="RichTextContainer"><p>Hallo <strong>fett</strong> Welt</p></div>'));
    const html = nodes.map((node) => String(node.props["html"] ?? "")).join("|");
    expect(html).toContain("Hallo");
    expect(html).toContain("<strong>fett</strong>");
    expect(html).toContain("Welt");
  });

  it("never turns <style> or <script> content into page text", () => {
    const { nodes } = run(page("<style>html body{background:red}</style><script>var a=1</script><p>sichtbar</p>"));
    const text = nodes.map((node) => String(node.props["text"] ?? node.props["html"] ?? "")).join("|");
    expect(text).toContain("sichtbar");
    expect(text).not.toContain("background");
    expect(text).not.toContain("var a");
  });

  it("keeps the anchor id on a frame", () => {
    const { nodes } = run(page('<section id="kontakt"><h2>Hi</h2></section>'));
    expect(nodes.find((node) => node.props["anchorId"] === "kontakt")?.primitive).toBe("frame");
  });

  it("keeps a hover rule as the rule's hover state and out of the base style", () => {
    const { nodes, mapped } = run(
      page('<div class="btn">Go</div>', ".btn{background-color:#111}.btn:hover{background-color:#f00;color:#fff}"),
    );
    const colors = nodes.map((node) => String(node.props["backgroundColor"] ?? ""));
    expect(colors).toContain("#111");
    expect(colors).not.toContain("#f00");
    const rule = mapped.rules.find((candidate) => candidate.styles["backgroundColor"] === "#111");
    expect(rule?.states?.hover).toEqual({ backgroundColor: "#f00", color: "#fff" });
  });

  it("maps focus-visible to the focus state and :active to active", () => {
    const { mapped } = run(
      page('<a class="l" href="/x">L</a>', ".l{color:#111}.l:focus-visible{outline:2px solid #00f}.l:active{color:#999}"),
    );
    const rule = mapped.rules.find((candidate) => candidate.styles["color"] === "#111");
    expect(rule?.states?.focus).toEqual({ outline: "2px solid #00f" });
    expect(rule?.states?.active).toEqual({ color: "#999" });
  });

  it("reports a state of ANOTHER element (.card:hover .title) instead of applying it to this one", () => {
    const { nodes, document } = run(
      page('<div class="card"><p class="title">T</p></div>', ".card .title{color:#111}.card:hover .title{color:#f00}"),
    );
    expect(nodes.map((node) => String(node.props["color"] ?? ""))).not.toContain("#f00");
    expect(document.findings.some((finding) => finding.message.includes("Pseudo-Zustand"))).toBe(true);
  });

  it("resolves var() inside a hover state like in the base style", () => {
    const { mapped } = run(
      page('<div class="b">x</div>', ".b{--c:#123;background-color:#111}.b:hover{background-color:var(--c,#000)}"),
    );
    const rule = mapped.rules.find((candidate) => candidate.styles["backgroundColor"] === "#111");
    expect(rule?.states?.hover).toEqual({ backgroundColor: "#123" });
  });

  it("applies class rules on a large stylesheet (no size limit)", () => {
    const filler = Array.from({ length: 4000 }, (_, index) => `.x${index}{color:#${(index % 4096).toString(16).padStart(3, "0")}}`).join("");
    const { nodes } = run(page('<div class="t">x</div>', `${filler}.t{background-color:#abc}`));
    expect(nodes.map((node) => node.props["backgroundColor"])).toContain("#abc");
  });

  it("reads Framer's phone range with a unitless zero, `(max-width:809px) and (min-width:0)`", () => {
    const { document } = run(page('<div class="m">x</div>', ".m{color:red}@media (max-width:809px) and (min-width:0){.m{color:blue}}"));
    const states = document.pages[0]?.root.children.find((node) => node.baseClasses.includes("m"))?.states ?? [];
    const colorOf = (device: string) => states.find((state) => state.device === device)?.visual["color"];
    expect(colorOf("desktop")).toBe("red");
    expect(colorOf("mobile")).toBe("blue");
  });

  it("lets `!important` beat the inline style on its devices and drops the marker from the value", () => {
    const { document } = run(page('<div class="w" style="display:flex">x</div>', "@media (min-width:810px){.w{display:none!important}}"));
    const states = document.pages[0]?.root.children.find((node) => node.baseClasses.includes("w"))?.states ?? [];
    const displayOf = (device: string) => states.find((state) => state.device === device)?.visual["display"];
    expect(displayOf("desktop")).toBe("none");
    // The query does not reach mobile: the element keeps its inline `flex`.
    expect(displayOf("mobile")).toBe("flex");
  });

  it("applies a min-width query to tablet and desktop, never to mobile", () => {
    const { document } = run(page('<div class="m">x</div>', ".m{color:red}@media (min-width:810px){.m{color:blue}}"));
    const states = document.pages[0]?.root.children.find((node) => node.baseClasses.includes("m"))?.states ?? [];
    const colorOf = (device: string) => states.find((state) => state.device === device)?.visual["color"];
    expect(colorOf("desktop")).toBe("blue");
    // Tablet equals desktop, so it has no state of its own and inherits blue.
    expect(states.some((state) => state.device === "tablet")).toBe(false);
    expect(colorOf("mobile")).toBe("red");
  });

  it("says the desktop value again for mobile when only the tablet range changes it", () => {
    // Framer's tablet query stops at 1199 px, so a phone keeps the desktop value.
    // Senify's tablet override is a `max-width` rule that mobile inherits, so
    // without a `_mobile` value the phone would show the tablet's colour (the
    // hero kept the tablet's 800 px minimum height and ended 44 px short).
    const { nodes } = run(
      page('<div class="m">x</div>', ".m{color:red}@media (min-width:810px) and (max-width:1199.98px){.m{color:blue}}"),
    );
    const node = nodes.find((candidate) => candidate.props["text"] === "x");
    expect(node?.props["color"]).toBe("red");
    expect(node?.props["color_tablet"]).toBe("blue");
    expect(node?.props["color_mobile"]).toBe("red");
  });

  it("takes back a value that only the tablet range sets, for the phone", () => {
    // `max-width:80%` exists in Framer's tablet range only: desktop and phone never
    // set it, so there is no desktop value to say again. Without a `_mobile` value the
    // phone kept the tablet's 80 % (a paragraph on easier-train was 280 px wide
    // instead of 350 px and wrapped into one more line).
    const { nodes } = run(
      page('<div class="m">x</div>', ".m{width:100%}@media (min-width:810px) and (max-width:1199.98px){.m{max-width:80%}}"),
    );
    const node = nodes.find((candidate) => candidate.props["text"] === "x");
    expect(node?.props["maxWidth"]).toBeUndefined();
    expect(node?.props["maxWidth_tablet"]).toBe("80%");
    expect(node?.props["maxWidth_mobile"]).toBe("unset");
  });

  it("lets an inline width beat the width a device variant's rule sets", () => {
    // Framer's footer copy for the phone has `width:350px` in the sheet and
    // `style="width:100%"` on the element; the inline style wins in the browser.
    // The capture keeps the inline width in `box`, apart from the rules' values in
    // `visual`, so the rules' widths came back as `width_tablet` / `width_mobile`:
    // the footer was 40 px too narrow on the phone and its credit line wrapped.
    const { nodes } = run(
      page(
        '<div class="f" style="width:100%">x</div>',
        ".f{width:810px}@media (max-width:809.98px){.f{width:350px}}@media (min-width:810px) and (max-width:1199.98px){.f{width:600px}}",
      ),
    );
    const node = nodes.find((candidate) => candidate.props["text"] === "x");
    expect(node?.props["width"]).toBe("100%");
    expect(node?.props["width_tablet"]).toBeUndefined();
    expect(node?.props["width_mobile"]).toBeUndefined();
  });

  it("lets an `!important` rule beat the inline width on its device", () => {
    const { nodes } = run(
      page('<div class="f" style="width:100%">x</div>', "@media (max-width:809.98px){.f{width:350px!important}}"),
    );
    const node = nodes.find((candidate) => candidate.props["text"] === "x");
    expect(node?.props["width"]).toBe("100%");
    expect(node?.props["width_mobile"]).toBe("350px");
  });

  it("keeps the line clamp of a text that is cut after two lines", () => {
    // Framer clamps a card subtitle with `display:-webkit-box` plus
    // `-webkit-line-clamp:2` and `-webkit-box-orient:vertical`. Only `display` came
    // through, so the import showed all three lines (easier-train blog cards: 28 px
    // too high each, the page 107 px too high on the phone).
    const { nodes } = run(
      page(
        '<div class="m">x</div>',
        ".m{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:clip}",
      ),
    );
    const node = nodes.find((candidate) => candidate.props["text"] === "x");
    expect(node?.props["WebkitLineClamp"]).toBe("2");
    expect(node?.props["WebkitBoxOrient"]).toBe("vertical");
  });

  it("flattens an rgba gradient to a valid color", () => {
    const { normalized } = {
      normalized: normalize(
        captureHtml({ html: page('<div style="background: linear-gradient(180deg, rgba(0,0,0,0.5), #fff)"></div>') }),
      ),
    };
    const colors = normalized.rules.map((rule) => rule.declarations["background"] ?? "").filter(Boolean);
    expect(colors).toContain("rgba(0,0,0,0.5)");
  });

  it("strips the SSR start state of reveals instead of hiding the element", () => {
    const { nodes } = run(page('<div data-framer-appear-id="a1" style="opacity:0.001;transform:translateY(12px)">Text</div><div style="will-change:transform;opacity:0;transform:translateY(40px)">Reveal</div>'));
    for (const node of nodes) {
      expect(node.props["opacity"]).toBeUndefined();
      expect(node.props["transform"]).toBeUndefined();
    }
  });
});

describe("elements that are hidden on purpose", () => {
  it("keeps a plain `opacity:0` as the look: a closed menu, a collapsed answer", () => {
    // The phone header of stupendous-football lists its links with
    // `style="opacity:0"`: the menu is closed. Read as a start state, the links
    // showed above the hero. Only an appear id or a moving transform marks a
    // start state (see the reveals above); `transform:none` moves nothing.
    const { nodes } = run(
      page('<div style="opacity:0"><p>Menue</p></div><div style="opacity:0;transform:none"><p>Antwort</p></div><div style="opacity:0;transform:translateY(40px)"><p>Reveal</p></div>'),
    );
    const hidden = nodes.filter((node) => node.props["opacity"] === "0");
    expect(hidden).toHaveLength(2);
    expect(nodes.some((node) => String(node.props["transform"] ?? "").includes("translate"))).toBe(false);
  });
});

describe("deeply nested var() fallbacks", () => {
  it("resolves a three-level fallback chain down to the first defined property", () => {
    const { nodes } = run(
      page(
        '<p class="t">Text</p>',
        '.t{--framer-font-family:"Manrope",sans-serif;font-family:var(--framer-link-hover-font-family,var(--framer-link-font-family,var(--framer-font-family,"Inter",sans-serif)))}',
      ),
    );
    expect(nodes.find((node) => node.props["text"] === "Text")?.props["fontFamily"]).toBe('"Manrope",sans-serif');
  });

  it("falls to the last literal fallback when nothing in the chain is defined", () => {
    const { nodes } = run(
      page('<p class="t">Text</p>', '.t{font-family:var(--a,var(--b,var(--c,"Inter",sans-serif)))}'),
    );
    expect(nodes.find((node) => node.props["text"] === "Text")?.props["fontFamily"]).toBe('"Inter",sans-serif');
  });

  it("keeps a quoted comma and parenthesis inside a fallback intact", () => {
    const { nodes } = run(
      page('<p class="t">Text</p>', '.t{font-family:var(--a,"Foo, (Bar)",serif)}'),
    );
    expect(nodes.find((node) => node.props["text"] === "Text")?.props["fontFamily"]).toBe('"Foo, (Bar)",serif');
  });

  it("does not touch an identifier that merely ends in var(", () => {
    const { nodes } = run(page('<p class="t">Text</p>', ".t{content:\"invar(x)\";color:#111}"));
    expect(nodes.find((node) => node.props["text"] === "Text")?.props["color"]).toBe("#111");
  });
});

describe("links inside paragraphs", () => {
  it("keeps a link that is the only content of a paragraph", () => {
    const { nodes } = run(
      page(
        '<div data-framer-component-type="RichTextContainer"><p class="framer-text"><a class="framer-text" href="tel:(408) 555-0382">(408) 555-0382</a></p></div>',
      ),
    );
    const html = nodes.map((node) => String(node.props["html"] ?? "")).join("|");
    expect(html).toContain('<a href="tel:(408) 555-0382">(408) 555-0382</a>');
  });

  it("keeps nested inline elements and a new-tab target", () => {
    const { nodes } = run(
      page(
        '<div data-framer-component-type="RichTextContainer"><p class="framer-text"><span><a href="https://x.de" target="_blank"><strong>Fett</strong></a></span></p></div>',
      ),
    );
    const html = nodes.map((node) => String(node.props["html"] ?? "")).join("|");
    expect(html).toContain('<a href="https://x.de" target="_blank" rel="noopener noreferrer"><strong>Fett</strong></a>');
  });
});

describe("typography through custom properties", () => {
  const preset = (css: string, body: string) => page(body, css);

  it("resolves var() against the preset class so text keeps its size and colour", () => {
    const { nodes } = run(
      preset(
        ".framer-P .framer-styles-preset-1{--framer-font-size:92px;--framer-text-color:#fff}.fx{font-size:var(--framer-font-size,16px);color:var(--framer-text-color,#000)}",
        '<h1 class="framer-styles-preset-1 fx">Gross</h1>',
      ).replace('id="main" data-framer-hydrate-v2', 'id="main" data-framer-hydrate-v2 class="framer-P"'),
    );
    const heading = nodes.find((node) => node.props["text"] === "Gross");
    expect(heading?.props["fontSize"]).toBe("92px");
    expect(heading?.props["color"]).toBe("#fff");
  });

  it("falls back to the var() default when nothing defines the property", () => {
    const { nodes } = run(preset(".fx{font-size:var(--framer-font-size,18px)}", '<p class="fx">Klein</p>'));
    expect(nodes.find((node) => node.props["text"] === "Klein")?.props["fontSize"]).toBe("18px");
  });

  it("keeps the theme token variables as var() for the theme mapping", () => {
    const { nodes } = run(
      preset(".fx{color:var(--token-1f29b48f-b9fc-4fd7-ae5c-31f85ed3bce9,#254139)}", '<p class="fx">Marke</p>'),
    );
    expect(String(nodes.find((node) => node.props["text"] === "Marke")?.props["color"])).toContain("--token-");
  });

  it("gives a lifted heading the typography of the heading, not the container's defaults", () => {
    const { nodes } = run(
      preset(
        ".box{font-size:16px;color:#000}.hd{font-size:64px;color:#fff;line-height:1.1}",
        '<div class="box" data-framer-component-type="RichTextContainer"><h2 class="hd">Titel</h2></div>',
      ),
    );
    const heading = nodes.find((node) => node.primitive === "heading");
    expect(heading?.props["text"]).toBe("Titel");
    expect(heading?.props["fontSize"]).toBe("64px");
    expect(heading?.props["color"]).toBe("#fff");
  });

  it("keeps what the text inherits when the words of a heading sit in spans", () => {
    // Framer splits a heading into one span per word or letter. The spans carry
    // no rule of their own; their size and colour come down from the `h1`. The
    // lifted heading must take the inherited values, not the empty ones of the
    // first span.
    const { nodes } = run(
      preset(
        ".hd{font-size:64px;color:#fff;font-weight:500}.in{letter-spacing:-2px}",
        '<div data-framer-component-type="RichTextContainer"><h1 class="hd"><span style="white-space:nowrap"><span class="in" style="display:inline-block">A</span><span>b</span></span> <span style="white-space:nowrap"><span>c</span></span></h1></div>',
      ),
    );
    const lifted = nodes.find((node) => String(node.props["html"] ?? "").includes("<h1"));
    expect(lifted).toBeDefined();
    expect(lifted?.props["fontSize"]).toBe("64px");
    expect(lifted?.props["color"]).toBe("#fff");
    expect(lifted?.props["fontWeight"]).toBe("500");
    // What only a part of the text sets stays out: the nowrap of one word would
    // keep the whole heading from wrapping, a letter's spacing is the letter's.
    expect(lifted?.props["whiteSpace"]).not.toBe("nowrap");
    expect(lifted?.props["letterSpacing"]).toBeUndefined();
  });

  it("lifts the typography of a paragraph that mixes text and line breaks", () => {
    // `<p>Zeile<br>Zeile</p>` holds no text node of its own: the capture keeps it
    // as inner markup. Its size and colour must still reach the lifted body,
    // or the hero paragraph of fluffy-rectangle renders in 16 px black on black.
    const { nodes } = run(
      preset(
        ".lead{font-size:24px;color:#f8f8f8;font-weight:600}",
        '<div data-framer-component-type="RichTextContainer"><p class="lead">Erste Zeile<br>Zweite Zeile</p></div>',
      ),
    );
    const lifted = nodes.find((node) => String(node.props["html"] ?? "").includes("Erste Zeile"));
    expect(lifted).toBeDefined();
    expect(lifted?.props["fontSize"]).toBe("24px");
    expect(lifted?.props["color"]).toBe("#f8f8f8");
    expect(lifted?.props["fontWeight"]).toBe("600");
  });
});

describe("pinned layers", () => {
  it("keeps a fixed full-viewport overlay with its inset shorthand and background", () => {
    const { nodes } = run(
      page('<div style="position:fixed;inset:0;width:100%;height:100%;background:#000;z-index:0;pointer-events:none"></div><p>Inhalt</p>'),
    );
    const layer = nodes.find((node) => node.props["position"] === "fixed");
    expect(layer).toBeDefined();
    expect(layer?.props["top"]).toBe("0");
    expect(layer?.props["right"]).toBe("0");
    expect(layer?.props["bottom"]).toBe("0");
    expect(layer?.props["left"]).toBe("0");
    expect(JSON.stringify(layer?.props)).toContain("#000");
  });

  it("keeps a sticky element sticky", () => {
    const { nodes } = run(page('<div style="position:sticky;top:20px"><span>Leiste</span></div>'));
    expect(nodes.find((node) => node.props["position"] === "sticky")?.props["top"]).toBe("20px");
  });
});

describe("page-scoped style rules", () => {
  it("gives two pages different rule ids and class names, and the same page the same ones", () => {
    const html = page('<div style="color:#111;padding:4px">a</div>');
    const ids = (path: string) =>
      normalize(captureHtml({ html, pagePath: path })).rules.map((rule) => rule.id);
    expect(ids("/a")).not.toEqual(ids("/b"));
    expect(ids("/a")).toEqual(ids("/a"));
    expect(ids("/a")[0]).toContain(ruleScopeOf("/a"));
  });
});

describe("site-specific breakpoints", () => {
  // easier-train: three layouts (>=1440, 810-1439.98, <810) instead of the usual
  // 1200/810. Range overlap would let the first two both claim desktop.
  const bp =
    '<script type="application/json" id="__framer__breakpoints">[{"hash":"big","mediaQuery":"(min-width: 1440px)"},{"hash":"mid","mediaQuery":"(min-width: 810px) and (max-width: 1439.98px)"},{"hash":"small","mediaQuery":"(max-width: 809.98px)"}]</script>';
  const copies = (a: string, b: string, c: string) =>
    page(
      `<div class="ssr-variant hidden-mid hidden-small"><p class="framer-X">${a}</p></div>` +
        `<div class="ssr-variant hidden-big hidden-small"><p class="framer-X">${b}</p></div>` +
        `<div class="ssr-variant hidden-big hidden-mid"><p class="framer-X">${c}</p></div>`,
      "",
      bp,
    );

  it("folds three identical layouts into one node, whatever the breakpoint widths are", () => {
    const { nodes } = run(copies("1200+", "1200+", "1200+"));
    expect(nodes.filter((node) => node.props["text"] === "1200+")).toHaveLength(1);
  });

  it("gives each differing layout the device whose width it contains", () => {
    const { nodes } = run(copies("Gross", "Mittel", "Klein"));
    const devicesOf = (text: string) =>
      (nodes.find((node) => node.props["text"] === text) as { visibleDevices?: string[] } | undefined)?.visibleDevices;
    expect(devicesOf("Gross")).toEqual(["desktop"]);
    expect(devicesOf("Mittel")).toEqual(["tablet"]);
    expect(devicesOf("Klein")).toEqual(["mobile"]);
  });
});

describe("device copies", () => {
  const copies = (a: string, b: string, c: string) =>
    page(
      `<div class="ssr-variant hidden-d hidden-t"><p class="framer-X">${a}</p></div>` +
        `<div class="ssr-variant hidden-d hidden-m"><p class="framer-X">${b}</p></div>` +
        `<div class="ssr-variant hidden-t hidden-m"><p class="framer-X">${c}</p></div>`,
      "",
      '<script type="application/json" id="__framer__breakpoints">[{"hash":"d","mediaQuery":"(min-width: 1200px)"},{"hash":"t","mediaQuery":"(min-width: 810px) and (max-width: 1199.98px)"},{"hash":"m","mediaQuery":"(max-width: 809.98px)"}]</script>',
    );

  it("folds identical copies into one node", () => {
    const { nodes } = run(copies("Gleich", "Gleich", "Gleich"));
    expect(nodes.filter((node) => node.props["text"] === "Gleich")).toHaveLength(1);
  });

  it("keeps a copy with different content and shows it on its own device only", () => {
    // The copies are written in the order mobile, tablet, desktop (each one is
    // hidden at the two other breakpoints).
    const { nodes } = run(copies("Mobil", "Tablet", "Desktop"));
    const texts = nodes.map((node) => String(node.props["text"] ?? "")).filter(Boolean);
    expect(texts).toEqual(expect.arrayContaining(["Desktop", "Tablet", "Mobil"]));
    const mobile = nodes.find((node) => node.props["text"] === "Mobil") as { hidden?: boolean; visibleDevices?: string[] } | undefined;
    expect(mobile?.visibleDevices).toEqual(["mobile"]);
    expect(mobile?.hidden).toBe(true);
  });
});

describe("variant-scoped rules", () => {
  // Framer writes the rules of a component's phone variant under the variant's
  // class: `.framer-C.framer-v-phone{…}` on the root and
  // `.framer-C.framer-v-phone .framer-kid{…}` on its parts. The capture drops the
  // `framer-v-*` class from the node, so these rules never matched: the phone copy
  // kept the desktop layout (image beside the text, a two-column list) and a
  // service card came out 450 px too short at 390 px.
  const css =
    ".framer-C{flex-flow:row;width:100%}.framer-C .framer-kid{flex-flow:row;gap:4px}" +
    ".framer-C.framer-v-phone{flex-direction:column;width:350px}" +
    ".framer-C.framer-v-phone .framer-kid{flex-direction:column;gap:12px}";
  const breakpoints =
    '<script type="application/json" id="__framer__breakpoints">[{"hash":"d","mediaQuery":"(min-width: 810px)"},{"hash":"m","mediaQuery":"(max-width: 809.98px)"}]</script>';
  // The two copies differ in shape (the phone one has a second paragraph), so they
  // stay two nodes, each shown on its own devices.
  const html = page(
    '<div class="ssr-variant hidden-m"><div class="framer-C framer-v-desk"><div class="framer-kid"><p>a</p></div></div></div>' +
      '<div class="ssr-variant hidden-d"><div class="framer-C framer-v-phone"><div class="framer-kid"><p>a</p><p>b</p></div></div></div>',
    css,
    breakpoints,
  );
  const rootOn = (device: string) => {
    const { mapped } = run(html);
    const all = Object.values(mapped.document.nodes) as { props: Record<string, unknown>; children?: string[]; visibleDevices?: string[] }[];
    const root = all.find((node) => node.visibleDevices?.includes(device) === true);
    const kid = root?.children?.[0] === undefined ? undefined : (mapped.document.nodes[root.children[0]] as { props: Record<string, unknown> });
    return { root: root?.props, kid: kid?.props };
  };

  it("applies the rules under the phone variant's class to the phone copy", () => {
    const { root, kid } = rootOn("mobile");
    // Framer's base rule is the shorthand `flex-flow:row`, the variant's the
    // longhand `flex-direction:column`: the longhand has to win, so the shorthand
    // is read as its two longhands instead of staying a property of its own.
    expect(root?.["flexFlow"]).toBeUndefined();
    expect(root?.["flexDirection"]).toBe("column");
    expect(root?.["width"]).toBe("350px");
    expect(kid?.["flexDirection"]).toBe("column");
    expect(kid?.["gap"]).toEqual({ row: "12px", column: "12px" });
  });

  it("keeps those rules away from the desktop copy", () => {
    const { root, kid } = rootOn("desktop");
    expect(root?.["flexDirection"]).toBe("row");
    expect(root?.["width"]).toBe("100%");
    expect(kid?.["flexDirection"]).toBe("row");
  });

  it("lets the phone variant's `justify-content` win over the base rule's `place-content`", () => {
    // Framer's base rule is the shorthand `place-content:center`, the phone
    // variant's the longhand `justify-content:flex-start`. Kept as two
    // properties the compiled CSS puts the shorthand last and it wins: the
    // phone header's content was centred in a 64 px bar and ran out at the top.
    const phone = page(
      '<div class="ssr-variant hidden-d"><div class="framer-C framer-v-phone"><p>a</p><p>b</p></div></div>' +
        '<div class="ssr-variant hidden-m"><div class="framer-C framer-v-desk"><p>a</p></div></div>',
      ".framer-C{place-content:center;align-items:center}.framer-C.framer-v-phone{justify-content:flex-start}",
      breakpoints,
    );
    const { mapped } = run(phone);
    const all = Object.values(mapped.document.nodes) as { props: Record<string, unknown>; visibleDevices?: string[] }[];
    const on = (device: string) => all.find((node) => node.visibleDevices?.includes(device) === true)?.props;
    expect(on("mobile")?.["placeContent"]).toBeUndefined();
    expect(on("mobile")?.["justifyContent"]).toBe("flex-start");
    expect(on("mobile")?.["alignContent"]).toBe("center");
    expect(on("desktop")?.["justifyContent"]).toBe("center");
  });
});

describe("which rules the stylesheet really matches", () => {
  // The frame that holds the text `label`, with its padding and white-space.
  const boxOf = (html: string, css: string, label: string) => {
    const { mapped } = run(page(html, css));
    const all = Object.values(mapped.document.nodes) as { id: string; props: Record<string, unknown>; children?: string[] }[];
    const text = all.find((node) => node.props["text"] === label);
    const box = all.find((node) => text !== undefined && node.children?.includes(text.id));
    const padding = box?.props["padding"] as { top?: string } | undefined;
    return { padding: padding?.top, whiteSpace: box?.props["whiteSpace"] };
  };

  it("reads `@supports (aspect-ratio:1)` as satisfied, so the aspect ratio sizes the box instead of the fallback height", () => {
    // Framer writes `height:var(--framer-aspect-ratio-supported,438px)` and
    // defines the variable only inside `@supports (aspect-ratio:1){body{…:auto}}`.
    // Without that block the fallback 438 px stood for the height and a team
    // photo came out 73 px taller than the ratio makes it. The `not` form stays out.
    const { document } = run(
      page(
        '<div class="a">x</div>',
        "@supports (aspect-ratio:1){body{--framer-aspect-ratio-supported:auto}}" +
          "@supports not (aspect-ratio:1){.a{width:1px}}" +
          ".a{aspect-ratio:.96;height:var(--framer-aspect-ratio-supported,438px)}",
      ),
    );
    const state = document.pages[0]?.root.children.find((node) => node.baseClasses.includes("a"))?.states[0];
    expect(state?.visual["height"]).toBe("auto");
    expect(state?.visual["width"]).toBeUndefined();
  });

  it("keeps a class rule's padding when a rule scoped to an attribute elsewhere says `padding:0`", () => {
    // Framer's rich-text reset `[data-framer-component-type=DeprecatedRichText] div`
    // reaches the divs inside that component only. Read as a rule for every div it
    // came later in the sheet than the class rules and wiped the padding of the
    // page's containers (the hero of fluffy-rectangle lost 320 px).
    const css = ".framer-box{padding:20px}[data-framer-component-type=DeprecatedRichText] div{margin:0;padding:0}";
    const html = '<div class="framer-box"><p>draussen</p></div><div data-framer-component-type="DeprecatedRichText"><div><p>drinnen</p></div></div>';
    expect(boxOf(html, css, "draussen").padding).toBe("20px");
    expect(boxOf(html, css, "drinnen").padding).toBe("0");
  });

  it("applies `white-space:pre` only below an auto-sized text, not to every element", () => {
    const css = "[data-framer-component-text-autosized] *{white-space:pre}";
    const html = '<div class="framer-box"><p>frei</p></div><div data-framer-component-text-autosized="true"><div class="framer-box"><p>fest</p></div></div>';
    expect(boxOf(html, css, "frei").whiteSpace).not.toBe("pre");
    expect(boxOf(html, css, "fest").whiteSpace).toBe("pre");
  });

  it("lets the more specific rule win although a less specific one comes later", () => {
    const css = ".framer-wrap .framer-box{padding:20px}div{padding:0}";
    const html = '<div class="framer-wrap"><div class="framer-box"><p>x</p></div></div>';
    expect(boxOf(html, css, "x").padding).toBe("20px");
  });

  it("lets a later rule of the same specificity win", () => {
    const css = ".framer-box{padding:20px}.framer-box{padding:8px}";
    expect(boxOf('<div class="framer-box"><p>x</p></div>', css, "x").padding).toBe("8px");
  });

  it("skips a rule whose `:not()` excludes the element", () => {
    const css = ".framer-box:not(.framer-skip){padding:20px}";
    const html = '<div class="framer-box"><p>an</p></div><div class="framer-box framer-skip"><p>aus</p></div>';
    expect(boxOf(html, css, "an").padding).toBe("20px");
    expect(boxOf(html, css, "aus").padding).not.toBe("20px");
  });

  it("keeps the appear start state of a stylesheet rule out of the look", () => {
    // `[data-framer-appear-id]{opacity:0.001}` is the state before Framer's
    // script animates the element in. Like the inline `opacity:0.001` it must not
    // stay as the element's look, or the whole page imports almost invisible.
    const css = ".framer-box{padding:20px}[data-framer-appear-id]{opacity:0.001}";
    const html = '<div class="framer-box" data-framer-appear-id="a"><p>erscheint</p></div>';
    const { document, mapped } = run(page(html, css));
    const framed = Object.values(mapped.document.nodes).filter((node) => node.props["opacity"] !== undefined);
    expect(framed).toEqual([]);
    const appearing = document.pages[0]?.root.children[0];
    expect(appearing?.appearInitial?.["opacity"]).toBe("0.001");
  });

  it("turns Framer's border variables into a border on the element that says `data-border`", () => {
    // Framer keeps a border as custom properties and draws it with
    // `[data-border=true]:after`. That pseudo rule is not applied, so without
    // this the divider lines of the reference cards (fluffy-rectangle) were gone.
    const css =
      ".framer-card{--border-top-width:1px;--border-left-width:1px;--border-right-width:0px;--border-bottom-width:0px;--border-color:#262626;--border-style:solid;padding:20px}" +
      "[data-border=true]:after{content:'';border-width:var(--border-top-width,0) var(--border-right-width,0) var(--border-bottom-width,0) var(--border-left-width,0);border-color:var(--border-color,none);border-style:var(--border-style,none)}";
    const html = '<div class="framer-card" data-border="true"><p>Karte</p></div><div class="framer-card"><p>ohne</p></div>';
    const { mapped } = run(page(html, css));
    const all = Object.values(mapped.document.nodes) as { id: string; props: Record<string, unknown>; children?: string[] }[];
    const framed = (label: string) => {
      const text = all.find((node) => node.props["text"] === label || String(node.props["html"] ?? "").includes(label));
      return all.find((node) => text !== undefined && node.children?.includes(text.id))?.props;
    };
    const card = framed("Karte");
    expect(card?.["borderTopWidth"]).toBe("1px");
    expect(card?.["borderLeftWidth"]).toBe("1px");
    expect(card?.["borderRightWidth"]).toBe("0px");
    expect(card?.["borderStyle"]).toBe("solid");
    expect(card?.["borderColor"]).toBe("#262626");
    // Without `data-border` the variables draw nothing.
    expect(framed("ohne")?.["borderTopWidth"]).toBeUndefined();
  });

  it("reads an attribute on the element itself", () => {
    const css = '.framer-box[data-x="on"]{padding:20px}';
    const html = '<div class="framer-box" data-x="on"><p>an</p></div><div class="framer-box" data-x="off"><p>aus</p></div>';
    expect(boxOf(html, css, "an").padding).toBe("20px");
    expect(boxOf(html, css, "aus").padding).not.toBe("20px");
  });
});

describe("form controls", () => {
  // A form field has no children, so the import used to turn it into an empty
  // frame: the line the browser draws inside every field (27 px on the easier-train
  // contact form) was gone and the page below the form moved up by that much per field.
  // A field now carries what it shows as text, in the typography of the field.
  const texts = (html: string): string[] =>
    run(page(html))
      .nodes.map((node) => String(node.props["text"] ?? ""))
      .filter((text) => text !== "");

  it("shows the placeholder of a text field", () => {
    expect(texts('<div><input type="text" name="Name" placeholder="Jane Smith" class="framer-form-input" value></div>')).toEqual(["Jane Smith"]);
  });

  it("shows the value of a field before its placeholder", () => {
    expect(texts('<div><input type="email" placeholder="you@x.de" value="a@b.de"></div>')).toEqual(["a@b.de"]);
  });

  it("shows the selected option of a select, not the whole option list", () => {
    const html =
      '<div><select name="Services"><option value disabled selected>Select…</option><option value="a">General Dentistry</option><option value="b">Orthodontics</option></select></div>';
    expect(texts(html)).toEqual(["Select…"]);
  });

  it("shows the first option of a select that selects none", () => {
    expect(texts("<div><select><option>Erste</option><option>Zweite</option></select></div>")).toEqual(["Erste"]);
  });

  it("shows the format hint of a date and a time field, not their placeholder attribute", () => {
    expect(texts('<div><input type="date" placeholder="(123) 123-1331"></div>')).toEqual(["mm/dd/yyyy"]);
    expect(texts('<div><input type="time" placeholder="(123) 123-1331"></div>')).toEqual(["--:-- --"]);
  });

  it("shows the placeholder of a textarea", () => {
    expect(texts('<div><textarea placeholder="Nachricht"></textarea></div>')).toEqual(["Nachricht"]);
  });

  it("leaves a hidden spam-trap field without text", () => {
    const trap =
      '<input type="text" name="website" tabindex="-1" aria-hidden="true" style="position:absolute;transform:scale(0)" value>';
    expect(texts(`<div>${trap}</div>`)).toEqual([]);
  });

  it("leaves a checkbox, a button and a hidden field alone", () => {
    expect(texts('<div><input type="checkbox" placeholder="x"><input type="hidden" value="geheim"></div>')).toEqual([]);
  });
});

describe("spacing values that hold a function", () => {
  // The frame that holds the text `label`: its padding and gap as the mapper sets them.
  const spacingOf = (css: string) => {
    const { mapped } = run(page('<div class="framer-box"><p>x</p></div>', css));
    const all = Object.values(mapped.document.nodes) as { id: string; props: Record<string, unknown>; children?: string[] }[];
    const text = all.find((node) => node.props["text"] === "x");
    const box = all.find((node) => text !== undefined && node.children?.includes(text.id));
    return { padding: box?.props["padding"], gap: box?.props["gap"] };
  };

  // A shorthand splits on the spaces between its values, not on the spaces inside
  // a `clamp(16px, 4vw, 32px)` or a `calc(100% - 20px)`.
  it("keeps clamp() and calc() whole inside a padding shorthand", () => {
    const { padding } = spacingOf(".framer-box{padding:clamp(16px, 4vw, 32px) 8px calc(100% - 20px) 4px}");
    expect(padding).toEqual({
      top: "clamp(16px, 4vw, 32px)",
      right: "8px",
      bottom: "calc(100% - 20px)",
      left: "4px",
    });
  });

  it("keeps a function whole inside a gap shorthand", () => {
    const { gap } = spacingOf(".framer-box{display:flex;gap:calc(1px + 2px) 8px}");
    expect(gap).toEqual({ row: "calc(1px + 2px)", column: "8px" });
  });

  it("still splits plain shorthands as before", () => {
    const { padding, gap } = spacingOf(".framer-box{display:flex;padding:1px 2px;gap:3px}");
    expect(padding).toEqual({ top: "1px", right: "2px", bottom: "1px", left: "2px" });
    expect(gap).toEqual({ row: "3px", column: "3px" });
  });
});

describe("values the compiler takes only in its own shape", () => {
  const withPosition = (css: string, attrs = "") => {
    const { nodes } = run(page(`<div class="framer-layer"${attrs}><p>x</p></div>`, css));
    return nodes.find((node) => node.props["position"] === "absolute");
  };

  // The style table has no `inset`, and the compiler dropped it as text, so an
  // overlay pinned with `inset:0` collapsed to a point.
  it("turns `inset` of a stylesheet rule into the four sides", () => {
    const layer = withPosition(".framer-layer{position:absolute;inset:0}");
    expect(layer?.props).toMatchObject({ top: "0", right: "0", bottom: "0", left: "0" });
    expect(layer?.props["inset"]).toBeUndefined();
  });

  it("reads one to four values of `inset` like a box shorthand", () => {
    const layer = withPosition(".framer-layer{position:absolute;inset:10px 20px 30px}");
    expect(layer?.props).toMatchObject({ top: "10px", right: "20px", bottom: "30px", left: "20px" });
  });

  it("keeps a side the element names itself over the `inset` of its class", () => {
    const layer = withPosition(".framer-layer{position:absolute;inset:0}", ' style="top:5px"');
    expect(layer?.props).toMatchObject({ top: "5px", right: "0", bottom: "0", left: "0" });
  });

  it("keeps the inline `gap` of an element as a row/column pair", () => {
    const { nodes } = run(page('<div style="display:flex;gap:70px"><p>a</p><p>b</p></div>'));
    const flex = nodes.find((node) => node.props["display"] === "flex");
    expect(flex?.props["gap"]).toEqual({ row: "70px", column: "70px" });
  });

  // `background:linear-gradient(…)` is how Framer writes an overlay. The style
  // table's `background` is the colour, so the gradient compiled to
  // `background-color: linear-gradient(…)`, which no browser draws.
  it("puts a gradient in the `background` shorthand into the background image", () => {
    const gradient = "linear-gradient(180deg, rgba(37, 65, 57, 0) 0%, rgba(37, 65, 57, 0.7) 74%)";
    const { nodes } = run(page(`<div style="background:${gradient}"><p>x</p></div>`));
    const overlay = nodes.find((node) => node.props["backgroundImage"] !== undefined);
    expect(overlay?.props["backgroundImage"]).toBe(gradient);
    expect(overlay?.props["background"]).toBeUndefined();
  });

  it("keeps a plain colour in the `background` shorthand as the colour", () => {
    const { nodes } = run(page('<div style="background:#ff0000"><p>x</p></div>'));
    const box = nodes.find((node) => node.props["background"] !== undefined);
    expect(box?.props["background"]).toBe("#ff0000");
    expect(box?.props["backgroundImage"]).toBeUndefined();
  });
});

describe("Framer's Ticker", () => {
  const tickerStyle =
    "display:flex;width:100%;height:100%;place-items:center;margin:0;padding:0px;list-style-type:none;text-indent:none;opacity:0;overflow:hidden";

  // The Ticker's `<section>` is written at `opacity:0` and shown by Framer's
  // script; the export has no script, so the written state left it invisible.
  it("shows the section of a Ticker, which the export writes at opacity 0", () => {
    const { nodes } = run(page(`<section style="${tickerStyle}"><ul><li><p>Logo</p></li></ul></section>`));
    const section = nodes.find((node) => node.props["semantic"] === "section");
    expect(section).toBeDefined();
    expect(section?.props["opacity"]).toBeUndefined();
  });

  // The export has no movement to read, so the strip stands still. The report
  // says so, and says what to do about it.
  it("reports the Ticker as a standing strip", () => {
    const { document } = run(page(`<section style="${tickerStyle}"><ul><li><p>Logo</p></li></ul></section>`));
    const finding = document.findings.find((entry) => entry.message.includes("Ticker"));
    expect(finding).toMatchObject({ kind: "loop-animation", severity: "info" });
    expect(finding?.message).toContain("1 Ticker");
    expect(finding?.suggestion).toContain("Marquee-Section");
  });

  it("reports no Ticker for a page without one", () => {
    const { document } = run(page('<div style="display:flex;opacity:0"><p>versteckt</p></div>'));
    expect(document.findings.some((entry) => entry.message.includes("Ticker"))).toBe(false);
  });

  it("leaves any other element written at opacity 0 alone", () => {
    const { nodes } = run(page('<div style="display:flex;opacity:0"><p>versteckt</p></div>'));
    const box = nodes.find((node) => node.props["display"] === "flex");
    expect(box?.props["opacity"]).toBe("0");
  });
});

// Framer separates the paragraphs of one rich text with a margin-top on every
// block but the first. The baked `html` carries no styles, so the spacing
// travels as the row gap of the body (a column).
describe("paragraph spacing of a rich text", () => {
  const spacing =
    "p.framer-text:not(:first-child){margin-top:var(--framer-paragraph-spacing,0)}" +
    ".framer-styles-preset-x:not(.rich-text-wrapper){--framer-paragraph-spacing:40px}";
  const container = (paragraphs: string): string =>
    `<div data-framer-component-type="RichTextContainer" style="display:flex;flex-direction:column;--framer-paragraph-spacing:0px">${paragraphs}</div>`;
  const text = (content: string): string => `<p class="framer-text framer-styles-preset-x">${content}</p>`;
  const bodies = (html: string, css = spacing) => run(page(html, css)).nodes.filter((node) => node.primitive === "body");

  it("keeps the spacing between two paragraphs as the gap of the body", () => {
    const [body] = bodies(container(text("Erster") + text("Zweiter")));
    expect(body?.props["html"]).toBe("<p>Erster</p><p>Zweiter</p>");
    expect(body?.props["gap"]).toEqual({ row: "40px", column: "40px" });
  });

  it("gives a text of one paragraph no gap: the first block has no margin", () => {
    const [body] = bodies(container(text("Allein")));
    expect(body?.props["gap"]).toBeUndefined();
  });

  it("gives a text whose spacing is 0 no gap", () => {
    const css = spacing.replace("--framer-paragraph-spacing:40px", "--framer-paragraph-spacing:0px");
    const [body] = bodies(container(text("Erster") + text("Zweiter")), css);
    expect(body?.props["gap"]).toBeUndefined();
  });

  it("states the spacing of the phone for itself", () => {
    const css = `${spacing}@media(max-width: 809px){.framer-styles-preset-x:not(.rich-text-wrapper){--framer-paragraph-spacing:12px}}`;
    const [body] = bodies(container(text("Erster") + text("Zweiter")), css);
    expect(body?.props["gap"]).toEqual({ row: "40px", column: "40px" });
    expect(body?.props["gap_mobile"]).toEqual({ row: "12px", column: "12px" });
    expect(body?.props["gap_tablet"]).toBeUndefined();
  });

  it("makes the container a column where the capture did not say so", () => {
    const html = `<div data-framer-component-type="RichTextContainer">${text("Erster")}${text("Zweiter")}</div>`;
    const [body] = bodies(html);
    expect(body?.props).toMatchObject({ display: "flex", flexDirection: "column" });
  });
});
