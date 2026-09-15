import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  motionConfigsForTree,
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
        { id: "e", preset: "tilt-card" },
      ]),
      TOKENS,
    );
    expect(configs).toHaveLength(4);
    expect(warnings.some((w) => w.preset === "tilt-card")).toBe(true);
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
