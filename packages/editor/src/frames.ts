import { SenifyError } from "@senify/core";
import { resolveBreakpoints, type Breakpoints } from "@senify/widget-engine/breakpoints";
import type { Node, NodeTree, PropValue } from "@senify/section-sdk";
import {
  isOverrideBreakpoint,
  type EditorMode,
  type FrameBreakpoint,
  type OverrideBreakpoint,
} from "./types.ts";

// The frame manager is the biggest home-grown block of the editor
// (artifacts/24 §1): one iframe per breakpoint side by side, all editable,
// plus a single real-size frame in live mode. These descriptors are the
// headless heart of it — the DOM shell only instantiates them.
export const FRAME_BREAKPOINTS: readonly FrameBreakpoint[] = [
  "desktop",
  "tablet",
  "mobile",
];

export const DESIGN_ZOOM_START = 0.5;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;
export const FRAME_GAP = 32;

type DesignSize = { label: string; width: number; height: number };

// The sheets are real iframes, so the media queries inside them answer to the
// sheet's own width. A sheet therefore has to lie inside the range its device
// owns, and that range comes from the site's breakpoint pair (ADR-0020):
//
//   - mobile owns widths below `mobile`; the phone width 390 when it fits, else
//     the widest width the range still holds,
//   - tablet owns `mobile` up to `tablet` (exclusive, the query reads
//     `max-width: tablet - 0.02`); the usual 1024 when it lies inside, else the
//     nearest width that does,
//   - desktop owns everything from `tablet` up; 1440, or the tablet number when
//     the site's tablet range reaches beyond it.
//
// With the platform default (1024 / 640) that is 1440 / 1023 / 390. The tablet
// sheet used to be 1024 wide, where the tablet query is already off, so the
// sheet showed the desktop layout.
const PHONE_WIDTH = 390;
const TABLET_WIDTH = 1024;
const DESKTOP_WIDTH = 1440;

export function designFramesFor(
  site?: Breakpoints | null,
): Record<FrameBreakpoint, DesignSize> {
  const breakpoints = resolveBreakpoints(site);
  const tablet = Math.min(Math.max(TABLET_WIDTH, breakpoints.mobile), breakpoints.tablet - 1);
  return {
    desktop: { label: "Desktop", width: Math.max(DESKTOP_WIDTH, breakpoints.tablet), height: 900 },
    tablet: { label: "Tablet", width: tablet, height: 768 },
    mobile: { label: "Mobile", width: Math.min(PHONE_WIDTH, breakpoints.mobile - 1), height: 844 },
  };
}

// The sheets of a site without its own pair.
export const DESIGN_FRAMES: Record<FrameBreakpoint, DesignSize> = designFramesFor();

export type FrameView = {
  zoom: number;
  pan: { x: number; y: number };
};

export type FrameState = {
  mode: EditorMode;
  activeBreakpoint: FrameBreakpoint;
  selectedNodeId: string | null;
  // Design and live keep their own viewport so switching modes is lossless.
  design: FrameView;
  live: FrameView;
};

export type FrameDescriptor = {
  breakpoint: FrameBreakpoint;
  label: string;
  mode: EditorMode;
  // null = the frame fills the stage at real size (live mode).
  width: number | null;
  height: number | null;
  scale: number;
  mediaMaxWidth: number | null;
  editable: boolean;
};

export function createFrameState(initial?: Partial<FrameState>): FrameState {
  return {
    mode: initial?.mode ?? "design",
    activeBreakpoint: initial?.activeBreakpoint ?? "desktop",
    selectedNodeId: initial?.selectedNodeId ?? null,
    design: initial?.design ?? { zoom: DESIGN_ZOOM_START, pan: { x: 0, y: 0 } },
    live: initial?.live ?? { zoom: 1, pan: { x: 0, y: 0 } },
  };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DESIGN_ZOOM_START;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 1000) / 1000));
}

// The CSS `max-width` that applies inside a frame. Read from the same pair the
// bake uses (the site's own, else the platform default), so the editor frames
// and the baked stylesheet agree on the boundaries.
export function mediaMaxWidthFor(
  breakpoint: FrameBreakpoint,
  site?: Breakpoints | null,
): number | null {
  if (breakpoint === "desktop") return null;
  return resolveBreakpoints(site)[breakpoint];
}

export function mediaQueryFor(
  breakpoint: FrameBreakpoint,
  site?: Breakpoints | null,
): string | null {
  const max = mediaMaxWidthFor(breakpoint, site);
  if (max === null) return null;
  return `@media (max-width: ${max - 0.02}px)`;
}

export function activeView(state: FrameState): FrameView {
  return state.mode === "design" ? state.design : state.live;
}

