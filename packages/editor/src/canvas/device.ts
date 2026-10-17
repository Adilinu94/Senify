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

import type { Breakpoints } from "@senify/widget-engine/breakpoints";
import {
  FRAME_BREAKPOINTS,
  FRAME_GAP,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  designFramesFor,
  mediaMaxWidthFor,
} from "../frames.ts";
import type { EditorMode, FrameBreakpoint } from "../types.ts";

export type CanvasDevice = FrameBreakpoint;

export const CANVAS_DEVICES: readonly CanvasDevice[] = FRAME_BREAKPOINTS;

export type CanvasFrameSpec = {
  device: CanvasDevice;
  label: string;
  mode: EditorMode;
  // null = live mode: the frame fills the stage at real size (100 %), so the
  // page scrolls natively inside the frame.
  width: number | null;
  height: number | null;
  scale: number;
  mediaMaxWidth: number | null;
};

export type CanvasFramesOptions = {
  mode?: EditorMode;
  // The breakpoint the live frame renders at (M4 Stufe 1: the real page at the
  // chosen device width).
  breakpoint?: FrameBreakpoint;
  // The site's own breakpoint pair (ADR-0020); absent: the platform default.
  // It sets the width of every sheet and the media query it answers to.
  breakpoints?: Breakpoints | null;
};

// The three sheets side by side, all at the same zoom. In live mode one frame
// fills the stage: real size, native scroll, the responsive rules of the active
// breakpoint — the release behaviour, not an editor approximation.
export function canvasFrames(
  zoom: number,
  options: CanvasFramesOptions = {},
): CanvasFrameSpec[] {
  if ((options.mode ?? "design") === "live") {
    const breakpoint = options.breakpoint ?? "desktop";
    return [
      {
        device: breakpoint,
        label: "Live",
        mode: "live",
        width: null,
        height: null,
        scale: 1,
        mediaMaxWidth: mediaMaxWidthFor(breakpoint, options.breakpoints),
      },
    ];
  }
  const scale = clampZoom(zoom);
  const sizes = designFramesFor(options.breakpoints);
  return CANVAS_DEVICES.map((device) => {
    const size = sizes[device];
    return {
      device,
      label: size.label,
      mode: "design" as const,
      width: size.width,
      height: size.height,
      scale,
      mediaMaxWidth: mediaMaxWidthFor(device, options.breakpoints),
    };
  });
}

// The stage width the three design frames occupy at that zoom (gaps included).
export function canvasStageWidth(
  zoom: number,
  gap = FRAME_GAP,
  breakpoints?: Breakpoints | null,
): number {
  return (
    canvasFrames(zoom, { breakpoints }).reduce(
      (sum, frame) => sum + (frame.width ?? 0) * frame.scale,
      0,
    ) +
    gap * (CANVAS_DEVICES.length - 1)
  );
}

export type FitOptions = { gap?: number; margin?: number; breakpoints?: Breakpoints | null };

// The largest allowed zoom at which all frames fit into `availableWidth`.
// Used when the window is narrower than the sheets, so nothing overflows and
// the user still sees the whole page. Rounds DOWN to three decimals — a
// commercially rounded zoom can overshoot the available width by a few pixels.
export function fitZoom(availableWidth: number, options: FitOptions = {}): number {
  const gap = options.gap ?? FRAME_GAP;
  const margin = options.margin ?? 0;
  const gaps = gap * (CANVAS_DEVICES.length - 1);
  const sizes = designFramesFor(options.breakpoints);
  const natural = CANVAS_DEVICES.reduce((sum, device) => sum + sizes[device].width, 0);
  const usable = availableWidth - gaps - margin * 2;
  if (natural <= 0 || usable <= 0) return ZOOM_MIN;
  const raw = usable / natural;
  if (raw >= ZOOM_MAX) return ZOOM_MAX;
  return clampZoom(Math.floor(raw * 1000) / 1000);
}

export function frameSelector(device: CanvasDevice): string {
  return `.senify-canvas__frame[data-device="${device}"]`;
}

export { ZOOM_MIN, ZOOM_MAX, clampZoom };
