import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import { bundledSections } from "@senify/registry";
import type { GoldenNode, MotionSpec, Node, NodeTree } from "@senify/section-sdk";
import { defaultTheme, emitCss, resolveTheme } from "@senify/tokens";
import { bakeSite, type BakeResult } from "@senify/renderer";

// Reveals above the fold play as CSS: the head carries the keyframes, the
// markup says `data-motion-enter`, and a page with nothing else to animate
// ships no motion script at all.

let counter = 0;
function place(golden: GoldenNode, nodes: Record<string, Node>, parentId: string): string {
  const id = `ce${counter++}`;
  const parent = nodes[parentId];
  if (!parent) throw new Error(`Missing parent ${parentId}`);
  parent.children = [...(parent.children ?? []), id];
  nodes[id] = { id, type: golden.type, variant: golden.variant, props: { ...golden.props } };
  for (const child of golden.children ?? []) place(child, nodes, id);
  return id;
}

function tree(sections: { type: string; motion?: MotionSpec }[]): NodeTree {
  const nodes: Record<string, Node> = { root: { id: "root", type: "page", props: {} } };
  for (const section of sections) {
    const definition = bundledSections.find((entry) => entry.type === section.type);
    if (!definition) throw new Error(`Unknown section ${section.type}`);
    const id = place(definition.golden.tree, nodes, "root");
    const node = nodes[id];
    if (node && section.motion) node.motion = section.motion;
  }
  return { rootNodeId: "root", nodes };
}

const resolved = resolveTheme(defaultTheme());
let baked: BakeResult | undefined;

afterAll(() => {
  if (baked) rmSync(baked.outDir, { recursive: true, force: true });
});

describe("bake: reveals above the fold as CSS", () => {
  it("bakes the fixture", async () => {
    baked = await bakeSite(
      {
        siteName: "Musterstudio",
        baseUrl: "https://beispiel.de",
        pages: [
          // Only a first-screen reveal: nothing is left for a script.
          {
            id: "p-only",
            path: "/nur-css",
            title: "Nur CSS",
            tree: tree([{ type: "hero", motion: { preset: "fade-up", intensity: 6 } }, { type: "stats" }]),
          },
          // A first-screen reveal next to one far down: CSS above, script below.
          {
            id: "p-mixed",
            path: "/gemischt",
            title: "Gemischt",
            tree: tree([
              { type: "hero", motion: { preset: "fade-up-deblur" } },
              { type: "features" },
              { type: "stats" },
              { type: "cta", motion: { preset: "scroll-reveal" } },
            ]),
          },
          // A preset that rebuilds the DOM stays with the script, even in the hero.
          {
            id: "p-masked",
            path: "/maske",
            title: "Maske",
            tree: tree([{ type: "hero", motion: { preset: "masked-headline" } }]),
          },
          // Reduced motion: show the node at rest / a short fade.
          {
            id: "p-policy",
            path: "/richtlinie",
            title: "Richtlinie",
            tree: tree([
              { type: "hero", motion: { preset: "fade-up", reducedMotion: "fade" } },
              { type: "features", motion: { preset: "fade-up", delay: 0.2 } },
            ]),
          },
        ],
        themeCss: emitCss(resolved),
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        profile: "standard",
      },
      { outDir: join(mkdtempSync(join(tmpdir(), "senify-css-entry-")), "dist") },
    );
    expect(baked.outDir).toBeTruthy();
  }, 240000);

  it("ships no payload, pending marker or failsafe for a page that only enters through CSS", async () => {
    if (!baked) throw new Error("bake missing");
    const html = await loadBakedSite(baked.outDir).read("nur-css/index.html");
    expect(html).toContain('data-motion-enter="fade-up"');
    expect(html).toContain("@keyframes senify-enter{");
    expect(html).toMatch(/\[data-node-id="[^"]+"\]\{--senify-enter-y:27\.2px;animation:senify-enter 300ms /);
    expect(html).toContain("@media (prefers-reduced-motion:reduce)");
    expect(html).not.toContain("data-motion-pending");
    expect(html).not.toContain("[data-motion-pending]");
    expect(html).not.toContain("motion-data");
    expect(html).not.toContain("gsap.min.js");
    // No script tag is linked: the smooth-scroll loader below is inline.
    expect(html).not.toMatch(/<script[^>]* src=/);
  }, 60000);

  it("loads smooth scroll late on that page: after the content, after the load event", async () => {
    if (!baked) throw new Error("bake missing");
    const html = await loadBakedSite(baked.outDir).read("nur-css/index.html");
    const loader = html.indexOf('lenis.src="/assets/vendor/lenis.min.js"');
    expect(loader).toBeGreaterThan(-1);
    expect(html).toContain('window.addEventListener("load"');
    // An inline script in the head would wait for the stylesheets before it and
    // hold back the parse of the content; the loader sits behind the content.
    expect(loader).toBeGreaterThan(html.indexOf("</head>"));
    expect(loader).toBeGreaterThan(html.indexOf('data-motion-enter="fade-up"'));
  }, 60000);

  it("splits a mixed page: CSS above the fold, pending marker and script below", async () => {
    if (!baked) throw new Error("bake missing");
    const html = await loadBakedSite(baked.outDir).read("gemischt/index.html");
    expect(html.match(/data-motion-enter="fade-up-deblur"/g)).toHaveLength(1);
    expect(html).toContain("@keyframes senify-enter-deblur{");
    expect(html).toContain("filter:blur(8px)");
    // The reveal below the first two content sections is the script's.
    expect(html.match(/data-motion-pending=""/g)).toHaveLength(1);
    expect(html).toContain("[data-motion-pending]{opacity:0}");
    expect(html).toContain("/assets/page.js");
    // The payload carries the script's reveal only.
    const payload = /<script type="application\/json" id="motion-data">([^<]*)<\/script>/.exec(html)?.[1] ?? "";
    expect(payload).toContain("scroll-reveal");
    expect(payload).not.toContain("fade-up-deblur");
  }, 60000);

  it("keeps a DOM-rebuilding preset on the script path even in the hero", async () => {
    if (!baked) throw new Error("bake missing");
    const html = await loadBakedSite(baked.outDir).read("maske/index.html");
    expect(html).toContain('data-motion-pending=""');
    expect(html).not.toContain("data-motion-enter");
    expect(html).not.toContain("senify-enter");
    expect(html).toContain("masked-headline");
  }, 60000);

  it("writes the reduced-motion policy and the delay of each entry", async () => {
    if (!baked) throw new Error("bake missing");
    const html = await loadBakedSite(baked.outDir).read("richtlinie/index.html");
    expect(html).toContain("@keyframes senify-enter-fade{from{opacity:0}}");
    expect(html).toContain("animation:senify-enter-fade 400ms ease-out backwards");
    expect(html).toMatch(/animation:senify-enter 300ms [^;}]+ 200ms backwards/);
  }, 60000);
});

