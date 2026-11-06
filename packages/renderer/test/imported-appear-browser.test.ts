import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { motionConfigsForTree, motionDataFor, renderPageScript } from "@senify/renderer";
import type { NodeTree } from "@senify/section-sdk";

describe("imported appear playback", () => {
  it("matches the source WAAPI curve at multiple times without GSAP", async () => {
    const tween = { from: { opacity: 0.001, x: 0, y: 28, scale: 1 }, to: { opacity: 1, x: 0, y: 0, scale: 1 }, durationMs: 1000, delayMs: 200, easing: [0.22, 1, 0.36, 1] as [number, number, number, number] };
    const tree: NodeTree = { rootNodeId: "root", nodes: { root: { id: "root", type: "page", props: {}, children: ["example"] }, example: { id: "example", type: "frame", props: {}, motion: { preset: "imported-appear", trigger: "load", importedAppear: tween } } } };
    const { configs } = motionConfigsForTree(tree, { ease: {}, baseDurationMs: 300, baseStaggerMs: 80 });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ reducedMotion: "no-preference" });
      await page.setContent(`<div id="source"></div><div data-node-id="example"></div><script id="motion-data" type="application/json">${JSON.stringify(motionDataFor(configs))}</script>`);
      await page.evaluate(`document.querySelector("#source").animate([{ opacity: 0.001, transform: "translateY(28px)" }, { opacity: 1, transform: "none" }], { duration: 1000, delay: 200, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "both" })`);
      await page.evaluate(renderPageScript({ lenis: false }));
      const samples = await page.evaluate(`(() => {
        const source = document.querySelector("#source");
        const target = document.querySelector('[data-node-id="example"]');
        const a = source.getAnimations()[0]; const b = target.getAnimations()[0];
        if (!a || !b) throw new Error("missing animation");
        a.pause(); b.pause();
        return [0, 200, 350, 700, 1200].map((time) => {
          a.currentTime = time; b.currentTime = time;
          const original = getComputedStyle(source); const local = getComputedStyle(target);
          return { originalOpacity: Number(original.opacity), localOpacity: Number(local.opacity), originalY: new DOMMatrixReadOnly(original.transform).m42, localY: new DOMMatrixReadOnly(local.transform).m42 };
        });
      })()`) as { originalOpacity: number; localOpacity: number; originalY: number; localY: number }[];
      for (const value of samples) {
        expect(value.localOpacity).toBeCloseTo(value.originalOpacity, 4);
        expect(value.localY).toBeCloseTo(value.originalY, 4);
      }
    } finally { await browser.close(); }
  }, 30000);
});
