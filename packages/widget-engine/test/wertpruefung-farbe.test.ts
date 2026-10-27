import { describe, expect, it } from "vitest";
import { declarationsForValues } from "../src/css/properties.ts";

// The colour path never ran the value grammar: measured 27.10.2026,
// `background: javascript:alert(1)` and `background: scroll(red, blue)` both
// reached the stylesheet unchanged, and `filter: view(1px)` was accepted after
// the timeline functions became known. A colour is a colour; a free value is a
// free value — neither may carry a script or a timeline source.
describe("Wertprüfung der Farbe und der Timeline-Funktionen", () => {
  it("lässt echte Farben durch", () => {
    for (const value of ["#fff", "#0a0b0cff", "rgba(0,0,0,.5)", "oklch(0.97 0 0)", "red", "transparent", "currentColor", "var(--token-x)"]) {
      const out = declarationsForValues("frame", { background: value });
      expect(out, value).toHaveLength(1);
      expect(out[0]?.property).toBe("background-color");
    }
  });

  it("weist ein Skript in der Farbe ab", () => {
    // `javascript:` in `background-color` is not a colour — it used to be
    // emitted as written.
    for (const value of ["javascript:alert(1)", "url(javascript:alert(1))", "expression(alert(1))"]) {
      expect(declarationsForValues("frame", { background: value }), value).toEqual([]);
    }
  });

  it("weist eine Timeline-Funktion in der Farbe ab", () => {
    expect(declarationsForValues("frame", { background: "scroll(red, blue)" })).toEqual([]);
    expect(declarationsForValues("frame", { background: "view(1px)" })).toEqual([]);
  });

  it("erlaubt view() und scroll() nur an animation-timeline", () => {
    // The timeline source belongs to one property. Everywhere else it is a
    // construct the grammar must not smuggle through.
    expect(declarationsForValues("frame", { animationTimeline: "view()" })).toHaveLength(1);
    expect(declarationsForValues("frame", { animationTimeline: "scroll()" })).toHaveLength(1);
    expect(declarationsForValues("frame", { filter: "view(1px)" })).toEqual([]);
    expect(declarationsForValues("frame", { transform: "scroll(10px)" })).toEqual([]);
  });
});
