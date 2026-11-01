import { describe, expect, it } from "vitest";
import { captureHtml, normalize, mapDocument } from "../src/index.ts";

// The box of a fit text (measured on `unifiersofjapan`, 31.10.2026).
//
// A fit text sizes its words as a share of the box it fills, and `cqw` resolves
// against the nearest ANCESTOR container. Two things were missing in the bake:
//
//   source:  `oda` — font size 768.857 px in a viewBox 1079.066 wide, the box
//            `width:34%` of its wrapper → 281.3 px type on a 1161.2 px wrapper.
//   import:  71.2521cqw with NO `container-type` anywhere, so the browser
//            resolved it against the 1440 px window → 1026.03 px (factor
//            1.3345). `oda` stood 923.4 px tall instead of 253.2 and pushed
//            `nobunaga` down by 670.2 px.
//
// The container was lost twice over: its check ran on the RAW children, and
// Framer wraps every breakpoint copy in an `ssr-variant` that the capture
// dissolves — the declared node never reached the IR. And the share has to be
// stated against the box, not the wrapper: 71.2521 × 0.34 = 24.2257.

type MappedNode = { id?: string; primitive?: string; props?: Record<string, unknown>; children?: string[] };

function page(body: string, css: string): string {
  return `<html lang="de"><head><title>t</title><style>${css}</style></head><body>
    <div id="main" data-framer-hydrate-v2>
      <div class="framer-box">
        ${body}
      </div>
    </div>
  </body></html>`;
}

// The exact shape of the live page: the fit text sits in a per-breakpoint
// `ssr-variant` wrapper, and its width lives in a class rule.
const FIT_TEXT = `<div class="ssr-variant hidden-mobile">
  <svg class="framer-oda" viewBox="0 0 1079.066 394.8">
    <foreignObject width="100%" height="100%" class="framer-fit-text">
      <h3 style="--framer-font-size:768.857px;--framer-line-height:0.9">oda</h3>
    </foreignObject>
  </svg>
</div>`;

function mapped(html: string): MappedNode[] {
  const document = captureHtml({ html });
  const normalized = normalize(document, { mode: "fidelity" });
  const result = mapDocument(document, normalized.rules, { mode: "fidelity" });
  return Object.values(result.document.nodes) as MappedNode[];
}

function fitNode(nodes: MappedNode[]): MappedNode | undefined {
  return nodes.find((node) => node.props?.html === "oda");
}

describe("the box a fit text fills", () => {
  it("gives the surviving parent a container, not the dissolved wrapper", () => {
    const nodes = mapped(page(FIT_TEXT, ".framer-box{width:96%}.framer-oda{width:34%}"));
    const fit = fitNode(nodes);
    expect(fit).toBeDefined();
    const holder = nodes.find((node) => node.props?.containerType === "inline-size");
    expect(holder).toBeDefined();
    // The container query measures an ANCESTOR — a container on the text
    // itself would not help.
    expect(holder?.children).toContain(fit?.id);
    expect(fit?.props?.containerType).toBeUndefined();
  });

  it("states the share against the box, not the wrapper", () => {
    const nodes = mapped(page(FIT_TEXT, ".framer-box{width:96%}.framer-oda{width:34%}"));
    // 768.857 / 1079.066 = 71.2521 % of the wrapper, 34 % of which is the box.
    expect(fitNode(nodes)?.props?.fontSize).toBe("24.2257cqw");
  });

  it("leaves the share alone when the box has no readable percentage width", () => {
    const nodes = mapped(page(FIT_TEXT, ".framer-box{width:96%}"));
    expect(fitNode(nodes)?.props?.fontSize).toBe("71.2521cqw");
  });
});
