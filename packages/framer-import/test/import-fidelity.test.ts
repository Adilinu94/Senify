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