export function framesForState(
  state: FrameState,
  site?: Breakpoints | null,
): FrameDescriptor[] {
  const view = activeView(state);
  const sizes = designFramesFor(site);
  if (state.mode === "live") {
    return [
      {
        breakpoint: state.activeBreakpoint,
        label: "Live",
        mode: "live",
        width: null,
        height: null,
        scale: 1,
        // The live sheet sizes with the stage, but the responsive rules of the
        // chosen breakpoint still apply (M4 Stufe 1: the "real page" renders
        // like the release at that device width).
        mediaMaxWidth: mediaMaxWidthFor(state.activeBreakpoint, site),
        editable: true,
      },
    ];
  }
  return FRAME_BREAKPOINTS.map((breakpoint) => {
    const size = sizes[breakpoint];
    return {
      breakpoint,
      label: size.label,
      mode: "design" as const,
      width: size.width,
      height: size.height,
      scale: view.zoom,
      mediaMaxWidth: mediaMaxWidthFor(breakpoint, site),
      editable: true,
    };
  });
}

// Switching modes keeps selection, breakpoint and both viewports — the
// requirement "Umschalter Design ⇄ Live erhält den Zustand".
export function setMode(state: FrameState, mode: EditorMode): FrameState {
  if (state.mode === mode) return state;
  return { ...state, mode };
}

export function setBreakpoint(
  state: FrameState,
  breakpoint: FrameBreakpoint,
): FrameState {
  return { ...state, activeBreakpoint: breakpoint };
}

export function selectNode(state: FrameState, nodeId: string | null): FrameState {
  return { ...state, selectedNodeId: nodeId };
}

function withView(state: FrameState, view: FrameView): FrameState {
  return state.mode === "design" ? { ...state, design: view } : { ...state, live: view };
}

export function setZoom(state: FrameState, zoom: number): FrameState {
  const view = activeView(state);
  return withView(state, { ...view, zoom: clampZoom(zoom) });
}

export function zoomBy(state: FrameState, delta: number): FrameState {
  return setZoom(state, activeView(state).zoom + delta);
}

export function panBy(state: FrameState, dx: number, dy: number): FrameState {
  const view = activeView(state);
  return withView(state, {
    ...view,
    pan: { x: view.pan.x + dx, y: view.pan.y + dy },
  });
}

export type FramePlacement = {
  breakpoint: FrameBreakpoint;
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
};

// Layout for the side-by-side stage. Scaled frames occupy scaled footprints,
// so the pan area never overlaps.
export function framePlacements(
  state: FrameState,
  options?: { gap?: number; breakpoints?: Breakpoints | null },
): FramePlacement[] {
  const gap = options?.gap ?? FRAME_GAP;
  const desktop = designFramesFor(options?.breakpoints).desktop;
  let left = 0;
  return framesForState(state, options?.breakpoints).map((frame) => {
    const width = frame.width ?? desktop.width;
    const height = frame.height ?? desktop.height;
    const placement: FramePlacement = {
      breakpoint: frame.breakpoint,
      left,
      top: 0,
      width,
      height,
      scale: frame.scale,
    };
    left += width * frame.scale + gap;
    return placement;
  });
}

function requireNode(tree: NodeTree, nodeId: string): Node {
  const node = tree.nodes[nodeId];
  if (!node) {
    throw new SenifyError("not_found", `Node "${nodeId}" does not exist`, {
      field: "nodeId",
    });
  }
  return node;
}

// Base props plus the override of exactly that breakpoint. A change made in
// the desktop frame (a base prop) therefore shows in all three frames, while
// a tablet override only shows in the tablet frame.
export function effectiveProps(
  tree: NodeTree,
  nodeId: string,
  breakpoint: FrameBreakpoint,
): Record<string, PropValue> {
  const node = requireNode(tree, nodeId);
  const props: Record<string, PropValue> = { ...node.props };
  if (isOverrideBreakpoint(breakpoint)) {
    Object.assign(props, node.overrides?.[breakpoint]?.props ?? {});
  }
  return props;
}

export function isHiddenAt(
  tree: NodeTree,
  nodeId: string,
  breakpoint: FrameBreakpoint,
): boolean {
  const node = requireNode(tree, nodeId);
  if (isOverrideBreakpoint(breakpoint)) {
    const override = node.overrides?.[breakpoint];
    if (override?.hidden !== undefined) return override.hidden;
  }
  return node.hidden === true;
}

export function overrideFor(
  tree: NodeTree,
  nodeId: string,
  breakpoint: OverrideBreakpoint,
): Record<string, PropValue> {
  const node = requireNode(tree, nodeId);
  return { ...(node.overrides?.[breakpoint]?.props ?? {}) };
}

export function hasOverride(
  tree: NodeTree,
  nodeId: string,
  breakpoint: OverrideBreakpoint,
  key?: string,
): boolean {
  const node = requireNode(tree, nodeId);
  const override = node.overrides?.[breakpoint];
  if (!override) return false;
  if (key === undefined) return true;
  return Object.hasOwn(override.props ?? {}, key) || override.hidden === true;
}
