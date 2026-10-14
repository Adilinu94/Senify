import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import { bundledSections } from "@senify/registry";
import type { GoldenNode, Node, NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { bakeSite, type BakeResult } from "@senify/renderer";

// The page root carries the page language. It sets `<html lang>` of that page
// (the Framer import fills it from the source page); a value that is no
// language tag falls back to the default instead of reaching the attribute.

let counter = 0;
function place(golden: GoldenNode, nodes: Record<string, Node>, parentId: string): string {
  const id = `pl${counter++}`;
  const parent = nodes[parentId];
  if (!parent) throw new Error(`Missing parent ${parentId}`);
  parent.children = [...(parent.children ?? []), id];
  nodes[id] = { id, type: golden.type, variant: golden.variant, props: { ...golden.props } };
  for (const child of golden.children ?? []) place(child, nodes, id);
  return id;
}

function tree(rootProps: Record<string, string>): NodeTree {
  const nodes: Record<string, Node> = { root: { id: "root", type: "page", props: rootProps } };
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

async function htmlLang(file: string): Promise<string | undefined> {
  if (!baked) throw new Error("bake missing");
  const html = await loadBakedSite(baked.outDir).read(file);
  return /<html\b[^>]*\blang="([^"]*)"/.exec(html)?.[1];
}

describe("bake: page language", () => {
  it("bakes the fixture", async () => {
    baked = await bakeSite(
      {
        siteName: "Musterstudio",
        baseUrl: "https://beispiel.de",
        pages: [
          { id: "p-default", path: "/standard", title: "Standard", tree: tree({}) },
          { id: "p-en", path: "/englisch", title: "English", tree: tree({ lang: "en" }) },
          { id: "p-region", path: "/region", title: "Regiao", tree: tree({ lang: " pt-BR " }) },
          { id: "p-text", path: "/text", title: "Text", tree: tree({ lang: "english, please" }) },
          { id: "p-inject", path: "/einschleusen", title: "Inject", tree: tree({ lang: 'de"><script>x' }) },
          { id: "p-empty", path: "/leer", title: "Leer", tree: tree({ lang: "" }) },
        ],
        themeCss: emitCss(resolved),
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        profile: "standard",
      },
      { outDir: join(mkdtempSync(join(tmpdir(), "senify-page-lang-")), "dist") },
    );
    expect(baked.outDir).toBeTruthy();
  }, 240000);

  it("keeps de for a page without a language", async () => {
    expect(await htmlLang("standard/index.html")).toBe("de");
  });

  it("takes the language tag of the page root", async () => {
    expect(await htmlLang("englisch/index.html")).toBe("en");
    expect(await htmlLang("region/index.html")).toBe("pt-BR");
  });

  it("falls back to de for a value that is no language tag", async () => {
    expect(await htmlLang("text/index.html")).toBe("de");
    expect(await htmlLang("leer/index.html")).toBe("de");
  });

  it("never lets a hostile value into the attribute", async () => {
    expect(await htmlLang("einschleusen/index.html")).toBe("de");
    const html = await loadBakedSite(baked?.outDir ?? "").read("einschleusen/index.html");
    expect(html).not.toContain("<script>x");
  });
});
