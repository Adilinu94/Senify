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

  it("keeps image alt text", () => {
    const { nodes } = run(page('<img src="a.png" alt="Logo Acme" width="100" height="50">'));
    expect(nodes.find((node) => node.primitive === "image")?.props["alt"]).toBe("Logo Acme");
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

  it("does not let a hover rule leak into the base style", () => {
    const { nodes, document } = run(
      page('<div class="btn">Go</div>', ".btn{background-color:#111}.btn:hover{background-color:#f00}"),
    );
    const colors = nodes.map((node) => String(node.props["backgroundColor"] ?? ""));
    expect(colors).toContain("#111");
    expect(colors).not.toContain("#f00");
    expect(document.findings.some((finding) => finding.message.includes("Pseudo-Zustand"))).toBe(true);
  });

  it("applies class rules on a large stylesheet (no size limit)", () => {
    const filler = Array.from({ length: 4000 }, (_, index) => `.x${index}{color:#${(index % 4096).toString(16).padStart(3, "0")}}`).join("");
    const { nodes } = run(page('<div class="t">x</div>', `${filler}.t{background-color:#abc}`));
    expect(nodes.map((node) => node.props["backgroundColor"])).toContain("#abc");
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
