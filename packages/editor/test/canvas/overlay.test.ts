import { describe, expect, it } from "vitest";
import {
  OVERLAY_HANDLE_HIT,
  OVERLAY_LABEL_HEIGHT,
  badgeTop,
  intersectsViewport,
  isOccluded,
  overlayRect,
} from "@senify/editor/canvas";

// Ticket 16: the selection/hover markers live in the editor portal over the
// stage. The geometry (frame rect -> stage rect), the viewport clip, the
// occlusion rule and the badge placement are pure — no browser needed. The DOM
// half runs in `canvas-browser.test.ts`.

describe("marker overlay geometry", () => {
  it("maps a frame rect into stage coordinates at the frame scale", () => {
    expect(
      overlayRect({ left: 10, top: 20, width: 100, height: 50 }, { left: 200, top: 30 }, 0.5),
    ).toEqual({ left: 205, top: 40, width: 50, height: 25 });
  });

  it("keeps a ring only while it touches the visible frame viewport", () => {
    const viewport = { width: 1000, height: 800 };
    expect(intersectsViewport({ left: 0, top: 0, width: 10, height: 10 }, viewport)).toBe(true);
    // Partly scrolled out above/left: the sheet clips it, the ring stays.
    expect(intersectsViewport({ left: -20, top: 0, width: 40, height: 10 }, viewport)).toBe(true);
    expect(intersectsViewport({ left: -50, top: -50, width: 40, height: 40 }, viewport)).toBe(false);
    // Scrolled out below/right.
    expect(intersectsViewport({ left: 1000, top: 0, width: 40, height: 40 }, viewport)).toBe(false);
    expect(intersectsViewport({ left: 0, top: 800, width: 40, height: 40 }, viewport)).toBe(false);
    // No viewport (live frame) draws nothing.
    expect(intersectsViewport({ left: 0, top: 0, width: 10, height: 10 }, { width: 0, height: 0 })).toBe(false);
  });

  it("suppresses the ring only for a foreign node covering the target", () => {
    expect(isOccluded("card", "hero", false)).toBe(true);
    expect(isOccluded("card", "card", false)).toBe(false);
    // A hit inside the target (a nested node) is not occlusion.
    expect(isOccluded("card", "inner", true)).toBe(false);
    // An element without a node id cannot be attributed; the ring stays.
    expect(isOccluded("card", null, false)).toBe(false);
  });

  it("keeps the label inside the sheet at the top edge", () => {
    expect(OVERLAY_LABEL_HEIGHT).toBe(18);
    expect(badgeTop({ left: 0, top: 40, width: 10, height: 10 })).toBe(22);
    expect(badgeTop({ left: 0, top: 20, width: 10, height: 10 })).toBe(2);
    expect(badgeTop({ left: 0, top: 19, width: 10, height: 10 })).toBe(19);
    expect(badgeTop({ left: 0, top: 0, width: 10, height: 10 })).toBe(0);
  });

  it("fills the corner handle hit area to 24px (WCAG 2.5.8)", () => {
    expect(OVERLAY_HANDLE_HIT).toBe(24);
  });
});
