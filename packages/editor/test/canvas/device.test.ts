import { describe, expect, it } from "vitest";
import {
  CANVAS_DEVICES,
  canvasFrames,
  canvasStageWidth,
  fitZoom,
  frameSelector,
} from "@senify/editor/canvas";
import { DESIGN_FRAMES, ZOOM_MAX, ZOOM_MIN, clampZoom, designFramesFor } from "@senify/editor";

// Point 1: one frame, for the active device, the size from the shared design
// frames, and a zoom that fits the sheet into a narrow window. Everything here
// is arithmetic, so no browser is needed.

describe("canvas device frame", () => {
  it("gives the active device one frame with its real size", () => {
    const sizes = [
      ["desktop", 1440, 900, null],
      ["tablet", 1023, 768, 1024],
      ["mobile", 390, 844, 640],
    ] as const;
    for (const [device, width, height, mediaMaxWidth] of sizes) {
      const frames = canvasFrames(1, { breakpoint: device });
      expect(frames).toHaveLength(1);
      expect(frames[0]).toMatchObject({ device, width, height, mediaMaxWidth, mode: "design" });
    }
  });

  it("starts on the desktop when no device is named", () => {
    expect(canvasFrames(1).map((frame) => frame.device)).toEqual(["desktop"]);
  });

  it("takes the sheet width and media width from the site's breakpoint pair", () => {
    const own = { tablet: 1200, mobile: 810 };
    const tablet = canvasFrames(1, { breakpoint: "tablet", breakpoints: own });
    expect(tablet[0]?.width).toBe(1024);
    expect(tablet[0]?.mediaMaxWidth).toBe(1200);
    const mobile = canvasFrames(1, { breakpoint: "mobile", breakpoints: own });
    expect(mobile[0]?.width).toBe(390);
    expect(mobile[0]?.mediaMaxWidth).toBe(810);
    // A pair that pushes a sheet's range elsewhere moves the sheet with it.
    const narrow = canvasFrames(1, { breakpoint: "tablet", breakpoints: { tablet: 900, mobile: 600 } });
    expect(narrow[0]?.width).toBe(899);
    const live = canvasFrames(1, { mode: "live", breakpoint: "tablet", breakpoints: own });
    expect(live[0]?.mediaMaxWidth).toBe(1200);
    expect(canvasStageWidth(1, { breakpoint: "tablet", breakpoints: own })).toBe(1024);
  });

  it("scales the frame with the zoom", () => {
    const frames = canvasFrames(0.5, { breakpoint: "tablet" });
    expect(frames[0]?.scale).toBe(0.5);
    expect(canvasStageWidth(0.5)).toBe(DESIGN_FRAMES.desktop.width * 0.5);
    expect(canvasStageWidth(0.5, { breakpoint: "tablet" })).toBe(DESIGN_FRAMES.tablet.width * 0.5);
  });

  it("clamps a zoom into the editor range", () => {
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(canvasFrames(5)[0]?.scale).toBe(ZOOM_MAX);
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

  it("design mode gives one sheet too, not one per device", () => {
    const frames = canvasFrames(0.5, { mode: "design", breakpoint: "tablet" });
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ device: "tablet", mode: "design", scale: 0.5 });
  });

  it("builds a per-device selector", () => {
    expect(CANVAS_DEVICES).toHaveLength(3);
    expect(frameSelector("mobile")).toBe('.senify-canvas__frame[data-device="mobile"]');
  });
});

describe("zoom to fit a narrow window", () => {
  it("fits the sheet of the site's pair, not the default one", () => {
    const own = { tablet: 1600, mobile: 810 };
    const sheet = designFramesFor(own).tablet.width;
    const zoom = fitZoom(1000, { breakpoint: "tablet", breakpoints: own });
    expect(zoom).toBeLessThan(fitZoom(1000, { breakpoint: "tablet" }));
    expect(sheet * zoom).toBeLessThanOrEqual(1000);
    expect(canvasStageWidth(zoom, { breakpoint: "tablet", breakpoints: own })).toBeLessThanOrEqual(1000);
  });

  it("shrinks until the sheet fits", () => {
    const zoom = fitZoom(1000);
    expect(zoom).toBeLessThan(1);
    expect(canvasStageWidth(zoom)).toBeLessThanOrEqual(1000);
  });

  it("fits the device that is shown", () => {
    // A phone sheet is far narrower than the desktop one: it takes a larger zoom.
    expect(fitZoom(1000, { breakpoint: "mobile" })).toBeGreaterThan(fitZoom(1000));
    expect(fitZoom(1000, { breakpoint: "tablet" })).toBeGreaterThan(fitZoom(1000));
  });

  it("keeps a margin on both sides", () => {
    const zoom = fitZoom(1000, { margin: 24 });
    expect(zoom).toBe(0.661);
    expect(DESIGN_FRAMES.desktop.width * zoom + 48).toBeLessThanOrEqual(1000);
  });

  it("never goes below the smallest allowed zoom", () => {
    expect(fitZoom(300)).toBe(ZOOM_MIN);
    expect(fitZoom(0)).toBe(ZOOM_MIN);
  });

  it("never exceeds the largest allowed zoom", () => {
    expect(fitZoom(100000)).toBe(ZOOM_MAX);
  });
});
