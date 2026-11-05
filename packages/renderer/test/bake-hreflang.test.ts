import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import { bundledSections } from "@senify/registry";
import type { GoldenNode, Node, NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { bakeSite, type BakeResult } from "@senify/renderer";

// The language versions of a page land as `<link rel="alternate" hreflang>`
// in the head. The bake only links paths the release really carries; a tag
// that is no language and a path outside the site never reach the markup.

let counter = 0;
function place(golden: GoldenNode, nodes: Record<string, Node>, parentId: string): string {
  const id = `hl${counter++}`;
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

async function html(file: string): Promise<string> {
  if (!baked) throw new Error("bake missing");
  return loadBakedSite(baked.outDir).read(file);
}

describe("bake: language versions", () => {
  it("bakes the fixture", async () => {
    baked = await bakeSite(
      {
        siteName: "Musterstudio",
        baseUrl: "https://beispiel.de",
        pages: [
          {
            id: "p-de",
            path: "/de",
            title: "Deutsch",
            tree: tree(),
            alternates: [
              { lang: "de", path: "/de" },
              { lang: "en", path: "/en" },
              { lang: "x-default", path: "/de" },
              { lang: "fr", path: "/fr" },
              { lang: "english!", path: "/en" },
              { lang: "ja", path: "https://andere.example/ja" },
              { lang: "en", path: "/en" },
            ],
          },
          {
            id: "p-en",
            path: "/en",
            title: "English",
            tree: tree(),
            alternates: [
              { lang: "de", path: "/de" },
              { lang: "en", path: "/en" },
              { lang: "x-default", path: "/de" },
            ],
          },
        ],
        themeCss: emitCss(resolved),
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        profile: "standard",
      },
      { outDir: join(mkdtempSync(join(tmpdir(), "senify-hreflang-")), "dist") },
    );
    expect(baked.outDir).toBeTruthy();
  }, 240000);

  it("links the versions with a page in this release, against the site address", async () => {
    const markup = await html("de/index.html");
    expect(markup).toContain('<link rel="alternate" hreflang="de" href="https://beispiel.de/de"');
    expect(markup).toContain('<link rel="alternate" hreflang="en" href="https://beispiel.de/en"');
    expect(markup).toContain('<link rel="alternate" hreflang="x-default" href="https://beispiel.de/de"');
    expect(markup.match(/hreflang="en"/g)).toHaveLength(1);
  });

  it("drops a version this release does not carry, a non-language tag and a foreign path", async () => {
    const markup = await html("de/index.html");
    expect(markup).not.toContain('hreflang="fr"');
    expect(markup).not.toContain("english!");
    expect(markup).not.toContain("andere.example");
  });

  it("gives every localized page its own set", async () => {
    const markup = await html("en/index.html");
    expect(markup).toContain('<link rel="alternate" hreflang="de" href="https://beispiel.de/de"');
    expect(markup).toContain('<link rel="alternate" hreflang="x-default" href="https://beispiel.de/de"');
  });
});
