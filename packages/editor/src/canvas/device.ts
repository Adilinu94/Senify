// Canvas device frames (Phase 0, fourth slice).
//
// One frame per device state — desktop, tablet, mobile — with the same
// breakpoints as the release and the bake. The numbers are not written down
// here: they come from `../frames.ts`, whose `mediaMaxWidthFor` reads the one
// shared source (`@senify/renderer/breakpoints`). Frame size, zoom and the
// zoom-to-fit for narrow windows are plain arithmetic, so they are unit-tested
// without a browser.
//
// The zoom keeps the editor-usable range of `frames.ts` (0.25 … 2); the canvas
// only adds the fit that makes all three sheets visible in a small window.

import {
  DESIGN_FRAMES,
  FRAME_BREAKPOINTS,
  FRAME_GAP,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  mediaMaxWidthFor,
} from "../frames.ts";
import type { FrameBreakpoint } from "../types.ts";

export type CanvasDevice = FrameBreakpoint;

export const CANVAS_DEVICES: readonly CanvasDevice[] = FRAME_BREAKPOINTS;

export type CanvasFrameSpec = {
  device: CanvasDevice;
  label: string;
  width: number;
  height: number;
  scale: number;
  mediaMaxWidth: number | null;
};

// The three sheets side by side, all at the same zoom.
export function canvasFrames(zoom: number): CanvasFrameSpec[] {
  const scale = clampZoom(zoom);
  return CANVAS_DEVICES.map((device) => {
    const size = DESIGN_FRAMES[device];
    return {
      device,
      label: size.label,
      width: size.width,
      height: size.height,
      scale,
      mediaMaxWidth: mediaMaxWidthFor(device),
    };
  });
}

// The stage width the three frames occupy at that zoom (gaps included).
export function canvasStageWidth(zoom: number, gap = FRAME_GAP): number {
  return (
    canvasFrames(zoom).reduce((sum, frame) => sum + frame.width * frame.scale, 0) +
    gap * (CANVAS_DEVICES.length - 1)
  );
}

export type FitOptions = { gap?: number; margin?: number };

// The largest allowed zoom at which all frames fit into `availableWidth`.
// Used when the window is narrower than the sheets, so nothing overflows and
// the user still sees the whole page.
export function fitZoom(availableWidth: number, options: FitOptions = {}): number {
  const gap = options.gap ?? FRAME_GAP;
  const margin = options.margin ?? 0;
  const gaps = gap * (CANVAS_DEVICES.length - 1);
  const natural = CANVAS_DEVICES.reduce(
    (sum, device) => sum + DESIGN_FRAMES[device].width,
    0,
  );
  const usable = availableWidth - gaps - margin * 2;
  if (natural <= 0 || usable <= 0) return ZOOM_MIN;
  return clampZoom(usable / natural);
}

export function frameSelector(device: CanvasDevice): string {
  return `.senify-canvas__frame[data-device="${device}"]`;
}

export { ZOOM_MIN, ZOOM_MAX, clampZoom };
