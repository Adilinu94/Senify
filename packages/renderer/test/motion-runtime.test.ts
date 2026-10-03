import { describe, expect, it } from "vitest";
import { renderPageScript } from "../src/motion.ts";

// The page script is a string; its pure helpers are lifted out and run here so
// the number handling has a regression net without a browser.
function counterHelpers(lang: string): {
  countFormat: (raw: string) => { goal: number; decimals: number; group: string; decimal: string };
  countText: (value: number, format: { decimals: number; group: string; decimal: string }) => string;
} {
  const script = renderPageScript({ lenis: false });
  const start = script.indexOf("function countFormat(");
  const end = script.indexOf("function triggerProps(");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const factory = new Function("document", `${script.slice(start, end)}\nreturn { countFormat, countText };`);
  return factory({ documentElement: { lang } }) as ReturnType<typeof counterHelpers>;
}

// The final text of an animated counter must equal what the author typed.
function finalText(lang: string, raw: string): string {
  const { countFormat, countText } = counterHelpers(lang);
  const format = countFormat(raw);
  return countText(format.goal, format);
}

describe("counter number format", () => {
  it.each([
    ["de", "98,5", 98.5],
    ["de", "1.234", 1234],
    ["de", "12.500", 12500],
    ["de", "12500", 12500],
    ["de", "1.234,56", 1234.56],
    ["de", "3.5", 3.5],
    ["en", "1,234", 1234],
    ["en", "1,234.56", 1234.56],
    ["en", "3.500", 3.5],
    ["en", "0.125", 0.125],
    ["de", "-5", -5],
  ])("%s: %s keeps its value and its written form", (lang, raw, goal) => {
    expect(counterHelpers(lang).countFormat(raw).goal).toBeCloseTo(goal, 6);
    expect(finalText(lang, raw)).toBe(raw);
  });
});

describe("page script robustness", () => {
  const script = renderPageScript({ lenis: false });

  it("re-evaluates function-based tween values when ScrollTrigger refreshes", () => {
    // Without invalidateOnRefresh a resize or rotation keeps the old pixel distance.
    expect(script).toMatch(/horizontal-pan[\s\S]*?pin: true, invalidateOnRefresh: true/);
    expect(script).toMatch(/parallax-subtle[\s\S]*?scrub: true, invalidateOnRefresh: true/);
  });

  it("splits headings with SplitText so inline markup and the accessible name survive", () => {
    expect(script).toContain("SplitText.create");
    expect(script).toContain('aria: "auto"');
  });

  it("one failing preset does not stop the others", () => {
    expect(script).toMatch(/try \{\s*runPreset\(el, config\);\s*\} catch/);
  });
});
