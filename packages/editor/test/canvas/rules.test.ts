import { describe, expect, it } from "vitest";
import {
  CASCADE_LAYER,
  PRIMITIVE_BASE_CSS,
  compileCss,
  mediaQueryFor,
  nodeSelector,
} from "@senify/widget-engine";
import { toCssDocument, type EditorDocument } from "@senify/editor/state";
import { CANVAS_CHROME_CSS, canvasFrameRules } from "@senify/editor/canvas";

// Point 6: the generated rules reach every frame inside `@layer user-authored`,
// the editor chrome (markers, forced state) stays unlayered and therefore
// stronger, and forcing a state never changes the release stylesheet.

function document(): EditorDocument {
  return {
    version: 2,
    rootNodeId: "root",
    nodes: {
      root: { id: "root", primitive: "root", props: {}, children: ["card"] },
      card: {
        id: "card",
        primitive: "button",
        props: { background: "#ff0000", fontSize: 16 },
        classes: ["cta"],
        states: {
          hover: { background: "#00ff00", background_tablet: "#0000ff" },
          focus: { background: "#123456" },
        },
      },
    },
    styleRules: [
      {
        id: "r-cta",
        name: "cta",
        kind: "class",
        selector: ".cta",
        order: 0,
        styles: { color: "#222222" },
        contextStyles: {},
      },
    ],
  };
}

describe("frame rules", () => {
  it("wraps the generated rules in the one cascade layer", () => {
    const { authored } = canvasFrameRules(document());
    expect(authored.startsWith(`@layer ${CASCADE_LAYER} {`)).toBe(true);
    expect(authored).toContain(nodeSelector("card") + " {");
    expect(authored).toContain("background-color: #ff0000;");
    expect(authored).toContain(mediaQueryFor("tablet"));
  });

  it("keeps the editor chrome unlayered so it beats the layer", () => {
    const { chrome, css } = canvasFrameRules(document());
    expect(chrome).toContain(".senify-canvas__marker");
    expect(chrome).not.toContain("@layer");
    // The injected stylesheet carries both parts, chrome first.
    expect(css.indexOf(".senify-canvas__marker")).toBeLessThan(
      css.indexOf(`@layer ${CASCADE_LAYER}`),
    );
  });

  it("paints a forced state through the root attribute without touching the release", () => {
    const base = document();
    const plain = canvasFrameRules(base);
    const hover = canvasFrameRules(base, { forcedState: "hover" });
    // The generated part is identical: the release stylesheet never changes.
    expect(hover.authored).toBe(plain.authored);
    expect(plain.css).not.toContain("data-force-state");
    expect(hover.chrome).toContain('[data-force-state="hover"] [data-node-id="card"]');
    expect(hover.chrome).toContain("background-color: #00ff00;");
    // The class + state combination reaches the preview too.
    expect(hover.chrome).toContain('[data-force-state="hover"] [data-node-id="card"].cta');
    expect(hover.chrome).not.toContain("@layer");
  });

  it("writes nothing for a state no node carries", () => {
    const active = canvasFrameRules(document(), { forcedState: "active" });
    expect(active.chrome).not.toContain("data-force-state");
    // Only the marker chrome is left.
    expect(active.chrome).toBe(CANVAS_CHROME_CSS.trim());
    expect(active.css).toContain(active.authored);
  });

  it("feeds the widget base stylesheet into the frame, before the document rules", () => {
    // Phase 1, one source: the frame imports the very constant the release
    // carries (`bake.ts` / `Section.astro`), so the foundation stones' element
    // defaults cannot drift between canvas and release. Base and document rules
    // share `@layer user-authored`; the base comes first so a node rule wins on
    // source order (same specificity: `.w-*` vs `[data-node-id]`).
    const { base, css, authored } = canvasFrameRules(document());
    expect(base).toBe(PRIMITIVE_BASE_CSS);
    expect(css).toContain(".w-heading {");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    // Chrome first (unlayered), then the base, then the document rules.
    expect(css.indexOf(".senify-canvas__marker")).toBeLessThan(css.indexOf(base));
    expect(css.indexOf(base)).toBeLessThan(css.indexOf(authored));
  });

  it("forwards the token resolver into the generated rules", () => {
    const withToken: EditorDocument = {
      version: 2,
      rootNodeId: "root",
      nodes: {
        root: { id: "root", primitive: "root", props: {}, children: ["hero"] },
        hero: {
          id: "hero",
          primitive: "frame",
          props: { background: { $token: "color.brand-500" } },
        },
      },
      styleRules: [],
    };
    const { authored } = canvasFrameRules(withToken, {
      resolveToken: (ref) => (ref === "color.brand-500" ? "#123456" : undefined),
    });
    expect(authored).toContain("background-color: #123456;");
    // The plain compiler keeps the variable form when no resolver is given.
    expect(compileCss(toCssDocument(withToken))).toContain("var(--");
  });
});
