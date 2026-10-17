import { describe, expect, it } from "vitest";
import {
  activeView,
  clampZoom,
  createFrameState,
  designFramesFor,
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
import { BREAKPOINT_LIMITS } from "@senify/widget-engine/breakpoints";
import { draftTree, nodeOf } from "./fixtures.ts";

describe("frame manager", () => {
  it("design mode opens three editable frames at real widths, zoom 50 %", () => {
    const frames = framesForState(createFrameState());
    expect(frames.map((frame) => frame.breakpoint)).toEqual([
      "desktop",
      "tablet",
      "mobile",
    ]);
    expect(frames.map((frame) => frame.width)).toEqual([1440, 1023, 390]);
    expect(frames.every((frame) => frame.editable)).toBe(true);
    expect(frames.every((frame) => frame.scale === DESIGN_ZOOM_START)).toBe(true);
  });

  it("maps every frame to the media query that really applies inside it", () => {
    const frames = framesForState(createFrameState());
    const widthOf = (breakpoint: string): number =>
      frames.find((frame) => frame.breakpoint === breakpoint)?.width ?? 0;
    // desktop is wider than the tablet boundary …
    expect(widthOf("desktop")).toBeGreaterThan(BREAKPOINTS.tablet);
    // … tablet sits between the two boundaries. The tablet query reads
    // `max-width: tablet - 0.02`, so the sheet must be narrower than the number
    // itself (a 1024 px sheet would show the desktop layout) …
    expect(widthOf("tablet")).toBeLessThan(BREAKPOINTS.tablet);
    expect(widthOf("tablet")).toBeGreaterThanOrEqual(BREAKPOINTS.mobile);
    // … and mobile sits below the mobile boundary.
    expect(widthOf("mobile")).toBeLessThan(BREAKPOINTS.mobile);
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

  it("the live frame carries the active breakpoint's media boundary (M4 Stufe 1)", () => {
    // The sheet fills the stage, but the responsive rules of the chosen
    // breakpoint still apply — the live page renders like the release.
    const mobileLive = framesForState(setMode(setBreakpoint(createFrameState(), "mobile"), "live"));
    expect(mobileLive[0]?.mediaMaxWidth).toBe(BREAKPOINTS.mobile);
    const tabletLive = framesForState(setMode(setBreakpoint(createFrameState(), "tablet"), "live"));
    expect(tabletLive[0]?.mediaMaxWidth).toBe(BREAKPOINTS.tablet);
    const desktopLive = framesForState(setMode(createFrameState(), "live"));
    expect(desktopLive[0]?.mediaMaxWidth).toBeNull();
  });

  it("live mode keeps the breakpoint's media rules (the real page, not desktop)", () => {
    // Tablet/mobile live frames carry their mediaMaxWidth, so the frame renders
    // the responsive rules of that device — desktop stays unbounded.
    const tabletLive = framesForState(setMode(setBreakpoint(createFrameState(), "tablet"), "live"));
    expect(tabletLive[0]?.mediaMaxWidth).toBe(BREAKPOINTS.tablet);
    expect(tabletLive[0]?.width).toBeNull();
    const desktopLive = framesForState(setMode(createFrameState(), "live"));
    expect(desktopLive[0]?.mediaMaxWidth).toBeNull();
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
    expect(placements.map((placement) => placement.left)).toEqual([0, 752, 1295.5]);
    expect(placements.map((placement) => placement.scale)).toEqual([0.5, 0.5, 0.5]);
    const zoomed = framePlacements(setZoom(createFrameState(), 1));
    expect(zoomed.map((placement) => placement.left)).toEqual([0, 1472, 2527]);
  });
});

// Which of the device queries answer inside a sheet of that width (ADR-0020).
function queriesAt(width: number, pair: { tablet: number; mobile: number }): string[] {
  const on: string[] = [];
  if (width <= pair.tablet - 0.02) on.push("tablet");
  if (width <= pair.mobile - 0.02) on.push("mobile");
  return on;
}

describe("frames follow the site's breakpoint pair", () => {
  const pairs = [
    { tablet: 1024, mobile: 640 },
    { tablet: 1200, mobile: 810 },
    { tablet: 1440, mobile: 810 },
    { tablet: 900, mobile: 600 },
    { tablet: BREAKPOINT_LIMITS.tablet.min, mobile: BREAKPOINT_LIMITS.mobile.min },
    { tablet: BREAKPOINT_LIMITS.tablet.max, mobile: BREAKPOINT_LIMITS.mobile.max },
    { tablet: 1020, mobile: 900 },
    { tablet: BREAKPOINT_LIMITS.tablet.min + BREAKPOINT_LIMITS.minGap, mobile: BREAKPOINT_LIMITS.tablet.min },
  ];

  it.each(pairs)("puts every sheet inside the range of its device for %j", (pair) => {
    const sizes = designFramesFor(pair);
    // Desktop: neither device query answers.
    expect(queriesAt(sizes.desktop.width, pair)).toEqual([]);
    // Tablet: the tablet query answers, the mobile one does not.
    expect(queriesAt(sizes.tablet.width, pair)).toEqual(["tablet"]);
    // Mobile: both answer (the tablet rules cascade down).
    expect(queriesAt(sizes.mobile.width, pair)).toEqual(["tablet", "mobile"]);
    expect(sizes.mobile.width).toBeGreaterThan(0);
  });

  it("keeps the familiar widths wherever they lie inside the range", () => {
    const own = designFramesFor({ tablet: 1200, mobile: 810 });
    expect(own.desktop.width).toBe(1440);
    expect(own.tablet.width).toBe(1024);
    expect(own.mobile.width).toBe(390);
    // A tablet number beyond the desktop sheet widens the desktop sheet.
    expect(designFramesFor({ tablet: 1600, mobile: 810 }).desktop.width).toBe(1600);
  });

  it("falls back to the platform default without a pair", () => {
    expect(designFramesFor()).toEqual(designFramesFor(null));
    expect(designFramesFor().tablet.width).toBe(1023);
    expect(framesForState(createFrameState()).map((frame) => frame.width)).toEqual(
      framesForState(createFrameState(), null).map((frame) => frame.width),
    );
  });

  it("hands the pair to the descriptors, the media queries and the placements", () => {
    const own = { tablet: 1200, mobile: 810 };
    const frames = framesForState(createFrameState(), own);
    expect(frames.map((frame) => frame.width)).toEqual([1440, 1024, 390]);
    expect(frames.map((frame) => frame.mediaMaxWidth)).toEqual([null, 1200, 810]);
    expect(mediaMaxWidthFor("tablet", own)).toBe(1200);
    expect(mediaQueryFor("tablet", own)).toBe("@media (max-width: 1199.98px)");
    expect(mediaQueryFor("mobile", own)).toBe("@media (max-width: 809.98px)");
    const live = framesForState(setMode(createFrameState({ activeBreakpoint: "tablet" }), "live"), own);
    expect(live[0]?.mediaMaxWidth).toBe(1200);
    expect(framePlacements(createFrameState(), { breakpoints: own }).map((placement) => placement.width)).toEqual([
      1440, 1024, 390,
    ]);
    const wide = framePlacements(createFrameState(), { breakpoints: { tablet: 1600, mobile: 810 } });
    expect(wide[0]?.width).toBe(1600);
    // The live frame, which has no width of its own, takes the desktop sheet's.
    const livePlacement = framePlacements(setMode(createFrameState(), "live"), {
      breakpoints: { tablet: 1600, mobile: 810 },
    });
    expect(livePlacement[0]?.width).toBe(1600);
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
