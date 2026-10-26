import { describe, expect, it } from "vitest";
import { captureHtml } from "../src/capture-html.ts";

// A "Page Loader" is the OPPOSITE of a reveal: Framer shows it while the page
// builds and fades it OUT. Read as a reveal it plays backwards — the overlay is
// animated to `opacity: 1` and covers the page for good.
//
// Measured on `rare-works` (26.10.2026): the loader is `position: fixed`,
// 1440 × 900, `z-index: 10`, its start state is `opacity:0; transform:scale(1.04)`
// — exactly the shape of a reveal — and the source leaves it at `opacity: 0`.
// The baked page showed a white splash over the hero: the whole page looked
// empty while the DOM was complete (93 non-background pixels in a 1440 × 900
// screenshot).
const page = (loader: string): string => `<!doctype html><html><head><title>T</title></head><body>
<div id="main">
  <div data-framer-name="${loader}" style="position:fixed;top:0;left:0;z-index:10;width:100%;height:100vh;opacity:0;transform:scale(1.04)">
    <div><span>splash</span></div>
  </div>
  <h1><span style="display:inline-block;opacity:0.001;filter:blur(12px);transform:translateY(28px)">Wort</span></h1>
</div></body></html>`;

describe("der Page Loader ist keine Einblendung", () => {
  it("leitet für ihn keinen Effekt ab, der ihn einblendet", () => {
    const named = captureHtml({ html: page("Page Loader"), pagePath: "/" });
    const loaderSpecs = (named.appear ?? []).filter((spec) => spec.appearId.includes("derived"));
    // The word keeps its reveal, the loader gets none.
    expect(loaderSpecs).toHaveLength(1);
  });

  it("erkennt ihn auch ohne Namen an seiner Form", () => {
    // Same fixed overlay, no `data-framer-name`: the shape alone is the tell.
    const unnamed = captureHtml({ html: page("Overlay"), pagePath: "/" });
    const derived = (unnamed.appear ?? []).filter((spec) => spec.appearId.includes("derived"));
    expect(derived).toHaveLength(1);
  });

  it("lässt die Wort-Einblendung daneben unberührt", () => {
    const document = captureHtml({ html: page("Page Loader"), pagePath: "/" });
    type Node = { tag: string; derivedAppearId?: string | null; children: Node[] };
    const spans: string[] = [];
    const walk = (node: Node): void => {
      if (node.tag === "span" && node.derivedAppearId !== undefined && node.derivedAppearId !== null) {
        spans.push(node.derivedAppearId);
      }
      for (const child of node.children) walk(child);
    };
    walk(document.pages[0]?.root as Node);
    expect(spans.length).toBeGreaterThan(0);
  });
});
