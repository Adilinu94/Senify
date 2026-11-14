import { describe, expect, it } from "vitest";
import { getPrimitive } from "../src/catalog.ts";
import { validateControl, validatePrimitive } from "../src/controls.ts";
import { isWidgetPrimitive, WIDGET_PRIMITIVES } from "../src/widgets.ts";
import type { Control } from "../src/types.ts";

// Fixture ist ein valider Slider (min/max/step/units sind semantische Pflicht,
// siehe controls.ts) — nur so beweist `toEqual([])` die Group-Akzeptanz.
const speed: Control = {
  key: "speed",
  label: "Speed",
  kind: "slider",
  valueType: "number",
  default: 8,
  min: 0,
  max: 20,
  step: 1,
  units: ["px"],
};

describe("Control.group", () => {
  it("accepts an optional group label", () => {
    const issues = validateControl({ ...speed, group: "Bewegung" }, "ribbon");
    expect(issues).toEqual([]);
  });
  it("still accepts a control without group", () => {
    const issues = validateControl({ ...speed }, "ribbon");
    expect(issues).toEqual([]);
  });
  // Beweist die Schema-Ergänzung: ControlSchema ist gegenüber unbekannten
  // Properties tolerant, erst minLength: 1 macht eine leere Gruppe invalid.
  it("rejects an empty group label", () => {
    const issues = validateControl({ ...speed, group: "" }, "ribbon");
    expect(issues.some((issue) => issue.path.includes("group"))).toBe(true);
  });
});

describe("ribbon-gallery primitive", () => {
  it("is registered and valid", () => {
    const def = getPrimitive("ribbon-gallery");
    expect(def).toBeDefined();
    expect(isWidgetPrimitive("ribbon-gallery")).toBe(true);
    expect(WIDGET_PRIMITIVES.map((primitive) => primitive.type)).toContain("ribbon-gallery");
    expect(validatePrimitive(def!)).toEqual([]);
  });
  it("carries the Framer settings as grouped controls", () => {
    const def = getPrimitive("ribbon-gallery")!;
    const keys = def.controls.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining([
      "images", "side", "direction", "speed", "curve", "twist", "ribbonWidth", "gap",
      "radius", "phase", "dispersion", "smear", "fringe", "bloom", "endZone",
      "trigger", "start", "replay", "delay", "stagger", "duration",
    ]));
    expect(def.controls.map((c) => c.group)).toEqual([
      "Bilder", "Seite", "Bewegung", "Bewegung", "Form", "Form", "Form", "Form",
      "Form", "Form", "Optik", "Optik", "Optik", "Optik", "Optik",
      "Einblendung", "Einblendung", "Einblendung", "Einblendung", "Einblendung", "Einblendung",
    ]);
  });
  it("is not a container", () => {
    expect(getPrimitive("ribbon-gallery")!.container).toBe(false);
  });
  it("renders unitless factors as plain numbers", () => {
    const def = getPrimitive("ribbon-gallery")!;
    for (const key of ["curve", "twist", "dispersion", "smear", "fringe", "bloom"]) {
      const control = def.controls.find((c) => c.key === key);
      expect(control?.kind).toBe("number");
      expect(control?.units).toBeUndefined();
    }
  });
  it("hides start/replay and timing controls by trigger", () => {
    const def = getPrimitive("ribbon-gallery")!;
    const byKey = new Map(def.controls.map((c) => [c.key, c]));
    expect(byKey.get("start")?.condition).toEqual({ prop: "trigger", equals: "layerInView" });
    expect(byKey.get("replay")?.condition).toEqual({ prop: "trigger", equals: "layerInView" });
    expect(byKey.get("delay")?.condition).toEqual({ prop: "trigger", notEquals: "none" });
    expect(byKey.get("stagger")?.condition).toEqual({ prop: "trigger", notEquals: "none" });
    expect(byKey.get("duration")?.condition).toEqual({ prop: "trigger", notEquals: "none" });
  });
});

describe("wave-background primitive", () => {
  it("is registered and valid", () => {
    const def = getPrimitive("wave-background");
    expect(def).toBeDefined();
    expect(isWidgetPrimitive("wave-background")).toBe(true);
    expect(WIDGET_PRIMITIVES.map((primitive) => primitive.type)).toContain("wave-background");
    expect(validatePrimitive(def!)).toEqual([]);
  });
  it("exposes the shader settings as grouped controls", () => {
    const def = getPrimitive("wave-background")!;
    expect(def.controls.map((c) => c.key)).toEqual([
      "speed", "amplitude", "zoom", "glow", "phase", "saturation", "steps",
    ]);
    expect(def.controls.map((c) => c.group)).toEqual([
      "Bewegung", "Form", "Form", "Optik", "Optik", "Optik", "Qualität",
    ]);
  });
  it("is a non-container media widget without children", () => {
    const def = getPrimitive("wave-background")!;
    expect(def.container).toBe(false);
    expect(def.allowedChildren).toBe("none");
    expect(def.category).toBe("media");
  });
});