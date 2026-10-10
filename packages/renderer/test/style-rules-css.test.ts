import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import {
  createAmbientRule,
  createClassRule,
  createScopedRule,
  type StyleRule,
} from "@senify/widget-engine";
import { bakeSite, styleRulesCss, type BakeResult } from "@senify/renderer";

// The release half of the one rule path (ADR-0005): the site registry is the
// one source, the bake compiles it into `assets/style-rules.css` — class rules
// on the nodes that carry the name, ambient verbatim, scoped on their node,
// `rawCss` as the validated keyframes block. The canvas compiles the same rule
// list through `toCssDocument`, so both sides meet in the same stages.

function tree(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {} },
      "head-abc123": {
        id: "head-abc123",
        type: "heading",
        props: { text: "Hallo" },
        classes: ["accent"],
      },
      "hero-xyz789": { id: "hero-xyz789", type: "hero", props: {} },
    },
  };
}

const page = (): { path: string; tree: NodeTree }[] => [{ path: "/", tree: tree() }];

describe("styleRulesCss", () => {
  it("stays empty without rules", () => {
    expect(styleRulesCss(page(), [])).toBe("");
  });

  // The canvas compiles every node's open style props whether or not the site
  // has a rule; the release has to as well, or a page changes its look when it
  // is published.
  it("compiles the open style props of nodes even without rules", () => {
    const styled: { path: string; tree: NodeTree }[] = [
      {
        path: "/",
        tree: {
          rootNodeId: "root",
          nodes: {
            root: { id: "root", type: "page", props: {} },
            "head-abc123": {
              id: "head-abc123",
              type: "heading",
              props: { text: "Hallo", color: "#112233" },
            },
          },
        },
      },
    ];
    expect(styleRulesCss(styled, [])).toContain("#112233");
  });

  it("emits every rule kind in the authored layer", () => {
    const rules: StyleRule[] = [
      createClassRule({ id: "r1", name: "accent", styles: { color: "#ff0000" } }),
      createAmbientRule({ id: "r2", selector: "h1", styles: { letterSpacing: "0.02em" } }),
      {
        ...createScopedRule({ id: "r3", nodeId: "hero-xyz789", styles: { color: "#00ff00" } }),
        selector: " > .inner",
      },
      {
        ...createClassRule({ id: "r4", name: "pulse" }),
        rawCss: "@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }",
      },
    ];
    const css = styleRulesCss(page(), rules);
    expect(css).toContain("@layer user-authored");
    // The class rule is emitted once for the class (ticket 14), not per node.
    expect(css).toContain(".accent");
    expect(css).not.toContain('[data-node-id="head-abc123"].accent');
    // Ambient rules attach by matching, never by assignment.
    expect(css).toContain("h1");
    // A scoped rule is anchored on its one node.
    expect(css).toContain('[data-node-id="hero-xyz789"] > .inner');
    // `rawCss` is the validated keyframes block.
    expect(css).toContain("@keyframes pulse");
  });

  it("drops a scoped rule whose node is not part of any page", () => {
    const css = styleRulesCss(page(), [
      createScopedRule({ id: "r1", nodeId: "gone000001", styles: { color: "#ff0000" } }),
    ]);
    expect(css).toBe("");
  });

  // Ticket 22: the layout splice rekeys the page/template subtree
  // (`engine/src/templates.ts` `rekeyChildren`). A scoped rule — bound to its
  // draft id — is rebuilt on the composed node through the page's `nodeIdMap`;
  // class rules travel on the node itself and never need the map.
  it("remaps a scoped rule onto the composed node id", () => {
    const composed: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {} },
        n7: { id: "n7", type: "hero", props: {} },
      },
    };
    const css = styleRulesCss(
      [{ path: "/", tree: composed, nodeIdMap: { "hero-xyz789": ["n7"] } }],
      [createScopedRule({ id: "r1", nodeId: "hero-xyz789", styles: { color: "#00ff00" } })],
    );
    expect(css).toContain('[data-node-id="n7"].__senify_scope_n7');
    expect(css).not.toContain("hero-xyz789");
  });

  // Ticket 04: one definition part can be copied once per instance, so a
  // draft id maps to several composed ids — every copy gets its selector.
  it("emits one scoped selector per component copy", () => {
    const composed: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {} },
        c1: { id: "c1", type: "heading", props: {} },
        c2: { id: "c2", type: "heading", props: {} },
      },
    };
    const css = styleRulesCss(
      [{ path: "/", tree: composed, nodeIdMap: { "def-head": ["c1", "c2"] } }],
      [createScopedRule({ id: "r1", nodeId: "def-head", styles: { color: "#00ff00" } })],
    );
    expect(css).toContain('[data-node-id="c1"].__senify_scope_c1');
    expect(css).toContain('[data-node-id="c2"].__senify_scope_c2');
  });

  it("emits one scoped selector per composed occurrence, deduplicated per map", () => {
    const pageWith = (id: string): { path: string; tree: NodeTree; nodeIdMap: Record<string, string[]> } => ({
      path: `/${id}`,
      tree: {
        rootNodeId: "root",
        nodes: {
          root: { id: "root", type: "page", props: {} },
          [id]: { id, type: "content", props: {} },
        },
      },
      nodeIdMap: { intro: [id] },
    });
    // Two entry routes compose their own `intro` node; pagination variants of
    // one route share the map (and the tree) and must not emit twice.
    const shared = pageWith("n1");
    const css = styleRulesCss(
      [shared, { ...shared, path: "/variant" }, pageWith("n2")],
      [createScopedRule({ id: "r1", nodeId: "intro", styles: { color: "#00ff00" } })],
    );
    expect(css.match(/\[data-node-id="n1"\]\.__senify_scope_n1/g)).toHaveLength(1);
    expect(css).toContain('[data-node-id="n2"].__senify_scope_n2');
  });
});

const theme = defaultTheme();
const resolved = resolveTheme(theme);
if (resolved.issues.length > 0) throw new Error("Default theme does not resolve");

let baked: BakeResult | undefined;

afterAll(() => {
  if (baked) rmSync(baked.outDir, { recursive: true, force: true });
});

describe("bake with site style rules", () => {
  it("writes and links assets/style-rules.css", async () => {
    baked = await bakeSite(
      {
        siteName: "Regel-Test",
        baseUrl: "https://regeln.example",
        pages: [{ id: "p1", path: "/", title: "Start", tree: tree() }],
        themeCss: emitCss(resolved),
        motionTokens: {
          ease: resolved.motion.ease,
          baseDurationMs: 300,
          baseStaggerMs: 80,
        },
        styleRules: [
          createClassRule({ id: "r1", name: "accent", styles: { color: "#ff0000" } }),
          createAmbientRule({ id: "r2", selector: "h1", styles: { letterSpacing: "0.02em" } }),
        ],
        aeo: false,
      },
      { outDir: join(mkdtempSync(join(tmpdir(), "senify-rules-bake-")), "dist") },
    );
    const css = readFileSync(join(baked.outDir, "assets", "style-rules.css"), "utf8");
    expect(css).toContain(".accent");
    expect(css).toContain("h1");
    const html = readFileSync(join(baked.outDir, "index.html"), "utf8");
    // Linked after the widget base so the order inside the layer matches the
    // canvas frame (base first, authored rules last).
    expect(html).toContain('href="/assets/style-rules.css"');
  }, 180000);
});
