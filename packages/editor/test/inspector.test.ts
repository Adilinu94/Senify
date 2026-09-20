import { describe, expect, it } from "vitest";
import { defaultTheme } from "@senify/tokens";
import { buildInspector, motionSpecFrom, numberPart, tokenRefOf, unitOfValue } from "@senify/editor";
import { baseStore } from "./state/fixtures.ts";

// Ticket 02, slice 1: the inspector model. The panel is generated from the
// primitive controls (Content), the style property table filtered by the
// primitive's style groups (Style), the motion registry (Interactions) and the
// structural node flags (Advanced). These tests pin the split, the device
// overrides and the token/literal rule — no DOM needed.

describe("buildInspector", () => {
  it("builds the four tabs with the generated field family", () => {
    const store = baseStore();
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    expect(model).not.toBeNull();
    expect(model?.tabs.map((tab) => tab.id)).toEqual([
      "content",
      "style",
      "interactions",
      "advanced",
    ]);
    const content = model?.tabs.find((tab) => tab.id === "content");
    const keys = content?.groups.flatMap((group) => group.fields.map((field) => field.key)) ?? [];
    expect(keys).toContain("text");
    expect(keys).toContain("level");
    expect(keys).toContain("eyebrow");
    const level = content?.groups
      .flatMap((group) => group.fields)
      .find((field) => field.key === "level");
    expect(level?.kind).toBe("select");
    expect(level?.options?.map((option) => option.value)).toContain("h2");
  });

  it("narrows the Style tab by the primitive style groups and keeps owned controls out", () => {
    const store = baseStore();
    const heading = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
    });
    const style = heading?.tabs.find((tab) => tab.id === "style");
    const styleKeys = style?.groups.flatMap((group) => group.fields.map((field) => field.key)) ?? [];
    // heading: spacing, typography, color, effects — no layout, no border.
    expect(styleKeys).toContain("padding");
    expect(styleKeys).toContain("fontSize");
    expect(styleKeys).toContain("color");
    expect(styleKeys).toContain("boxShadow");
    expect(styleKeys).not.toContain("position");
    expect(styleKeys).not.toContain("borderWidth");

    // frame owns `padding` as a catalog control: the Style tab must not offer
    // a second field for the same property (one property, one control).
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "frame", id: "frm0000001" },
    });
    const frame = buildInspector({
      document: store.document,
      nodeId: "frm0000001",
      breakpoint: "desktop",
    });
    const frameStyleKeys =
      frame?.tabs
        .find((tab) => tab.id === "style")
        ?.groups.flatMap((group) => group.fields.map((field) => field.key)) ?? [];
    expect(frameStyleKeys).not.toContain("padding");
    const frameContentKeys =
      frame?.tabs
        .find((tab) => tab.id === "content")
        ?.groups.flatMap((group) => group.fields.map((field) => field.key)) ?? [];
    expect(frameContentKeys).toContain("padding");
  });

  it("reports the effective value, the base and every device override", () => {
    const store = baseStore();
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "mobile",
    });
    // head carries fontSize_mobile: 16 (from the fixture's v1 tree? no — the
    // fixture sets fontSize on desktop only); write an override first.
    store.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "fontSize",
      value: 16,
      device: "mobile",
    });
    const after = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "mobile",
    });
    const field = after?.tabs
      .flatMap((tab) => tab.groups)
      .flatMap((group) => group.fields)
      .find((entry) => entry.key === "fontSize");
    expect(field?.value).toBe(16);
    expect(field?.base).toBe(24);
    expect(field?.overridden).toBe(true);
    expect(field?.overrideDevices).toContain("mobile");
    // On desktop the same key is not an override.
    const desktop = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
    });
    const desktopField = desktop?.tabs
      .flatMap((tab) => tab.groups)
      .flatMap((group) => group.fields)
      .find((entry) => entry.key === "fontSize");
    expect(desktopField?.overridden).toBe(false);
    expect(model).not.toBeNull();
  });

  it("attaches theme tokens to colour fields and warns on literals", () => {
    const store = baseStore();
    store.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "color",
      value: "#ff0000",
    });
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    const field = model?.tabs
      .flatMap((tab) => tab.groups)
      .flatMap((group) => group.fields)
      .find((entry) => entry.key === "color");
    expect(field?.kind).toBe("color");
    expect(field?.tokenOptions?.length ?? 0).toBeGreaterThan(0);
    expect(field?.literalWarning).toContain("umgeht die Theme-Tokens");

    // A token value has no warning and reports its reference.
    store.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "color",
      value: { $token: "accent" },
    });
    const withToken = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    const tokenField = withToken?.tabs
      .flatMap((tab) => tab.groups)
      .flatMap((group) => group.fields)
      .find((entry) => entry.key === "color");
    expect(tokenField?.tokenRef).toBe("accent");
    expect(tokenField?.literalWarning).toBeUndefined();
  });

  it("hides conditional controls from the catalog", () => {
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "body", id: "bod0000001", props: { html: "Text" } },
    });
    const model = buildInspector({
      document: store.document,
      nodeId: "bod0000001",
      breakpoint: "desktop",
    });
    const dropCapLines = model?.tabs
      .flatMap((tab) => tab.groups)
      .flatMap((group) => group.fields)
      .find((entry) => entry.key === "dropCapLines");
    expect(dropCapLines?.hidden).toBe(true);
    store.apply({
      op: "setNodeProp",
      id: "bod0000001",
      key: "dropCap",
      value: true,
    });
    const shown = buildInspector({
      document: store.document,
      nodeId: "bod0000001",
      breakpoint: "desktop",
    });
    const shownField = shown?.tabs
      .flatMap((tab) => tab.groups)
      .flatMap((group) => group.fields)
      .find((entry) => entry.key === "dropCapLines");
    expect(shownField?.hidden).toBe(false);
  });

  it("carries the motion registry and the profile cap in the Interactions tab", () => {
    const store = baseStore();
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
      profile: "clean",
    });
    expect(model?.motion.intensityCap).toBe(3);
    expect(model?.motion.presets.length).toBeGreaterThan(0);
    const intensity = model?.motion.fields.find((field) => field.key === "intensity");
    expect(intensity?.max).toBe(3);
    const preset = model?.motion.fields.find((field) => field.key === "preset");
    expect(preset?.options?.some((option) => option.label.includes("gesperrt"))).toBe(true);
  });

  it("offers the structural flags in the Advanced tab", () => {
    const store = baseStore();
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
    });
    const advanced = model?.tabs.find((tab) => tab.id === "advanced");
    const fields = advanced?.groups.flatMap((group) => group.fields) ?? [];
    expect(fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["hidden_tablet", "hidden_mobile", "locked", "id"]),
    );
    const locked = fields.find((field) => field.key === "locked");
    expect(locked?.commit).toEqual({ kind: "locked" });
  });

  it("returns null for a node that does not exist", () => {
    const store = baseStore();
    const model = buildInspector({
      document: store.document,
      nodeId: "missing0001",
      breakpoint: "desktop",
    });
    expect(model).toBeNull();
  });
});

