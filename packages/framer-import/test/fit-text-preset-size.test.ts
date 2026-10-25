import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// A fit text whose size is NOT written inline (measured on `unifiersofjapan`,
// 24.10.2026).
//
// Framer writes the text style either inline or into a preset CLASS rule. The
// capture read only the inline form, so this `<svg>` stayed a graphic — and a
// graphic it must not be, because the sanitizer drops `<foreignObject>` (an
// allow-list against foreign code), leaving an EMPTY element:
//
//   source at 900 px:  "moments" is 810 × 205 px
//   structure:         0 × 0 px — the section around it lost 846 px, the page
//                     659 px (22,76 % pixel difference on tablet)
//
// The viewBox is the line box of the one line a fit text holds, so the ratio is
// the geometry: `977.22 × 247` against `font-size:248px` → 25,37 % of the width
// and a line height of 1. Both are read from the box, not guessed from a preset
// table (the preset parser finds 0 presets on every measured site — the selector
// shape is `.preset:not(.rich-text-wrapper),.owner … h1{`).

function fitText(body: string): string {
  return `<html lang="de"><head><title>t</title></head><body>
    <div id="main" data-framer-hydrate-v2>
      <svg class="framer-1akavns" viewBox="0 0 977.22 247" style="transform:none">
        <foreignObject width="100%" height="100%" class="framer-fit-text">
          ${body}
        </foreignObject>
      </svg>
    </div>
  </body></html>`;
}

type MappedNode = { primitive?: string; props?: Record<string, unknown> };

function mapped(html: string): MappedNode[] {
  const document = captureHtml({ html });
  const normalized = normalize(document, { mode: "fidelity" });
  const result = mapDocument(document, normalized.rules, { mode: "fidelity" });
  return Object.values(result.document.nodes) as MappedNode[];
}

// The words of a fit text travel as the `html` of a `body` (the rich-text
// shape), never as `text` of a heading.
function fitNode(nodes: MappedNode[]): MappedNode | undefined {
  return nodes.find((node) => typeof node.props?.html === "string" && node.props.html === "moments");
}

describe("a fit text without an inline font size", () => {
  it("reads the size from the viewBox instead of losing the element", () => {
    // The exact shape of the live page: the h1 carries a preset class, no
    // inline `--framer-font-size`.
    const nodes = mapped(fitText(`<h1 class="framer-text framer-styles-preset-1d2t81a" style="--framer-text-alignment:center">moments</h1>`));
    const node = fitNode(nodes);
    expect(node).toBeDefined();
    // The words are TEXT (the editor can reach them), never a graphic: a graphic
    // would be dropped by the SVG sanitizer, because `foreignObject` is not in
    // its allow-list — that was the 0 px element.
    expect(node?.primitive).toBe("body");
    expect(node?.props?.html).toBe("moments");
  });

  it("gives it a size as a share of the box, not a frozen pixel value", () => {
    const node = fitNode(mapped(fitText(`<h1 class="framer-text framer-styles-preset-1d2t81a">moments</h1>`)));
    // 247 / 977.22 = 25.27 % of the container width.
    expect(String(node?.props?.fontSize)).toMatch(/cqw$/);
    const share = Number.parseFloat(String(node?.props?.fontSize));
    expect(share).toBeGreaterThan(25);
    expect(share).toBeLessThan(26);
  });

  it("reads the line height from the viewBox so the word keeps its one line", () => {
    const node = fitNode(mapped(fitText(`<h1 class="framer-text framer-styles-preset-1d2t81a">moments</h1>`)));
    // 247 / 247 = 1. Without it the browser takes 1.5 and the word stands 341 px
    // tall instead of 205.
    expect(node?.props?.lineHeight).toBe("1");
  });

  it("keeps the inline font size when the page writes one", () => {
    // The older shape (the Earn template): the size IS inline, and it wins over
    // the viewBox geometry.
    const node = fitNode(mapped(fitText(`<h1 style="--framer-font-size:200px;--framer-line-height:1.05em">moments</h1>`)));
    // 200 / 977.22 = 20.4661 % — the inline value, not the viewBox height.
    expect(Number.parseFloat(String(node?.props?.fontSize))).toBeCloseTo(20.47, 1);
    expect(node?.props?.lineHeight).toBe("1.05");
  });

  it("keeps a graphic a graphic", () => {
    // An `<svg>` that is NOT a fit text keeps its drawing; the card graphics of
    // the same page are of this kind.
    const html = `<html lang="de"><head><title>t</title></head><body>
      <div id="main" data-framer-hydrate-v2>
        <svg viewBox="0 0 524 676"><path d="M0 0h524v676H0z" fill="#FAF3E9"></path></svg>
      </div>
    </body></html>`;
    const nodes = mapped(html);
    const icon = nodes.find((node) => node.primitive === "icon");
    expect(icon).toBeDefined();
    expect(String(icon?.props?.svg)).toContain("M0 0h524v676H0z");
  });
});
