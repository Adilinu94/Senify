import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import type { NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { bakeSite, type BakeResult } from "@senify/renderer";
import { widgetVendorCode } from "../src/widget-vendor.ts";

// Task 6: the release ships the widget cores it uses. One ESM file per type in
// use, the name carries a content hash, and the island script carries the URL
// map — without the map the island would mark the host "failed" and the poster
// would stand for good.

const WIDGET_FILE = /^ribbon-gallery\.[a-f0-9]{8}\.js$/;

function widgetTree(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {}, children: ["sec"] },
      sec: { id: "sec", type: "section", props: {}, children: ["ribbon"] },
      ribbon: { id: "ribbon", type: "ribbon-gallery", props: {} },
    },
  };
}

function plainTree(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {}, children: ["sec"] },
      sec: { id: "sec", type: "section", props: {}, children: [] },
    },
  };
}

const tempDirs: string[] = [];
function outDirFor(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return join(dir, "dist");
}

let baked: BakeResult;

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("bake: widget assets", () => {
  beforeAll(async () => {
    baked = await bakeSite(
      {
        siteName: "Widget",
        baseUrl: "https://beispiel.de",
        pages: [{ id: "ribbon", path: "/", title: "Ribbon", tree: widgetTree() }],
        themeCss: emitCss(resolveTheme(defaultTheme())),
        motionTokens: { ease: {}, baseDurationMs: 300, baseStaggerMs: 80 },
        aeo: false,
      },
      { outDir: outDirFor("senify-widget-assets-") },
    );
  }, 300000);

  it("writes the used widget core and maps its URL in the island script", () => {
    const widgetDir = join(baked.outDir, "assets", "widgets");
    const files = readdirSync(widgetDir).filter((name) => WIDGET_FILE.test(name));
    expect(files).toHaveLength(1);
    const name = files[0] ?? "";
    // The file is the bundle of this process, not a copy from somewhere else.
    expect(readFileSync(join(widgetDir, name), "utf8")).toBe(widgetVendorCode("ribbon-gallery"));

    const islands = readFileSync(join(baked.outDir, "assets", "islands.js"), "utf8");
    expect(islands).toContain(`/assets/widgets/${name}`);
    expect(islands).toContain(`"ribbon-gallery":"/assets/widgets/${name}"`);
    expect(islands).toContain('document.querySelectorAll(\'[data-island="widget"]\')');
  });

  it("marks the host as a widget island in the baked markup", async () => {
    const html = await loadBakedSite(baked.outDir).read("index.html");
    // The markup names the host (island + type); the island script's URL map
    // keys on exactly this type.
    expect(html).toContain('data-island="widget"');
    expect(html).toContain('data-widget-type="ribbon-gallery"');
    expect(html).toContain("data-props=");
  });

  it("writes nothing for a page without widgets", async () => {
    const outDir = outDirFor("senify-widget-none-");
    const result = await bakeSite(
      {
        siteName: "Ohne Widget",
        baseUrl: "https://beispiel.de",
        pages: [{ id: "plain", path: "/", title: "Ohne", tree: plainTree() }],
        themeCss: emitCss(resolveTheme(defaultTheme())),
        motionTokens: { ease: {}, baseDurationMs: 300, baseStaggerMs: 80 },
        aeo: false,
      },
      { outDir },
    );
    expect(existsSync(join(result.outDir, "assets", "widgets"))).toBe(false);
    expect(existsSync(join(result.outDir, "assets", "islands.js"))).toBe(false);
  }, 300000);
});
