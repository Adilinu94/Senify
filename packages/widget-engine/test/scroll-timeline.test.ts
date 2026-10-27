import { describe, expect, it } from "vitest";
import { compileCssReport } from "@senify/widget-engine";

// Scroll-driven motion: the source moves content with the scroll position, and
// CSS scroll timelines replay it without a runtime.
//
// Measured on `rare-works` (27.10.2026): the workspace panel slides from
// `translateX(640px)` to `0` while its sticky section crosses the viewport —
// 640 → 199 → 53 → 14 → 4 → 1 → 0 over ~300 px of scroll. Before the import
// learned this, the baked page showed the panel already at rest: 56 % of the
// pixels in the bands 10.250–11.000 differed.
describe("Scroll-Timeline", () => {
  it("lässt eine benannte Timeline durch den Compiler", () => {
    // A named timeline is the form the mapper emits: the section owns the
    // timeline, the moving element refers to it. The anonymous `view()` was
    // rejected by the value grammar before — that is why the function names are
    // in `FUNCTIONS` now.
    const report = compileCssReport({
      nodes: [
        {
          id: "section",
          primitive: "frame",
          classIds: ["timeline-owner"],
          children: [{ id: "panel", primitive: "frame", classIds: ["panel-move"] }],
        },
      ],
      classRules: [
        { name: "timeline-owner", props: { "view-timeline-name": "--senify-scroll-1", "view-timeline-axis": "block" } },
        {
          name: "panel-move",
          props: {
            animation: "senify-scroll-1 linear both",
            "animation-timeline": "--senify-scroll-1",
            "animation-range": "cover 57.2% cover 57.4%",
          },
        },
      ],
    });
    expect(report.css).toContain("view-timeline-name: --senify-scroll-1");
    expect(report.css).toContain("animation-timeline: --senify-scroll-1");
    expect(report.css).toContain("animation-range: cover 57.2% cover 57.4%");
    // Nothing was dropped: the values survive as written.
    expect(report.diagnostics).toEqual([]);
  });

  it("nimmt view() als Wert an", () => {
    // `animation-timeline: view()` is the anonymous form. It was dropped as an
    // unknown function (measured: `invalid-value`), which made every scroll
    // animation impossible to express from CSS alone.
    const report = compileCssReport({
      nodes: [{ id: "panel", primitive: "frame", classIds: ["panel-view"] }],
      classRules: [
        {
          name: "panel-view",
          props: { animation: "slide linear both", "animation-timeline": "view()", "animation-range": "entry 0% cover 50%" },
        },
      ],
    });
    expect(report.css).toContain("animation-timeline: view()");
    expect(report.diagnostics).toEqual([]);
  });

  it("hält die gemessene Kurve in den Keyframes", () => {
    // The panel does not move at a constant rate: it covers 69 % of its distance
    // in the first 17 % of the scroll window. A from/to pair would lag visibly
    // behind, so the measured path becomes several keyframes.
    const keyframes = [
      "@keyframes senify-scroll-1 {",
      "  0% { transform: translate(640px, 0px); }",
      "  17% { transform: translate(199px, 0px); }",
      "  33% { transform: translate(53px, 0px); }",
      "  67% { transform: translate(4px, 0px); }",
      "  100% { transform: none; }",
      "}",
    ].join(" ");
    const report = compileCssReport({
      nodes: [{ id: "panel", primitive: "frame", classIds: ["panel-curve"] }],
      classRules: [{ name: "panel-curve", props: { animation: "senify-scroll-1 linear both" }, rawCss: keyframes }],
    });
    expect(report.css).toContain("translate(640px, 0px)");
    expect(report.css).toContain("translate(199px, 0px)");
    // The keyframes are emitted once, not per device stage.
    expect(report.css.split("@keyframes senify-scroll-1").length).toBe(2);
  });
});
