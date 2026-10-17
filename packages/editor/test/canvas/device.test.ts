import { describe, expect, it } from "vitest";
import {
  CANVAS_DEVICES,
  canvasFrames,
  canvasStageWidth,
  fitZoom,
  frameSelector,
} from "@senify/editor/canvas";
import { DESIGN_FRAMES, FRAME_GAP, ZOOM_MAX, ZOOM_MIN, clampZoom, designFramesFor } from "@senify/editor";

// Point 1: one frame per device state, the size from the shared design frames,
// and a zoom that fits the sheets into a narrow window. Everything here is
// arithmetic, so no browser is needed.

const NATURAL_WIDTH =
  DESIGN_FRAMES.desktop.width + DESIGN_FRAMES.tablet.width + DESIGN_FRAMES.mobile.width;

describe("canvas device frames", () => {
  it("gives every device its own frame with the real size", () => {
    const frames = canvasFrames(1);
    expect(frames.map((frame) => frame.device)).toEqual([
      "desktop",
      "tablet",
      "mobile",
    ]);
    expect(frames.map((frame) => frame.width)).toEqual([1440, 1023, 390]);
    expect(frames.map((frame) => frame.height)).toEqual([900, 768, 844]);
    // Only the narrower devices carry a media max width; desktop fills the stage.
    expect(frames.map((frame) => frame.mediaMaxWidth)).toEqual([null, 1024, 640]);
  });

  it("takes the sheet widths and media widths from the site's breakpoint pair", () => {
    const own = { tablet: 1200, mobile: 810 };
    const frames = canvasFrames(1, { breakpoints: own });
    expect(frames.map((frame) => frame.width)).toEqual([1440, 1024, 390]);
    expect(frames.map((frame) => frame.mediaMaxWidth)).toEqual([null, 1200, 810]);
    // A pair that pushes a sheet's range elsewhere moves the sheet with it.
    const narrow = canvasFrames(1, { breakpoints: { tablet: 900, mobile: 600 } });
    expect(narrow.map((frame) => frame.width)).toEqual([1440, 899, 390]);
    const live = canvasFrames(1, { mode: "live", breakpoint: "tablet", breakpoints: own });
    expect(live[0]?.mediaMaxWidth).toBe(1200);
    expect(canvasStageWidth(1, FRAME_GAP, own)).toBe(1440 + 1024 + 390 + FRAME_GAP * 2);
  });

  it("scales every frame with the same zoom", () => {
    const frames = canvasFrames(0.5);
    expect(frames.every((frame) => frame.scale === 0.5)).toBe(true);
    expect(canvasStageWidth(0.5)).toBe(NATURAL_WIDTH * 0.5 + FRAME_GAP * 2);
  });

  it("clamps a zoom into the editor range", () => {
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(canvasFrames(5).every((frame) => frame.scale === ZOOM_MAX)).toBe(true);
  });

  it("live mode gives one real-size frame for the active breakpoint", () => {
    const frames = canvasFrames(1, { mode: "live", breakpoint: "mobile" });
    expect(frames).toHaveLength(1);
    expect(frames[0]?.device).toBe("mobile");
    expect(frames[0]?.mode).toBe("live");
    expect(frames[0]?.label).toBe("Live");
    // Real size: the frame fills the stage and scrolls natively (M4 Stufe 1).
    expect(frames[0]?.width).toBeNull();
    expect(frames[0]?.height).toBeNull();
    expect(frames[0]?.scale).toBe(1);
    // The responsive rules of the chosen device still apply.
    expect(frames[0]?.mediaMaxWidth).toBe(640);
  });

  it("design mode keeps the three sheets, the live switch stays out", () => {
    const frames = canvasFrames(0.5, { mode: "design", breakpoint: "tablet" });
    expect(frames).toHaveLength(3);
    expect(frames.map((frame) => frame.mode)).toEqual(["design", "design", "design"]);
    expect(frames.every((frame) => frame.scale === 0.5)).toBe(true);
  });

  it("builds a per-device selector", () => {
    expect(CANVAS_DEVICES).toHaveLength(3);
    expect(frameSelector("mobile")).toBe('.senify-canvas__frame[data-device="mobile"]');
  });
});

describe("zoom to fit a narrow window", () => {
  it("fits the sheets of the site's pair, not the default ones", () => {
    const own = { tablet: 1600, mobile: 810 };
    const sizes = designFramesFor(own);
    const natural = sizes.desktop.width + sizes.tablet.width + sizes.mobile.width;
    const zoom = fitZoom(3000, { breakpoints: own });
    expect(zoom).toBeLessThan(fitZoom(3000));
    expect(natural * zoom + FRAME_GAP * 2).toBeLessThanOrEqual(3000);
    expect(canvasStageWidth(zoom, FRAME_GAP, own)).toBeLessThanOrEqual(3000);
  });

  it("shrinks until all three sheets fit", () => {
    const zoom = fitZoom(3000, { gap: FRAME_GAP });
    expect(zoom).toBeLessThan(1.2);
    expect(canvasStageWidth(zoom)).toBeLessThanOrEqual(3000);
  });

  it("never goes below the smallest allowed zoom", () => {
    expect(fitZoom(600)).toBe(ZOOM_MIN);
    expect(fitZoom(0)).toBe(ZOOM_MIN);
  });

  it("never exceeds the largest allowed zoom", () => {
    expect(fitZoom(100000)).toBe(ZOOM_MAX);
  });
});
