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
// the editor chrome (cursor, forced state) stays unlayered and therefore
// stronger, and forcing a state never changes the release stylesheet. The
// selection/hover markers are portal DOM (ticket 16, `overlay.test.ts`).

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
    expect(chrome).toContain("[data-node-id] { cursor: pointer; }");
    expect(chrome).not.toContain("@layer");
    // The injected stylesheet carries both parts, chrome first.
    expect(css.indexOf("[data-node-id] { cursor: pointer; }")).toBeLessThan(
      css.indexOf(`@layer ${CASCADE_LAYER}`),
    );
  });

  it("leaves the editor chrome out in live mode (M4 Stufe 1)", () => {
    const live = canvasFrameRules(document(), { chrome: false, forcedState: "hover" });
    // The real page: no editor cursor rule, no forced state. (The widget base
    // may carry `cursor: pointer` for the button primitive — that is content.)
    expect(live.chrome).toBe("");
    expect(live.css).not.toContain(CANVAS_CHROME_CSS.trim());
    expect(live.css).not.toContain("data-force-state");
    // The release rules stay untouched — base and document rules still apply.
    expect(live.css).toContain(`@layer ${CASCADE_LAYER} {`);
    expect(live.css).toContain(nodeSelector("card") + " {");
    expect(live.authored).toBe(canvasFrameRules(document()).authored);
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
    // Only the cursor chrome is left.
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
    expect(css.indexOf("[data-node-id] { cursor: pointer; }")).toBeLessThan(css.indexOf(base));
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

  // Ticket 04, styles per instance: a scoped rule the editor wrote on the
  // instance follows its root copy, and a device-suffixed override of a style
  // prop reaches the copy's media block (the canvas compiles from the document,
  // so the override must be merged into the copy's CssNode).
  it("follows an instance's scoped rule and device override to its copies", () => {
    const instanceDoc: EditorDocument = {
      version: 2,
      rootNodeId: "root",
      nodes: {
        root: { id: "root", primitive: "root", props: {}, children: ["def", "ins"] },
        def: {
          id: "def",
          primitive: "__component",
          props: { name: "karte", version: 1 },
          children: ["hero"],
        },
        hero: { id: "hero", primitive: "hero", props: {} },
        ins: {
          id: "ins",
          primitive: "__component_instance",
          props: {
            componentId: "def",
            componentVersion: 1,
            overrides: { hero: { background: "#111111", background_tablet: "#222222" } },
          },
        },
      },
      styleRules: [
        {
          id: "r-ins",
          name: "__senify_scope_ins",
          kind: "scoped",
          selector: ".__senify_scope_ins",
          order: 0,
          scope: { type: "node", nodeId: "ins", role: "module-style" },
          styles: { color: "#00ff00" },
          contextStyles: {},
        },
      ],
    };
    const { authored } = canvasFrameRules(instanceDoc);
    // The scoped rule is anchored on the copy, never on the instance id.
    expect(authored).not.toContain('[data-node-id="ins"].__senify_scope_ins');
    const scoped = authored.match(
      /\[data-node-id="([^"]+)"\]\.__senify_scope_[A-Za-z0-9_]+ \{\s*color: #00ff00;/,
    );
    expect(scoped).not.toBeNull();
    const copyId = scoped?.[1] ?? "";
    expect(copyId).not.toBe("");
    // The override patch reaches the copy: base value and tablet block.
    expect(authored).toContain(`[data-node-id="${copyId}"]`);
    expect(authored).toContain("background-color: #111111;");
    const tablet = authored.slice(authored.indexOf(mediaQueryFor("tablet")));
    expect(tablet).toContain("background-color: #222222;");
    // The structural props stay out of the stylesheet (no `component-id`).
    expect(authored).not.toContain("component-id:");
  });

  // Ticket 04, variants: the overlay of an active variant is part of the copy's
  // effective props, so its style values must reach the compiler — otherwise
  // the canvas would render the definition's base and drift from the bake.
  it("applies an active variant's overlay to the copies", () => {
    const variantDoc: EditorDocument = {
      version: 2,
      rootNodeId: "root",
      nodes: {
        root: { id: "root", primitive: "root", props: {}, children: ["def", "ins"] },
        def: {
          id: "def",
          primitive: "__component",
          props: {
            name: "karte",
            version: 1,
            variants: { groß: { hero: { background: "#333333" } } },
          },
          children: ["hero"],
        },
        hero: { id: "hero", primitive: "hero", props: { background: "#eeeeee" } },
        ins: {
          id: "ins",
          primitive: "__component_instance",
          props: { componentId: "def", componentVersion: 1, variants: ["groß"] },
        },
      },
      styleRules: [],
    };
    const { authored } = canvasFrameRules(variantDoc);
    // The overlay lands on the copy (never on the definition's own node, which
    // does not render): the rule that carries the value is anchored on a copy id.
    const overlayRule = authored.match(
      /\[data-node-id="([^"]+)"\][^{]*\{[^}]*background-color: #333333;/,
    );
    expect(overlayRule).not.toBeNull();
    expect(overlayRule?.[1]).not.toBe("hero");
    // The variant list itself is structure, never a declaration.
    expect(authored).not.toContain("variants:");

    // The instance's own override wins over the variant overlay.
    const withOverride: EditorDocument = structuredClone(variantDoc);
    withOverride.nodes["ins"]!.props = {
      ...withOverride.nodes["ins"]!.props,
      overrides: { hero: { background: "#111111" } },
    };
    const overridden = canvasFrameRules(withOverride).authored;
    expect(overridden).toContain("background-color: #111111;");
    expect(overridden).not.toContain("background-color: #333333;");
  });
});
