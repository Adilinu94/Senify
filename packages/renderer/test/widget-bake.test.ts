import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import type { NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { PRIMITIVE_BASE_CSS } from "@senify/widget-engine";
import { bakeSite, type BakeResult } from "@senify/renderer";

// Phase 1: the release carries the widget base stylesheet of the 23 foundation
// stones. It comes from the one source (`widget-engine/src/markup.ts`,
// `PRIMITIVE_BASE_CSS`) — the canvas frame imports the very same constant
// (`packages/editor/test/canvas/rules.test.ts`) — and the baked page inlines it
// *before* the catalog markup, so `@layer user-authored` is registered after
// Tailwind's layers and the widget defaults win over the framework reset.

const themeCss = emitCss(resolveTheme(defaultTheme()));

// One catalog section: real markup from the one description, catalog defaults
// only (the per-node values of the style engine are Phase 2).
function catalogTree(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {}, children: ["sec"] },
      sec: { id: "sec", type: "section", props: {}, children: ["h", "g"] },
      h: {
        id: "h",
        type: "heading",
        props: { level: "h2", text: "Katalogbaustein" },
      },
      g: { id: "g", type: "grid", props: {}, children: ["t1", "t2"] },
      t1: { id: "t1", type: "text", props: { text: "Zelle eins" } },
      t2: { id: "t2", type: "text", props: { text: "Zelle zwei" } },
    },
  };
}

// A page of the running section registry only: it must not grow the widget base.
function legacyTree(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {}, children: ["hero"] },
      hero: {
        id: "hero",
        type: "hero",
        variant: "centered",
        props: { headline: "Ohne Katalog" },
      },
    },
  };
}

let baked: BakeResult | undefined;

afterAll(() => {
  if (baked) rmSync(baked.outDir, { recursive: true, force: true });
});

describe("widget base stylesheet in the release (Phase 1)", () => {
  it("inlines the one base stylesheet before the catalog markup", async () => {
    baked = await bakeSite(
      {
        siteName: "Katalog",
        baseUrl: "https://beispiel.de",
        pages: [
          { id: "catalog", path: "/", title: "Katalog", tree: catalogTree() },
          { id: "legacy", path: "/ohne", title: "Ohne", tree: legacyTree() },
        ],
        themeCss,
        motionTokens: { ease: {}, baseDurationMs: 300, baseStaggerMs: 80 },
        aeo: false,
      },
      { outDir: join(mkdtempSync(join(tmpdir(), "senify-widget-bake-")), "dist") },
    );
    const site = loadBakedSite(baked.outDir);
    const html = await site.read("index.html");

    // The markup of the foundation stones: element, class and node markers all
    // from `markup.ts`, rendered through the SectionTree the canvas shares.
    // The scope class is deterministic per node (ticket 21): it makes the
    // anchored `scoped` selectors match without a rule registry in the renderer.
    expect(html).toContain(
      '<h2 class="w-heading __senify_scope_h" data-node-id="h" data-widget="heading">Katalogbaustein</h2>',
    );
    expect(html).toContain(
      '<div class="w-grid __senify_scope_g" data-node-id="g" data-widget="grid">' +
        '<p class="w-text __senify_scope_t1" data-node-id="t1" data-widget="text">Zelle eins</p>' +
        '<p class="w-text __senify_scope_t2" data-node-id="t2" data-widget="text">Zelle zwei</p></div>',
    );

    // One source: the stylesheet in the page is the constant itself, byte for
    // byte — no second list, no re-written values.
    expect(html).toContain(PRIMITIVE_BASE_CSS);
    // And it stands before the content it styles, so the authored layer is
    // registered after Tailwind's layers and therefore wins over the reset.
    expect(html.indexOf(PRIMITIVE_BASE_CSS)).toBeLessThan(html.indexOf("<section"));
    // A catalog container renders its children: no "children-unrendered" note.
    expect(baked.warnings.filter((w) => w.code === "children-unrendered")).toEqual([]);
  }, 300000);

  it("leaves a page without a catalog primitive untouched", async () => {
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    const html = await site.read("ohne/index.html");
    expect(html).toContain('data-section="hero"');
    expect(html).not.toContain("@layer user-authored");
    expect(html).not.toContain(".w-heading {");
  }, 300000);
});
