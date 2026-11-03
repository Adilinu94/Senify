import { describe, expect, it } from "vitest";
import { captureHtml, readAppearTween } from "@senify/framer-import";

function sample(variants: Record<string, unknown>) {
  const html = `<script id="__framer__appearAnimationsContent">${JSON.stringify({ a: variants })}</script><div id="main"><div data-framer-appear-id="a">Text</div></div>`;
  const item = captureHtml({ html }).motion[0];
  if (item === undefined) throw new Error("sample fehlt");
  return item;
}

const tween = { initial: { opacity: 0.001, y: 28 }, animate: { opacity: 1, y: 0, transition: { type: "tween", delay: 0.2, duration: 1, ease: [0.22, 1, 0.36, 1] } } };

describe("readAppearTween", () => {
  it("carries original values and identical breakpoint variants", () => {
    const result = readAppearTween(sample({ default: tween, mobile: tween }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tween.from.opacity).toBe(0.001);
    expect(result.tween.from.y).toBe(28);
    expect(result.tween.durationMs).toBe(1000);
    expect(result.tween.delayMs).toBe(200);
    expect(result.tween.easing).toEqual([0.22, 1, 0.36, 1]);
  });

  it("rejects unequal variants, unknown properties and spring physics", () => {
    expect(readAppearTween(sample({ default: tween, phone: { ...tween, initial: { y: 40 } } })).ok).toBe(false);
    expect(readAppearTween(sample({ default: { ...tween, initial: { filter: "blur(10px)" } } })).ok).toBe(false);
    expect(readAppearTween(sample({ default: { ...tween, animate: { ...tween.animate, transition: { type: "spring" } } } })).ok).toBe(false);
  });

  it("rejects invalid curves and excessive numbers", () => {
    expect(readAppearTween(sample({ default: { ...tween, animate: { ...tween.animate, transition: { ...tween.animate.transition, ease: [2, 1, 0.5, 1] } } } })).ok).toBe(false);
    expect(readAppearTween(sample({ default: { ...tween, initial: { y: 10001 } } })).ok).toBe(false);
  });
});
