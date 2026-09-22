import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  motionConfigsForTree,
  motionDataFor,
  motionEffectCss,
  pageEffectsForTree,
  pageTransitionCss,
  parseDurationMs,
  renderIslandsScript,
  renderPageScript,
} from "@senify/renderer";
import type { NodeTree } from "@senify/section-sdk";

const TOKENS = { ease: { snappy: "cubic-bezier(0.22, 1, 0.36, 1)" }, baseDurationMs: 300, baseStaggerMs: 80 };

function treeWithMotion(
  motions: { id: string; preset: string; intensity?: number }[],
): NodeTree {
  const nodes: NodeTree["nodes"] = {
    root: { id: "root", type: "page", props: {}, children: motions.map((m) => m.id) },
  };
  for (const motion of motions) {
    nodes[motion.id] = {
      id: motion.id,
      type: "block",
      props: {},
      motion: {
        preset: motion.preset,
        intensity: motion.intensity,
        tokens: { ease: "snappy", durationScale: 1, stagger: 1 },
      },
    };
  }
  return { rootNodeId: "root", nodes };
}

describe("motion configs", () => {
  it("maps A–C presets with resolved tokens", () => {
    const { configs, warnings } = motionConfigsForTree(
      treeWithMotion([{ id: "a", preset: "fade-up", intensity: 6 }]),
      TOKENS,
    );
    expect(warnings).toEqual([]);
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      nodeId: "a",
      preset: "fade-up",
      intensity: 6,
      trigger: "viewport",
      ease: "cubic-bezier(0.22, 1, 0.36, 1)",
      duration: 0.3,
    });
  });

  it("warns on unimplemented presets and pin/char-split excess", () => {
    const { configs, warnings } = motionConfigsForTree(
      treeWithMotion([
        { id: "a", preset: "scrub-pin" },
        { id: "b", preset: "sticky-stack" },
        { id: "c", preset: "char-split" },
        { id: "d", preset: "char-split" },
        { id: "e", preset: "webgl-scene" },
      ]),
      TOKENS,
    );
    expect(configs).toHaveLength(4);
    expect(warnings.some((w) => w.preset === "webgl-scene")).toBe(true);
    expect(warnings.some((w) => w.message.includes("pin presets"))).toBe(true);
    expect(warnings.some((w) => w.message.includes("char-split"))).toBe(true);
  });

  it("marks marquee configs as css-only", () => {
    const { configs } = motionConfigsForTree(
      treeWithMotion([{ id: "m", preset: "marquee" }]),
      TOKENS,
    );
    expect(configs[0]?.cssOnly).toBe(true);
  });

  it("carries the registry flags into the config", () => {
    const { configs } = motionConfigsForTree(
      treeWithMotion([
        { id: "headline", preset: "masked-headline" },
        { id: "counter", preset: "counter" },
        { id: "pin", preset: "scrub-pin" },
      ]),
      TOKENS,
    );
    const headline = configs.find((config) => config.nodeId === "headline");
    expect(headline?.hides).toBe(true);
    expect(headline?.needs).toEqual(["splittext"]);
    expect(headline?.reducedMotion).toBe("static");
    const counter = configs.find((config) => config.nodeId === "counter");
    expect(counter?.hides).toBeUndefined();
    expect(counter?.needs).toBeUndefined();
    expect(configs.find((config) => config.nodeId === "pin")?.needs).toEqual([
      "scrolltrigger",
    ]);
  });

  it("emits nothing for a disabled spec", () => {
    const tree = treeWithMotion([{ id: "a", preset: "fade-up" }]);
    const node = tree.nodes["a"];
    if (node) node.motion = { preset: "fade-up", enabled: false };
    const { configs, warnings } = motionConfigsForTree(tree, TOKENS);
    expect(configs).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("skips island presets silently (the island is the implementation)", () => {
    const { configs, warnings } = motionConfigsForTree(
      treeWithMotion([
        { id: "a", preset: "modal" },
        { id: "b", preset: "accordion" },
      ]),
      TOKENS,
    );
    expect(configs).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("carries the pointer presets into the page script without plugins", () => {
    const { configs, warnings } = motionConfigsForTree(
      treeWithMotion([
        { id: "a", preset: "magnetic-button" },
        { id: "b", preset: "tilt-card" },
        { id: "c", preset: "cursor-glow" },
      ]),
      TOKENS,
    );
    expect(warnings).toEqual([]);
    expect(configs.map((config) => config.preset)).toEqual([
      "magnetic-button",
      "tilt-card",
      "cursor-glow",
    ]);
    expect(configs.every((config) => config.needs === undefined)).toBe(true);
  });

  it("wraps configs into the versioned v2 envelope with central breakpoints", () => {
    const { configs } = motionConfigsForTree(
      treeWithMotion([{ id: "a", preset: "fade-up" }]),
      TOKENS,
    );
    const data = motionDataFor(configs);
    expect(data.v).toBe(2);
    expect(data.entries).toHaveLength(1);
    // The queries come from the widget engine's one breakpoint definition.
    expect(data.breakpoints.tablet).toBe("(max-width: 1023.98px)");
    expect(data.breakpoints.mobile).toBe("(max-width: 639.98px)");
  });

  it("reads both payload shapes, honours the kill-switch and releases pending", () => {
    const script = renderPageScript({ lenis: false });
    expect(script).toContain('window.__SENIFY_MOTION__ === "off"');
    expect(script).toContain("releasePending");
    expect(script).toContain("data-motion-pending");
    expect(script).toContain("Array.isArray(payload) ? payload : (payload.entries || [])");
    expect(script).toContain('config.reducedMotion || "static"');
    expect(script).toContain("fadeIn");
    expect(script).toContain("has[config.needs[index]]");
  });

  it("emits the same script for the same input", () => {
    expect(renderPageScript({ lenis: true })).toBe(renderPageScript({ lenis: true }));
  });

  it("warns softly when a reveal runs past the 800 ms budget", () => {
    const tree = treeWithMotion([{ id: "a", preset: "fade-up" }]);
    const node = tree.nodes["a"];
    if (node) node.motion = { preset: "fade-up", tokens: { durationScale: 3 } };
    // baseDurationMs 300 → 0.9 s.
    const { warnings } = motionConfigsForTree(tree, TOKENS);
    expect(warnings.some((warning) => warning.code === "reveal-too-long")).toBe(true);
  });

  it("clamps intensity to the 1–10 dial with a warning", () => {
    const { configs, warnings } = motionConfigsForTree(
      treeWithMotion([{ id: "a", preset: "fade-up", intensity: 99 }]),
      TOKENS,
    );
    expect(configs[0]?.intensity).toBe(10);
    expect(warnings.some((w) => w.message.includes("clamped"))).toBe(true);
  });

  it("parses durations", () => {
    expect(parseDurationMs("300ms")).toBe(300);
    expect(parseDurationMs("0.6s")).toBe(600);
    expect(() => parseDurationMs("soon")).toThrow();
  });

  it("emits a page script with lenis wiring", () => {
    const withLenis = renderPageScript({ lenis: true });
    expect(withLenis).toContain("new window.Lenis");
    expect(withLenis).toContain("prefers-reduced-motion");
    expect(withLenis).toContain("pointer: coarse");
    expect(withLenis).toContain('getElementById("motion-data")');
    expect(withLenis).toContain("cssOnly");
    const without = renderPageScript({ lenis: false });
    expect(without).not.toContain("new window.Lenis");
  });

  it("escapes injected text in split presets", () => {
    const script = renderPageScript({ lenis: false });
    expect(script).toContain("escapeHtml");
    expect(script).toContain("&amp;");
    expect(script).toContain("&lt;");
  });

  it("emits syntactically valid scripts", () => {
    const dir = mkdtempSync(join(tmpdir(), "senify-js-"));
    try {
      const pageJs = join(dir, "page.js");
      const islandsJs = join(dir, "islands.js");
      writeFileSync(pageJs, renderPageScript({ lenis: true }));
      writeFileSync(
        islandsJs,
        renderIslandsScript(
          new Set(["menu", "slider", "consent", "billing", "dismiss", "accordion", "webgl-scene"]),
        ),
      );
      execFileSync(process.execPath, ["--check", pageJs]);
      execFileSync(process.execPath, ["--check", islandsJs]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits islands only for requested kinds", () => {
    expect(renderIslandsScript(new Set())).toBe("");
    const script = renderIslandsScript(new Set(["menu", "consent"]));
    expect(script).toContain('data-island="menu"');
    expect(script).toContain('data-island="consent"');
    expect(script).not.toContain('data-island="slider"');
  });
});

describe("page transitions (document presets)", () => {
  it("collects the document preset once and keeps it out of the per-node configs", () => {
    const tree = treeWithMotion([{ id: "hero", preset: "page-fade", intensity: 9 }]);
    const { configs, warnings } = motionConfigsForTree(tree, TOKENS);
    // The page transition is page-level CSS: no entry, no unimplemented warning.
    expect(configs).toEqual([]);
    expect(warnings).toEqual([]);
    const { transition, css, preloader, warnings: effectWarnings } = pageEffectsForTree(tree);
    expect(transition).toEqual({
      preset: "page-fade",
      intensity: 9,
      reducedMotion: "static",
    });
    expect(css).toBe("");
    expect(preloader).toBe(false);
    expect(effectWarnings).toEqual([]);
  });

  it("warns on a second transition and ignores disabled specs", () => {
    const tree = treeWithMotion([
      { id: "a", preset: "page-fade" },
      { id: "b", preset: "page-fade", intensity: 4 },
    ]);
    const { transition, warnings } = pageEffectsForTree(tree);
    expect(transition).toMatchObject({ preset: "page-fade", intensity: 5 });
    expect(warnings.map((warning) => warning.code)).toEqual(["document-excess"]);
    expect(warnings[0]?.nodeId).toBe("b");

    const disabled = treeWithMotion([{ id: "a", preset: "page-fade" }]);
    const node = disabled.nodes["a"];
    if (node) node.motion = { preset: "page-fade", enabled: false };
    expect(pageEffectsForTree(disabled)).toMatchObject({
      transition: null,
      css: "",
      preloader: false,
      warnings: [],
    });
  });

  it("emits the opt-in with intensity duration and reduced-motion gates", () => {
    const staticCss = pageTransitionCss({
      preset: "page-fade",
      intensity: 1,
      reducedMotion: "static",
    });
    expect(staticCss).toContain("@view-transition { navigation: auto; }");
    expect(staticCss).toContain("animation-duration: 0.30s");
    expect(staticCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(staticCss).toContain("animation: none !important");

    const fadeCss = pageTransitionCss({
      preset: "page-fade",
      intensity: 10,
      reducedMotion: "fade",
    });
    expect(fadeCss).toContain("animation-duration: 0.50s");
    expect(fadeCss).toContain("animation-duration: 0.2s");
    expect(fadeCss).not.toContain("none !important");

    const offCss = pageTransitionCss({
      preset: "page-fade",
      intensity: 5,
      reducedMotion: "off",
    });
    expect(offCss).not.toContain("prefers-reduced-motion");
  });
});

describe("pure-CSS effects and the preloader (document presets)", () => {
  it("collects each CSS effect once (first intensity wins) and builds its block", () => {
    const tree = treeWithMotion([
      { id: "a", preset: "hover-lift", intensity: 3 },
      { id: "b", preset: "hover-lift", intensity: 9 },
      { id: "c", preset: "ambient-float" },
      { id: "d", preset: "grain" },
    ]);
    const { css, preloader, warnings } = pageEffectsForTree(tree);
    expect(warnings).toEqual([]);
    expect(preloader).toBe(false);
    // One block per preset: the first spec decides the intensity.
    expect(css.match(/data-motion="hover-lift"/g)?.length).toBe(5);
    expect(css).toContain("translateY(-3.3px)");
    expect(css).not.toContain("translateY(-8px)");
    expect(css).toContain("senify-float");
    expect(css).toContain("senify-grain");
    // The loops guardrail: every block carries the reduced-motion gate.
    expect(css.match(/prefers-reduced-motion/g)?.length).toBe(3);
  });

  it("keeps the CSS effects out of the per-node configs", () => {
    const tree = treeWithMotion([{ id: "a", preset: "hover-lift" }]);
    const { configs, warnings } = motionConfigsForTree(tree, TOKENS);
    expect(configs).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("flags the preloader and ignores a second one", () => {
    const tree = treeWithMotion([
      { id: "a", preset: "preloader-light" },
      { id: "b", preset: "preloader-light" },
    ]);
    const { preloader, css, warnings } = pageEffectsForTree(tree);
    expect(preloader).toBe(true);
    expect(css).toBe("");
    expect(warnings).toEqual([]);
  });

  it("builds every block with the intensity dial and the RM gate", () => {
    const low = motionEffectCss("hover-lift", 1);
    const high = motionEffectCss("hover-lift", 10);
    expect(low).toContain("translateY(-2px)");
    expect(high).toContain("translateY(-8px)");
    expect(motionEffectCss("ambient-float", 1)).toContain("senify-float 19s");
    expect(motionEffectCss("grain", 1)).toContain("senify-grain 7s");
    expect(motionEffectCss("fade-up", 5)).toBe("");
  });
});