describe("inspector value helpers", () => {
  it("reads the numeric part of numbers and unit strings", () => {
    expect(numberPart(24)).toBe(24);
    expect(numberPart("2.5rem")).toBe(2.5);
    expect(numberPart("auto")).toBeUndefined();
    expect(numberPart(undefined)).toBeUndefined();
  });

  it("keeps the unit of a string value and falls back to the first unit", () => {
    expect(unitOfValue("2rem", ["px", "rem"])).toBe("rem");
    expect(unitOfValue(16, ["px", "rem"])).toBe("px");
    expect(unitOfValue("50%", ["%"])).toBe("%");
  });

  it("reads token references", () => {
    expect(tokenRefOf({ $token: "accent" })).toBe("accent");
    expect(tokenRefOf("#fff")).toBeNull();
    expect(tokenRefOf(undefined)).toBeNull();
  });

  it("builds a motion spec from field values", () => {
    const spec = motionSpecFrom(
      "fade-up",
      {
        intensity: 6,
        trigger: "load",
        delay: 120,
        ease: "out",
        durationScale: 1.2,
        stagger: 0.8,
        reducedMotion: "fade",
        enabled: true,
      },
      undefined,
    );
    expect(spec.preset).toBe("fade-up");
    expect(spec.intensity).toBe(6);
    expect(spec.trigger).toBe("load");
    expect(spec.delay).toBe(120);
    expect(spec.tokens?.ease).toBe("out");
    expect(spec.tokens?.durationScale).toBe(1.2);
    expect(spec.reducedMotion).toBe("fade");
  });
});
