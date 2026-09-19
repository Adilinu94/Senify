// The open style space (ADR-0005, ticket 10).
//
// Two things changed here and both are pinned in this suite:
//
// 1. `styleGroups` no longer gates. A heading may carry a border and a width;
//    the golden test shows the full sample, this suite shows the rule.
// 2. Properties outside the table are emitted as free CSS, in a stable order:
//    the table first (layout leads), the free rest last, alphabetically.

import { describe, expect, it } from "vitest";
import { compileCss, declarationsForValues, type CssDocument } from "../src/index.ts";

function compile(document: CssDocument): string {
  return compileCss(document, { layer: null });
}

describe("style groups are display order, not a gate", () => {
  it("lets a heading carry a border and a width", () => {
    const css = compile({
      nodes: [
        {
          id: "h1",
          primitive: "heading",
          props: { borderWidth: 1, borderColor: "#000000", maxWidth: "40rem" },
        },
      ],
    });
    expect(css).toContain("border-width: 1px;");
    expect(css).toContain("border-color: #000000;");
    expect(css).toContain("max-width: 40rem;");
  });

  it("lets an image carry a text colour and a font size", () => {
    const css = compile({
      nodes: [{ id: "img", primitive: "image", props: { color: "#111111", fontSize: 14 } }],
    });
    expect(css).toContain("color: #111111;");
    expect(css).toContain("font-size: 14px;");
  });
});

describe("the open property space", () => {
  it("emits a property the table does not know", () => {
    const css = compile({
      nodes: [
        {
          id: "n1",
          primitive: "frame",
          props: {
            scrollSnapType: "x mandatory",
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
            containerType: "inline-size",
          },
        },
      ],
    });
    expect(css).toContain("scroll-snap-type: x mandatory;");
    expect(css).toContain("clip-path: polygon(0 0, 100% 0, 50% 100%);");
    expect(css).toContain("container-type: inline-size;");
  });

  it("emits the table first and the free rest last, alphabetically", () => {
    const css = compile({
      nodes: [
        {
          id: "n1",
          primitive: "frame",
          props: {
            zIndex: 5,
            position: "absolute",
            padding: { top: "8", right: "8", bottom: "8", left: "8", isLinked: true, unit: "px" },
            zoom: 1.2,
            accentColor: "#ff0000",
          },
        },
      ],
    });
    const position = css.indexOf("position: absolute;");
    const zIndex = css.indexOf("z-index: 5;");
    const padding = css.indexOf("padding: 8px;");
    const accent = css.indexOf("accent-color: #ff0000;");
    const zoom = css.indexOf("zoom: 1.2;");
    expect(position).toBeGreaterThan(-1);
    // Layout leads the table…
    expect(position).toBeLessThan(zIndex);
    expect(zIndex).toBeLessThan(padding);
    // …and the free properties come after the whole table, sorted.
    expect(padding).toBeLessThan(accent);
    expect(accent).toBeLessThan(zoom);
  });

  it("does not repeat a free value in a narrower device block", () => {
    const css = compile({
      nodes: [
        {
          id: "n1",
          primitive: "frame",
          props: { accentColor: "#ff0000", accentColor_mobile: "#00ff00" },
        },
      ],
    });
    // Desktop carries it once, the tablet block must not repeat it, the mobile
    // block carries the override.
    expect(css.match(/accent-color: #ff0000;/g)).toHaveLength(1);
    expect(css).toContain("accent-color: #00ff00;");
  });

  it("stays stable whatever the key order of the bag is", () => {
    const a = compile({
      nodes: [
        { id: "n1", primitive: "frame", props: { zoom: 1.2, accentColor: "#f00", padding: 8 } },
      ],
    });
    const b = compile({
      nodes: [
        { id: "n1", primitive: "frame", props: { padding: 8, accentColor: "#f00", zoom: 1.2 } },
      ],
    });
    expect(a).toBe(b);
  });

  it("keeps a catalog control out of the stylesheet", () => {
    // `text` is a behavioural prop of the primitive, not CSS.
    const declarations = declarationsForValues("heading", { text: "Hallo", color: "#111111" });
    expect(declarations.map((entry) => entry.property)).toEqual(["color"]);
  });

  it("treats a device suffix on a free property like any other", () => {
    const css = compile({
      nodes: [
        {
          id: "n1",
          primitive: "frame",
          props: { scrollSnapType: "x mandatory", scrollSnapType_mobile: "none" },
        },
      ],
    });
    expect(css).toContain("scroll-snap-type: x mandatory;");
    expect(css).toContain("@media (max-width: 639.98px)");
    expect(css).toContain("scroll-snap-type: none;");
  });
});

describe("the alias keeps both spellings equal", () => {
  it("emits the same declaration for camelCase and the CSS name", () => {
    const camel = compile({
      nodes: [{ id: "n1", primitive: "frame", props: { borderRadius: 8 } }],
    });
    const kebab = compile({
      nodes: [{ id: "n1", primitive: "frame", props: { "border-radius": 8 } }],
    });
    expect(camel).toBe(kebab);
    expect(camel).toContain("border-radius: 8px;");
  });

  it("resolves a token reference on a free property", () => {
    const css = compile({
      nodes: [
        {
          id: "n1",
          primitive: "frame",
          props: { "--brand": { $token: "color.brand" } },
        },
      ],
    });
    expect(css).toContain("--brand: var(--color-brand);");
  });
});
