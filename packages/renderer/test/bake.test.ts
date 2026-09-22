import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import { bundledSections } from "@senify/registry";
import type { GoldenNode, Node, NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import {
  bakeSite,
  type BakeInput,
  type BakePageInput,
  type BakeResult,
} from "@senify/renderer";

const BASE_URL = "https://beispiel.de";

let counter = 0;
const nextId = (): string => `fx${counter++}`;

function placeGolden(
  golden: GoldenNode,
  nodes: Record<string, Node>,
  parentId: string,
): void {
  const id = nextId();
  const parent = nodes[parentId];
  if (!parent) throw new Error(`Missing parent ${parentId}`);
  parent.children = [...(parent.children ?? []), id];
  nodes[id] = {
    id,
    type: golden.type,
    variant: golden.variant,
    props: { ...golden.props },
  };
  for (const child of golden.children ?? []) {
    placeGolden(child, nodes, id);
  }
}

function buildTree(types: string[]): NodeTree {
  const nodes: Record<string, Node> = {
    root: { id: "root", type: "page", props: {} },
  };
  for (const type of types) {
    const definition = bundledSections.find((section) => section.type === type);
    if (!definition) throw new Error(`Unknown section ${type}`);
    placeGolden(definition.golden.tree, nodes, "root");
  }
  return { rootNodeId: "root", nodes };
}

function withMotion(
  tree: NodeTree,
  motions: Record<string, { preset: string; intensity?: number }>,
): NodeTree {
  const nodes = structuredClone(tree.nodes);
  for (const [type, spec] of Object.entries(motions)) {
    const node = Object.values(nodes).find((entry) => entry.type === type);
    if (!node) throw new Error(`No ${type} node for motion`);
    node.motion = { preset: spec.preset, intensity: spec.intensity ?? 6 };
  }
  return { rootNodeId: tree.rootNodeId, nodes };
}

function withOverride(
  tree: NodeTree,
  type: string,
  breakpoint: "tablet" | "mobile",
  props: Record<string, unknown>,
): NodeTree {
  const nodes = structuredClone(tree.nodes);
  const node = Object.values(nodes).find((entry) => entry.type === type);
  if (!node) throw new Error(`No ${type} node for override`);
  node.overrides = {
    ...(node.overrides ?? {}),
    [breakpoint]: { props } as NonNullable<
      Node["overrides"]
    >["mobile"],
  };
  return { rootNodeId: tree.rootNodeId, nodes };
}

const theme = defaultTheme();
const resolved = resolveTheme(theme);
if (resolved.issues.length > 0) throw new Error("Default theme does not resolve");

const ALL_TYPES = bundledSections.map((section) => section.type);
const CHUNKS: string[][] = [];
for (let index = 0; index < ALL_TYPES.length; index += 7) {
  CHUNKS.push(ALL_TYPES.slice(index, index + 7));
}

function fixtureInput(aeo = true): BakeInput {
  const pages: BakePageInput[] = CHUNKS.map((types, index) => ({
    id: `page-${index}`,
    path: index === 0 ? "/" : `/seite-${index + 1}`,
    title: index === 0 ? "Start" : `Seite ${index + 1}`,
    description: index === 0 ? "Die Startseite des Studios." : undefined,
    tree:
      index === 0
        ? withOverride(buildTree(types), "hero", "mobile", {
            paddingY: { $token: "space.8" },
          })
        : buildTree(types),
  }));
  pages.push({
    id: "page-motion",
    path: "/motion",
    title: "Motion",
    tree: withMotion(buildTree(["hero", "stats"]), {
      hero: { preset: "masked-headline", intensity: 7 },
      stats: { preset: "counter" },
    }),
  });
  pages.push({
    id: "page-transition",
    path: "/uebergang",
    title: "Übergang",
    tree: withMotion(buildTree(["hero"]), { hero: { preset: "page-fade" } }),
  });
  pages.push({
    id: "page-minimal",
    path: "/pur",
    title: "Pur",
    tree: buildTree(["divider"]),
  });
  return {
    siteName: "Musterstudio",
    baseUrl: BASE_URL,
    pages,
    themeCss: emitCss(resolved),
    motionTokens: {
      ease: resolved.motion.ease,
      baseDurationMs: 300,
      baseStaggerMs: 80,
    },
    profile: "standard",
    aeo,
  };
}

let baked: BakeResult | undefined;
let bakedNoAeo: BakeResult | undefined;

afterAll(() => {
  for (const result of [baked, bakedNoAeo]) {
    if (result) rmSync(result.outDir, { recursive: true, force: true });
  }
});

describe("bake (Prüfstelle 2)", () => {
  it("builds the fixture release as a static site", async () => {
    baked = await bakeSite(fixtureInput(), {
      outDir: join(mkdtempSync(join(tmpdir(), "senify-bake-")), "dist"),
    });
    const site = loadBakedSite(baked.outDir);
    expect(await site.exists("index.html")).toBe(true);
    expect(await site.exists("seite-2/index.html")).toBe(true);
    expect(await site.exists("motion/index.html")).toBe(true);
    expect(await site.exists("uebergang/index.html")).toBe(true);
    expect(await site.exists("pur/index.html")).toBe(true);
    expect(await site.exists("assets/theme.css")).toBe(true);
    expect(await site.exists("assets/components.css")).toBe(true);
    expect(await site.exists("generated/manifest.json")).toBe(false);
  }, 180000);

  it("renders semantic html without draft leaks", async () => {
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    const home = await site.read("index.html");
    expect(home).toContain("<section");
    expect(home).toContain("<h1");
    expect(home).toContain("<title>Start | Musterstudio</title>");
    expect(home).toContain('data-section="hero"');
    expect(home).not.toContain("draftVersion");
    expect(home).not.toContain('"nodes"');
    expect(home).not.toContain("generated/manifest.json");
  }, 180000);

  it("emits motion config and scripts only where needed", async () => {
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    const motion = await site.read("motion/index.html");
    expect(motion).toContain('id="motion-data"');
    expect(motion).toContain("masked-headline");
    expect(motion).toContain("/assets/page.js");
    // Self-hosted vendor files (M2), per-page by preset needs: the fixture
    // page needs SplitText but no ScrollTrigger.
    expect(motion).toContain("/assets/vendor/gsap.min.js");
    expect(motion).toContain("/assets/vendor/SplitText.min.js");
    expect(motion).toContain("/assets/vendor/lenis.min.js");
    expect(motion).not.toContain("/assets/vendor/ScrollTrigger.min.js");
    expect(motion).not.toContain("cdn.jsdelivr");
    expect(motion).toContain('"v":2');
    expect(motion).toContain('"entries"');
    expect(await site.exists("assets/page.js")).toBe(true);
    expect(await site.exists("assets/vendor/gsap.min.js")).toBe(true);
    expect(await site.exists("assets/vendor/lenis.min.js")).toBe(true);

    const minimal = await site.read("pur/index.html");
    expect(minimal).not.toContain("/assets/page.js");
    expect(minimal).not.toContain("motion-data");
    expect(minimal).not.toContain("<script");
  }, 180000);

  it("inlines the page transition CSS without a page script", async () => {
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    const transition = await site.read("uebergang/index.html");
    expect(transition).toContain("@view-transition { navigation: auto; }");
    expect(transition).toContain("prefers-reduced-motion: reduce");
    // Page-level CSS only: no motion payload, no page.js for this page.
    expect(transition).not.toContain('id="motion-data"');
    expect(transition).not.toContain("/assets/page.js");
  }, 180000);

  it("stamps the FOUC pending marker, noscript and failsafe for hiding presets", async () => {
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    const motion = await site.read("motion/index.html");
    expect(motion).toContain("data-motion-pending");
    expect(motion).toContain("<noscript>");
    expect(motion).toContain("[data-motion-pending]{opacity:0}");
    expect(motion).toContain("[data-motion-pending]{opacity:1 !important}");
    expect(motion).toContain("1600");
    // A page without motion carries neither marker nor failsafe.
    const home = await site.read("index.html");
    expect(home).not.toContain("data-motion-pending");
  }, 180000);

  it("keeps the self-hosted motion runtime within the bundle budget", async () => {
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    // v1 guideline: motion JS ≤ ~150 KB (raw) per page. The vendored files are
    // local; SplitText and ScrollTrigger only load where a preset needs them.
    let vendor = 0;
    for (const name of [
      "gsap.min.js",
      "ScrollTrigger.min.js",
      "SplitText.min.js",
      "lenis.min.js",
    ]) {
      vendor += (await site.read(`assets/vendor/${name}`)).length;
    }
    const pageJs = (await site.read("assets/page.js")).length;
    expect(vendor + pageJs).toBeLessThanOrEqual(150 * 1024);
  }, 180000);

  it("references islands only where interactive sections exist", async () => {
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    expect(await site.exists("assets/islands.js")).toBe(true);
    const home = await site.read("index.html");
    expect(home).toContain("/assets/islands.js");
    const minimal = await site.read("pur/index.html");
    expect(minimal).not.toContain("/assets/islands.js");
  }, 180000);

  it("writes the aeo minimum and omits it when disabled", async () => {
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    expect(await site.exists("index.md")).toBe(true);
    expect(await site.exists("motion.md")).toBe(true);
    const indexMd = await site.read("index.md");
    expect(indexMd.startsWith("# Start\n")).toBe(true);
    const llms = await site.read("llms.txt");
    expect(llms).toContain("# Musterstudio");
    expect(llms).toContain("(https://beispiel.de/index.md)");
    expect(llms).toContain("(https://beispiel.de/motion.md)");
    const sitemap = await site.read("sitemap.xml");
    expect(sitemap).toContain("<loc>https://beispiel.de/</loc>");
    expect(sitemap).toContain("<loc>https://beispiel.de/pur</loc>");
    const robots = await site.read("robots.txt");
    expect(robots).toContain("Sitemap: https://beispiel.de/sitemap.xml");

    bakedNoAeo = await bakeSite(fixtureInput(false), {
      outDir: join(mkdtempSync(join(tmpdir(), "senify-bake-")), "dist"),
    });
    const plain = loadBakedSite(bakedNoAeo.outDir);
    expect(await plain.exists("llms.txt")).toBe(false);
    expect(await plain.exists("sitemap.xml")).toBe(false);
    expect(await plain.exists("robots.txt")).toBe(false);
    expect(await plain.exists("index.md")).toBe(false);
  }, 180000);

  it("embeds validated faq json-ld", async () => {
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    const withFaq = await site.read("seite-2/index.html");
    expect(withFaq).toContain('type="application/ld+json"');
    expect(withFaq).toContain("FAQPage");
  }, 180000);

  it("emits breakpoint override css for style props", async () => {
    if (!baked) throw new Error("bake missing");
    const site = loadBakedSite(baked.outDir);
    expect(await site.exists("assets/sections.css")).toBe(true);
    const css = await site.read("assets/sections.css");
    expect(css).toContain("@media (max-width: 639.98px)");
    expect(css).toContain("--section-pad-y: var(--space-8);");
    const home = await site.read("index.html");
    expect(home).toContain("/assets/sections.css");
  }, 180000);
});

describe("strict bake gates", () => {
  function tinyInput(
    tree: NodeTree,
    options: { strict?: boolean } = {},
  ): Promise<BakeResult> {
    return bakeSite(
      {
        siteName: "Strict",
        baseUrl: BASE_URL,
        pages: [{ id: "p", path: "/", title: "Start", tree }],
        themeCss: ":root{}",
        motionTokens: { ease: {}, baseDurationMs: 300, baseStaggerMs: 80 },
      },
      {
        outDir: join(mkdtempSync(join(tmpdir(), "senify-strict-")), "dist"),
        ...options,
      },
    );
  }

  function pinTree(): NodeTree {
    return {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {}, children: ["a", "b"] },
        a: { id: "a", type: "hero", props: { headline: "A" }, motion: { preset: "scrub-pin" } },
        b: { id: "b", type: "hero", props: { headline: "B" }, motion: { preset: "sticky-stack" } },
      },
    };
  }

  it("blocks pin excess in strict mode", async () => {
    await expect(tinyInput(pinTree(), { strict: true })).rejects.toThrow(/pin presets/);
  }, 180000);

  it("blocks invalid json-ld in strict mode", async () => {
    const tree: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {}, children: ["f"] },
        f: { id: "f", type: "faq", props: { items: [{ q: 5, a: "x" }] } },
      },
    };
    await expect(tinyInput(tree, { strict: true })).rejects.toThrow(/JSON-LD|json-ld/i);
  }, 180000);

  it("warns on silent billing fallback and loads split-text for splits", async () => {
    const tree: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: "page", props: {}, children: ["h", "p"] },
        h: {
          id: "h",
          type: "hero",
          props: { headline: "Hi" },
          motion: { preset: "masked-headline" },
        },
        p: {
          id: "p",
          type: "pricing",
          props: {
            title: "Preise",
            billingToggle: true,
            plans: [{ name: "A", price: "1 Euro", ctaLabel: "Los", ctaLink: { url: "/" } }],
          },
        },
      },
    };
    const result = await tinyInput(tree);
    try {
      expect(result.warnings.some((w) => w.code === "billing-silent")).toBe(true);
      const site = loadBakedSite(result.outDir);
      const html = await site.read("index.html");
      expect(html).toContain("SplitText.min.js");
    } finally {
      rmSync(result.outDir, { recursive: true, force: true });
    }
  }, 180000);
});
