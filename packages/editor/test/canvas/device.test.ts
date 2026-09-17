import { describe, expect, it } from "vitest";
import {
  CANVAS_DEVICES,
  canvasFrames,
  canvasStageWidth,
  fitZoom,
  frameSelector,
} from "@senify/editor/canvas";
import { DESIGN_FRAMES, FRAME_GAP, ZOOM_MAX, ZOOM_MIN, clampZoom } from "@senify/editor";

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
    expect(frames.map((frame) => frame.width)).toEqual([1440, 768, 390]);
    expect(frames.map((frame) => frame.height)).toEqual([900, 1024, 844]);
    // Only the narrower devices carry a media max width; desktop fills the stage.
    expect(frames.map((frame) => frame.mediaMaxWidth)).toEqual([null, 1024, 640]);
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

  it("builds a per-device selector", () => {
    expect(CANVAS_DEVICES).toHaveLength(3);
    expect(frameSelector("mobile")).toBe('.senify-canvas__frame[data-device="mobile"]');
  });
});

describe("zoom to fit a narrow window", () => {
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