// Smooth scroll is a site decision (profile). A page whose only motion is a CSS
// entry still gets Lenis on a smooth profile, and stays script-free on `clean`.
describe("bake: a page that only enters through CSS, per smooth-scroll profile", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });
  async function bakeOnly(profile: "standard" | "clean"): Promise<BakeResult> {
    const result = await bakeSite(
      {
        siteName: "Musterstudio",
        baseUrl: "https://beispiel.de",
        pages: [
          {
            id: "p-only",
            path: "/nur-css",
            title: "Nur CSS",
            tree: tree([{ type: "hero", motion: { preset: "fade-up", intensity: 6 } }, { type: "stats" }]),
          },
        ],
        themeCss: emitCss(resolved),
        motionTokens: { ease: resolved.motion.ease, baseDurationMs: 300, baseStaggerMs: 80 },
        profile,
      },
      { outDir: join(mkdtempSync(join(tmpdir(), `senify-css-only-${profile}-`)), "dist") },
    );
    dirs.push(result.outDir);
    return result;
  }

  it("standard: writes the page script and Lenis, and nothing of GSAP", async () => {
    const site = loadBakedSite((await bakeOnly("standard")).outDir);
    expect(await site.exists("assets/page.js")).toBe(true);
    expect(await site.exists("assets/vendor/lenis.min.js")).toBe(true);
    expect(await site.exists("assets/vendor/gsap.min.js")).toBe(false);
    expect(await site.exists("assets/vendor/ScrollTrigger.min.js")).toBe(false);
    expect(await site.exists("assets/vendor/SplitText.min.js")).toBe(false);
    // The script has to cope without GSAP and without a payload on the page.
    expect(await site.read("assets/page.js")).toContain("window.Lenis");
    expect(await site.read("nur-css/index.html")).toContain('lenis.src="/assets/vendor/lenis.min.js"');
  }, 240000);

  it("clean: stays without any script and without runtime files", async () => {
    const site = loadBakedSite((await bakeOnly("clean")).outDir);
    expect(await site.exists("assets/page.js")).toBe(false);
    expect(await site.exists("assets/vendor/lenis.min.js")).toBe(false);
    const html = await site.read("nur-css/index.html");
    expect(html).toContain('data-motion-enter="fade-up"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("lenis");
  }, 240000);
});
