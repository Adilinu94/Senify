import { describe, expect, it } from "vitest";
import { scrubOffset, scrubProgress } from "@senify/editor/canvas";

// Scrub (ticket 19, M6): the slider drives the live frame's scroll offset and
// follows the wheel back. The maths is pure, so both directions are pinned here
// without a browser.

describe("scrub maths", () => {
  it("maps progress to a bounded scroll offset", () => {
    expect(scrubOffset(0, 1000)).toBe(0);
    expect(scrubOffset(0.5, 1000)).toBe(500);
    expect(scrubOffset(1, 1000)).toBe(1000);
    expect(scrubOffset(0.333, 1000)).toBe(333);
    // Out-of-range and broken input stay inside the page.
    expect(scrubOffset(1.5, 1000)).toBe(1000);
    expect(scrubOffset(-1, 1000)).toBe(0);
    expect(scrubOffset(Number.NaN, 1000)).toBe(0);
    expect(scrubOffset(0.5, -5)).toBe(0);
    expect(scrubOffset(0.5, Number.NaN)).toBe(0);
  });

  it("maps a scroll offset back to progress", () => {
    expect(scrubProgress(0, 1000)).toBe(0);
    expect(scrubProgress(250, 1000)).toBe(0.25);
    expect(scrubProgress(2000, 1000)).toBe(1);
    expect(scrubProgress(-3, 1000)).toBe(0);
    expect(scrubProgress(Number.NaN, 1000)).toBe(0);
    // A page without scroll keeps the slider at the start.
    expect(scrubProgress(500, 0)).toBe(0);
  });
});
