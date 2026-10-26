import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import { bundledSections } from "@senify/registry";
import type { GoldenNode, Node, NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { bakeSite, type BakeResult } from "@senify/renderer";

// The page needs a ground. `theme.css` only declares variables (`--bg-base`,
// `--fg-base`) — no rules. Without a `body` rule the page is TRANSPARENT, and a
// full-page screenshot comes out with alpha 0.
//
// Measured on the imported `rare-works` tree (25.10.2026): every pixel
// comparison against the source read a white page against a transparent one and
// reported 14.17 % instead of the real 7.77 %. The error was in the measurement,
// but the cause was in the page: nothing painted the background.

let counter = 0;
function place(golden: GoldenNode, nodes: Record<string, Node>, parentId: string): string {
  const id = `bg${counter++}`;
  const parent = nodes[parentId];
  if (!parent) throw new Error(`Missing parent ${parentId}`);
  parent.children = [...(parent.children ?? []), id];
  nodes[id] = { id, type: golden.type, variant: golden.variant, props: { ...golden.props } };
  for (const child of golden.children ?? []) place(child, nodes, id);
  return id;
}

function tree(): NodeTree {
  const nodes: Record<string, Node> = { root: { id: "root", type: "page", props: {} } };
  const hero = bundledSections.find((entry) => entry.type === "hero");
  if (!hero) throw new Error("Unknown section hero");
  place(hero.golden.tree, nodes, "root");
  return { rootNodeId: "root", nodes };
}

const resolved = resolveTheme(defaultTheme());
let baked: BakeResult | undefined;

afterAll(() => {
  if (baked) rmSync(baked.outDir, { recursive: true, force: true });
});

describe("bake: the page has a ground", () => {
  it("bakes the fixture", async () => {
    baked = await bakeSite(
      {
        siteName: "Musterstudio",
        baseUrl: "https://beispiel.de",
        pages: [{ id: "p1", path: "/", title: "Start", tree: tree() }],
        themeCss: emitCss(resolved),
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        aeo: false,
      },
      { outDir: join(mkdtempSync(join(tmpdir(), "senify-ground-")), "dist") },
    );
    expect(baked.outDir).toBeTruthy();
  }, 240000);

  it("paints the body from the theme, not from nothing", async () => {
    if (!baked) throw new Error("bake missing");
    // The stylesheet the layout imports is bundled into `/_astro/*.css`. The rule
    // may live in any of them, so the test reads every stylesheet of the build.
    const site = loadBakedSite(baked.outDir);
    const html = await site.read("index.html");
    const hrefs = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((href): href is string => href !== undefined);
    // Astro puts the bundled global stylesheet in the head under `/_astro/`.
    const bundled = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((match) => match[1]);
    const files = [...new Set([...hrefs, ...bundled])].filter((href): href is string => href !== undefined);
    let css = "";
    for (const href of files) {
      try {
        css += await site.read(href.slice(1));
      } catch {
        // A stylesheet the page links but the bake did not write is not the one
        // under test; the assertion below still has to pass on the others.
      }
    }
    if (css === "") {
      // Fall back to the file system: a build may inline the sheet.
      const astro = join(baked.outDir, "_astro");
      css = readFileSync(join(astro, "."), "utf8").toString();
    }
    // The rule must name the variable, so a themed site gets its own colour and
    // a site without one still gets white instead of transparent.
    expect(css).toMatch(/body\s*\{[^}]*background-color:\s*var\(--bg-base/);
  });

  it("leaves the text colour to the imported rules", async () => {
    // `color` on the body was the first attempt and broke the canvas/release
    // parity test: the canvas does not load this stylesheet, the release does,
    // so the two disagreed on the heading colour. Only the background is needed
    // for the page to have a ground.
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    const html = await site.read("index.html");
    const bundled = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((match) => match[1]);
    let css = "";
    for (const href of bundled) {
      if (href === undefined) continue;
      try {
        css += await site.read(href.slice(1));
      } catch {
        // see above
      }
    }
    expect(css).not.toMatch(/body\s*\{[^}]*[^-]color:\s*var\(--fg-base/);
  });
});
