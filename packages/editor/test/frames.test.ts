import { describe, expect, it } from "vitest";
import {
  activeView,
  clampZoom,
  createFrameState,
  DESIGN_ZOOM_START,
  effectiveProps,
  framePlacements,
  framesForState,
  hasOverride,
  isHiddenAt,
  mediaMaxWidthFor,
  mediaQueryFor,
  setBreakpoint,
  setMode,
  setZoom,
  selectNode,
  zoomBy,
} from "@senify/editor";
import { BREAKPOINTS } from "@senify/renderer";
import { draftTree, nodeOf } from "./fixtures.ts";

describe("frame manager", () => {
  it("design mode opens three editable frames at real widths, zoom 50 %", () => {
    const frames = framesForState(createFrameState());
    expect(frames.map((frame) => frame.breakpoint)).toEqual([
      "desktop",
      "tablet",
      "mobile",
    ]);
    expect(frames.map((frame) => frame.width)).toEqual([1440, 768, 390]);
    expect(frames.every((frame) => frame.editable)).toBe(true);
    expect(frames.every((frame) => frame.scale === DESIGN_ZOOM_START)).toBe(true);
  });

  it("maps every frame to the media query that really applies inside it", () => {
    const frames = framesForState(createFrameState());
    const widthOf = (breakpoint: string): number =>
      frames.find((frame) => frame.breakpoint === breakpoint)?.width ?? 0;
    // desktop is wider than the tablet boundary …
    expect(widthOf("desktop")).toBeGreaterThan(BREAKPOINTS.tablet);
    // … tablet sits between the two boundaries …
    expect(widthOf("tablet")).toBeLessThanOrEqual(BREAKPOINTS.tablet);
    expect(widthOf("tablet")).toBeGreaterThan(BREAKPOINTS.mobile);
    // … and mobile sits at or below the mobile boundary.
    expect(widthOf("mobile")).toBeLessThanOrEqual(BREAKPOINTS.mobile);
    expect(mediaMaxWidthFor("desktop")).toBeNull();
    expect(mediaMaxWidthFor("tablet")).toBe(BREAKPOINTS.tablet);
    expect(mediaMaxWidthFor("mobile")).toBe(BREAKPOINTS.mobile);
    expect(mediaQueryFor("desktop")).toBeNull();
    expect(mediaQueryFor("tablet")).toBe("@media (max-width: 1023.98px)");
    expect(mediaQueryFor("mobile")).toBe("@media (max-width: 639.98px)");
  });

  it("live mode opens one real-size frame in the stage", () => {
    const frames = framesForState(setMode(createFrameState(), "live"));
    expect(frames).toHaveLength(1);
    expect(frames[0]?.mode).toBe("live");
    expect(frames[0]?.width).toBeNull();
    expect(frames[0]?.scale).toBe(1);
    expect(frames[0]?.editable).toBe(true);
  });

  it("switching design ⇄ live keeps selection, breakpoint and zoom", () => {
    const start = selectNode(setBreakpoint(createFrameState(), "mobile"), "hero000001");
    const live = setMode(start, "live");
    expect(live.selectedNodeId).toBe("hero000001");
    expect(live.activeBreakpoint).toBe("mobile");
    const back = setMode(live, "design");
    expect(back.selectedNodeId).toBe("hero000001");
    expect(back.activeBreakpoint).toBe("mobile");
    expect(activeView(back).zoom).toBe(DESIGN_ZOOM_START);
    // live keeps its own viewport (100 %) while design keeps 50 %.
    expect(activeView(live).zoom).toBe(1);
  });

  it("clamps zoom and clamps the pan of the active preview only", () => {
    expect(clampZoom(9)).toBe(2);
    expect(clampZoom(0.01)).toBe(0.25);
    expect(clampZoom(Number.NaN)).toBe(DESIGN_ZOOM_START);
    const zoomed = zoomBy(createFrameState(), 0.1);
    expect(activeView(zoomed).zoom).toBe(0.6);
    const live = zoomBy(setMode(createFrameState(), "live"), 0.5);
    expect(activeView(live).zoom).toBe(1.5);
    expect(live.design.zoom).toBe(DESIGN_ZOOM_START);
  });

  it("layouts the frames side by side in scaled footprints", () => {
    const placements = framePlacements(createFrameState());
    expect(placements.map((placement) => placement.left)).toEqual([0, 752, 1168]);
    expect(placements.map((placement) => placement.scale)).toEqual([0.5, 0.5, 0.5]);
    const zoomed = framePlacements(setZoom(createFrameState(), 1));
    expect(zoomed.map((placement) => placement.left)).toEqual([0, 1472, 2272]);
  });
});

describe("breakpoint overrides across frames", () => {
  it("resolves base props for every frame and overrides only for their breakpoint", () => {
    const tree = draftTree();
    // A change in the desktop frame writes the base prop …
    nodeOf(tree, "hero000001").props.headline = "Ueberall";
    expect(effectiveProps(tree, "hero000001", "desktop").headline).toBe("Ueberall");
    expect(effectiveProps(tree, "hero000001", "tablet").headline).toBe("Ueberall");
    expect(effectiveProps(tree, "hero000001", "mobile").headline).toBe("Kurz auf Mobile");
    // … while a mobile override only shows in the mobile frame.
    expect(effectiveProps(tree, "hero000001", "mobile").paddingY).toEqual({
      $token: "space.4",
    });
    expect(effectiveProps(tree, "hero000001", "tablet").paddingY).toBeUndefined();
  });

  it("reports override badges per breakpoint", () => {
    const tree = draftTree();
    expect(hasOverride(tree, "hero000001", "mobile", "headline")).toBe(true);
    expect(hasOverride(tree, "hero000001", "mobile")).toBe(true);
    expect(hasOverride(tree, "hero000001", "tablet")).toBe(false);
    expect(hasOverride(tree, "widget00001", "tablet", "spacing")).toBe(true);
  });

  it("applies the hidden flag from the override of that breakpoint", () => {
    const tree = draftTree();
    nodeOf(tree, "pricing00001").hidden = true;
    // an override can un-hide a node for one breakpoint
    nodeOf(tree, "pricing00001").overrides = { tablet: { hidden: false } };
    expect(isHiddenAt(tree, "pricing00001", "desktop")).toBe(true);
    expect(isHiddenAt(tree, "pricing00001", "tablet")).toBe(false);
    expect(isHiddenAt(tree, "pricing00001", "mobile")).toBe(true);
  });
});
