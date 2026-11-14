import { describe, expect, it, vi } from "vitest";
import { createRegistry } from "@senify/registry";
import { defaultTheme } from "@senify/tokens";
import {
  createClassRule,
  createScopedRule,
  PRIMITIVES,
  type PrimitiveDefinition,
} from "@senify/widget-engine";
import { buildInspector, motionSpecFrom, numberPart, tokenRefOf, unitOfValue } from "@senify/editor";
import {
  createComponent,
  setComponentOverride,
  setComponentVariants,
} from "@senify/editor/state";
import { baseStore } from "./state/fixtures.ts";

// Task 1 (Control-Gruppen): der Katalog hat noch kein gruppiertes Primitive
// (das kommt mit Task 3). Deshalb liefert dieses Mock nur für die beiden
// Fixture-Typen ein zusätzliches Primitive; alles andere bleibt die echte
// Implementierung, damit die übrigen Tests dieser Datei unverändert laufen.
// Das Muster folgt packages/framer-import/test/runtime-payload-url-mode.test.ts.
vi.mock("@senify/widget-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@senify/widget-engine")>();
  const fixtures: PrimitiveDefinition[] = [
    {
      type: "fixture-gruppen",
      name: "Fixture Gruppen",
      category: "basic",
      description: "Test-Fixture für die Content-Gruppen des Inspectors.",
      container: false,
      allowedChildren: "none",
      slots: {},
      styleGroups: [],
      // Katalog-Reihenfolge: speed (Bewegung), foo (ohne group), direction
      // (Bewegung), anchorId (Settings-Key). Die Gruppe "Bewegung" taucht also
      // vor der Default-Gruppe auf, ihre Felder bleiben in Katalog-Reihenfolge.
      controls: [
        { key: "speed", label: "Tempo", kind: "number", valueType: "number", default: 8, min: 0, max: 20, step: 1, group: "Bewegung" },
        { key: "foo", label: "Foo", kind: "text", valueType: "string", default: "" },
        { key: "direction", label: "Richtung", kind: "text", valueType: "string", default: "links", group: "Bewegung" },
        { key: "anchorId", label: "Anker-ID", kind: "text", valueType: "string", default: "" },
      ],
    },
    {
      type: "fixture-slug",
      name: "Fixture Slug",
      category: "basic",
      description: "Test-Fixture für den Gruppen-Slug und die Map-Wiederverwendung.",
      container: false,
      allowedChildren: "none",
      slots: {},
      styleGroups: [],
      controls: [
        { key: "alpha", label: "Alpha", kind: "text", valueType: "string", default: "", group: "Bewegung" },
        { key: "beta", label: "Beta", kind: "text", valueType: "string", default: "", group: "Darstellung & Farbe" },
        { key: "gamma", label: "Gamma", kind: "text", valueType: "string", default: "", group: "Bewegung" },
      ],
    },
  ];
  return {
    ...actual,
    getPrimitive: (type: string) =>
      fixtures.find((fixture) => fixture.type === type) ?? actual.getPrimitive(type),
  };
});

// Ticket 02, slice 1: the inspector model. The panel is generated from the
// primitive controls (Content), the style property table filtered by the
// primitive's style groups (Style), the motion registry (Interactions) and the
// structural node flags (Advanced). These tests pin the split, the device
// overrides and the token/literal rule — no DOM needed.

describe("buildInspector", () => {
  it("reads class styles and responsive states from the selected class", () => {
    const store = baseStore();
    const rule = createClassRule({ id: "class001", name: "titel", styles: { color: "#123456", color_mobile: "#abcdef" } });
    rule.states = { hover: { color: "#ff0000" } };
    store.applyBatch([
      { op: "upsertStyleRule", rule },
      { op: "assignClass", id: "head000001", classId: "titel" },
    ]);
    const field = (state: "hover" | null, breakpoint: "desktop" | "mobile") =>
      buildInspector({ document: store.document, nodeId: "head000001", styleRuleId: "class001", state, breakpoint })
        ?.tabs.find((tab) => tab.id === "style")?.groups.flatMap((group) => group.fields).find((entry) => entry.key === "color");
    expect(field(null, "mobile")?.value).toBe("#abcdef");
    expect(field(null, "mobile")?.commit).toEqual({ kind: "class", ruleId: "class001", state: null });
    expect(field("hover", "desktop")?.value).toBe("#ff0000");
  });
  it("shows class properties even when the element owns a control with the same key", () => {
    const store = baseStore();
    store.apply({ op: "insertNode", parent: { nodeId: store.document.rootNodeId }, node: { primitive: "frame", id: "frame00001" } });
    store.applyBatch([
      { op: "upsertStyleRule", rule: createClassRule({ id: "class001", name: "layout", styles: { display: "flex" } }) },
      { op: "assignClass", id: "frame00001", classId: "layout" },
    ]);
    const model = buildInspector({ document: store.document, nodeId: "frame00001", styleRuleId: "class001", breakpoint: "desktop" });
    const fields = model?.tabs.find((tab) => tab.id === "style")?.groups.flatMap((group) => group.fields) ?? [];
    expect(fields.find((field) => field.key === "display")?.value).toBe("flex");
  });
  it("builds the three tabs Allgemein, Stil, Interaktionen with the generated field family", () => {
    const store = baseStore();
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    expect(model).not.toBeNull();
    expect(model?.tabs.map((tab) => tab.id)).toEqual(["content", "style", "interactions"]);
    expect(model?.tabs.map((tab) => tab.label)).toEqual(["Allgemein", "Stil", "Interaktionen"]);
    const content = model?.tabs.find((tab) => tab.id === "content");
    // Allgemein: "Inhalt" (Text, Eyebrow) und "Einstellungen" (Ebene/Tag, ID, Sichtbarkeit).
    expect(content?.groups.map((group) => group.label)).toEqual(["Inhalt", "Einstellungen"]);
    const inhalt = content?.groups.find((group) => group.id === "content/main")?.fields.map((f) => f.key);
    const einstellungen = content?.groups.find((group) => group.id === "content/settings")?.fields.map((f) => f.key);
    expect(inhalt).toEqual(expect.arrayContaining(["text", "eyebrow"]));
    expect(inhalt).not.toContain("level");
    expect(einstellungen).toEqual(expect.arrayContaining(["level", "hidden_tablet", "id"]));
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

  // Elementor-Abgleich 11.11.2026, Befund B1: a fresh heading carries no props,
  // the canvas renders the catalog default h2, the select used to show the
  // first option (h1). Shown value and rendered value must agree.
  it("shows the catalog default in a select whose prop is not set", () => {
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: "sec0000001" },
      node: { primitive: "heading", id: "head000002", props: {} },
    });
    const model = buildInspector({ document: store.document, nodeId: "head000002", breakpoint: "desktop" });
    const level = model?.tabs
      .find((tab) => tab.id === "content")
      ?.groups.flatMap((group) => group.fields)
      .find((field) => field.key === "level");
    expect(level?.value).toBe("h2");
  });

  it("falls back to the catalog default for every select control of the catalog", () => {
    const store = baseStore();
    const misses: string[] = [];
    for (const [index, primitive] of PRIMITIVES.entries()) {
      if (primitive.type === "root") continue;
      const id = `probe${String(index).padStart(5, "0")}`;
      store.apply({
        op: "insertNode",
        parent: { nodeId: "sec0000001" },
        node: { primitive: primitive.type, id, props: {} },
      });
      const model = buildInspector({ document: store.document, nodeId: id, breakpoint: "desktop" });
      const fields = model?.tabs.flatMap((tab) => tab.groups.flatMap((group) => group.fields)) ?? [];
      for (const control of primitive.controls) {
        if (control.kind !== "select" && control.kind !== "choose") continue;
        const field = fields.find((entry) => entry.key === control.key);
        if (field !== undefined && field.value !== control.default) {
          misses.push(`${primitive.type}.${control.key}: ${String(field.value)} != ${String(control.default)}`);
        }
      }
    }
    expect(misses).toEqual([]);
  });

  // The twin names (divider/embed) are rendered by the running section until
  // the parity gate: the Content tab must write the section's props. The
  // primitive's own controls (style/thickness, provider) would be dead writes.
  it("writes the running section's props for a twin name", () => {
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "divider", id: "div0000001", props: { spacing: "m" } },
    });
    const divider = buildInspector({
      document: store.document,
      nodeId: "div0000001",
      breakpoint: "desktop",
    });
    const content = divider?.tabs.find((tab) => tab.id === "content");
    // Nur die Gruppe "Inhalt": "Einstellungen" traegt zusaetzlich Sichtbarkeit und ID.
    const fields = content?.groups.find((group) => group.id === "content/main")?.fields ?? [];
    expect(fields.map((field) => field.key)).toEqual(["spacing"]);
    expect(fields[0]?.kind).toBe("select");
    expect(fields[0]?.options?.map((option) => option.value)).toEqual([
      "xs",
      "s",
      "m",
      "l",
      "xl",
    ]);
    expect(fields[0]?.value).toBe("m");
  });

  // A running section is named by its title: "Hero bearbeiten", not "hero bearbeiten".
  it("titles a running section by its registry title", () => {
    createRegistry();
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "hero", id: "hero000001" },
    });
    const model = buildInspector({ document: store.document, nodeId: "hero000001", breakpoint: "desktop" });
    expect(model?.title).toBe("Hero");
  });

  it("orders the Style tab in the eight categories of the reference editor", () => {
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "frame", id: "frame00001" },
    });
    const model = buildInspector({ document: store.document, nodeId: "frame00001", breakpoint: "desktop" });
    const style = model?.tabs.find((tab) => tab.id === "style");
    const order = [
      "style/layout",
      "style/spacing",
      "style/size",
      "style/position",
      "style/typography",
      "style/background",
      "style/border",
      "style/effects",
    ];
    const ids = (style?.groups ?? []).map((group) => group.id).filter((id) => order.includes(id));
    // Reihenfolge wie im Referenz-Editor: eine Teilfolge von Layout ... Effekte.
    expect(ids).toEqual(order.filter((id) => ids.includes(id)));
    expect(ids).toEqual(expect.arrayContaining(["style/layout", "style/spacing", "style/size", "style/position"]));
    const labels = Object.fromEntries((style?.groups ?? []).map((group) => [group.id, group.label]));
    expect(labels["style/spacing"]).toBe("Abstände");
    expect(labels["style/size"]).toBe("Größe");
    expect(labels["style/position"]).toBe("Position");
    // `gap` gehoert zum Layout, Ueberlauf zur Groesse, z-index zur Position.
    const field = (group: string, key: string) => {
      const g = style?.groups.find((entry) => entry.id === group);
      return [...(g?.fields ?? []), ...(g?.more ?? [])].find((entry) => entry.key === key);
    };
    expect(field("style/layout", "gap")).toBeDefined();
    expect(field("style/size", "overflow")).toBeDefined();
    expect(field("style/position", "zIndex")).toBeDefined();
  });

  it("labels keyword options in German instead of the raw CSS values", () => {
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "frame", id: "frame00003" },
    });
    const model = buildInspector({ document: store.document, nodeId: "frame00003", breakpoint: "desktop" });
    const style = model?.tabs.find((tab) => tab.id === "style");
    const field = (key: string) =>
      style?.groups.flatMap((group) => [...group.fields, ...(group.more ?? [])]).find((entry) => entry.key === key);
    expect(field("flexDirection")?.options?.map((option) => option.label)).toEqual([
      "Zeile",
      "Zeile umgekehrt",
      "Spalte",
      "Spalte umgekehrt",
    ]);
    expect(field("flexWrap")?.options?.map((option) => option.label)).toEqual(["Kein", "Umbruch", "Umgekehrt"]);
    // Der Wert bleibt der CSS-Wert, nur die Beschriftung ist deutsch.
    expect(field("flexDirection")?.options?.map((option) => option.value)).toEqual([
      "row",
      "row-reverse",
      "column",
      "column-reverse",
    ]);
    expect(field("position")?.options?.map((option) => option.label)).toEqual([
      "Statisch",
      "Relativ",
      "Absolut",
      "Fixiert",
      "Klebend",
    ]);
  });

  it("keeps rarely used style fields behind 'more' and the common ones in front", () => {
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "frame", id: "frame00002" },
    });
    const model = buildInspector({ document: store.document, nodeId: "frame00002", breakpoint: "desktop" });
    const size = model?.tabs.find((tab) => tab.id === "style")?.groups.find((group) => group.id === "style/size");
    expect(size?.fields.map((f) => f.key)).toEqual(expect.arrayContaining(["width", "height"]));
    expect(size?.fields.map((f) => f.key)).not.toContain("minWidth");
    expect(size?.more?.map((f) => f.key)).toEqual(expect.arrayContaining(["minWidth", "maxWidth", "overflow"]));
    const position = model?.tabs.find((tab) => tab.id === "style")?.groups.find((group) => group.id === "style/position");
    expect(position?.fields.map((f) => f.key)).toEqual(expect.arrayContaining(["position", "zIndex"]));
    expect(position?.more?.map((f) => f.key)).toEqual(expect.arrayContaining(["top", "left"]));
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

  it("offers the structural flags in the Einstellungen group of the Allgemein tab", () => {
    const store = baseStore();
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
    });
    // Den Tab "Erweitert" gibt es nicht mehr, seine Felder stehen unter "Einstellungen".
    expect(model?.tabs.some((tab) => (tab.id as string) === "advanced")).toBe(false);
    const general = model?.tabs.find((tab) => tab.id === "content");
    const fields = general?.groups.find((group) => group.id === "content/settings")?.fields ?? [];
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

  it("offers theme tokens for non-colour style fields (point 6)", () => {
    const store = baseStore();
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    const fields = model?.tabs
      .flatMap((tab) => tab.groups)
      .flatMap((group) => group.fields);
    const margin = fields?.find((entry) => entry.key === "margin");
    expect(margin?.tokenOptions?.length ?? 0).toBeGreaterThan(0);
    // A spacing literal is normal, not a warning (the warning is the colour rule).
    expect(margin?.literalWarning).toBeUndefined();
    const shadow = fields?.find((entry) => entry.key === "boxShadow");
    expect(shadow?.tokenOptions?.length ?? 0).toBeGreaterThan(0);
    const fontSize = fields?.find((entry) => entry.key === "fontSize");
    expect(fontSize?.tokenOptions?.length ?? 0).toBeGreaterThan(0);
    expect(fontSize?.tokenOptions?.map((option) => option.ref)).toContain("type.h1.size");
    const fontFamily = fields?.find((entry) => entry.key === "fontFamily");
    expect(fontFamily?.tokenOptions?.map((option) => option.ref)).toContain("font.display");
    // The heading owns no border group: no radius tokens offered.
    expect(fields?.some((entry) => entry.key === "borderRadius")).toBe(false);
  });

  it("reads and commits pseudo states through the scoped rule (point 5)", () => {
    const store = baseStore();
    store.apply({
      op: "upsertStyleRule",
      rule: {
        ...createScopedRule({ id: "scope00001", nodeId: "head000001" }),
        states: { hover: { color: "#00ff00", fontSize_mobile: 30 } },
      },
    });
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
      state: "hover",
    });
    expect(model?.state).toBe("hover");
    const color = model?.tabs
      .flatMap((tab) => tab.groups)
      .flatMap((group) => group.fields)
      .find((entry) => entry.key === "color");
    expect(color?.value).toBe("#00ff00");
    expect(color?.commit).toEqual({ kind: "state", state: "hover" });
    expect(color?.overridden).toBe(false);

    const mobile = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "mobile",
      state: "hover",
    });
    const mobileFont = mobile?.tabs
      .flatMap((tab) => tab.groups)
      .flatMap((group) => group.fields)
      .find((entry) => entry.key === "fontSize");
    expect(mobileFont?.value).toBe(30);
    expect(mobileFont?.overridden).toBe(true);
    expect(mobileFont?.overrideDevices).toContain("mobile");

    // The base state still reads the node props, not the rule.
    const base = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
    });
    expect(base?.state).toBeNull();
    const baseColor = base?.tabs
      .flatMap((tab) => tab.groups)
      .flatMap((group) => group.fields)
      .find((entry) => entry.key === "color");
    expect(baseColor?.commit).toEqual({ kind: "prop" });
  });

  it("keeps own CSS properties editable in the custom group (point 3)", () => {
    const store = baseStore();
    store.apply({
      op: "setNodeProp",
      id: "head000001",
      key: "textDecorationThickness",
      value: "2px",
    });
    const model = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
    });
    const custom = model?.tabs.find((tab) => tab.id === "style")?.groups.find(
      (group) => group.id === "style/custom",
    );
    const field = custom?.fields.find((entry) => entry.key === "textDecorationThickness");
    expect(field?.value).toBe("2px");
    expect(field?.kind).toBe("text");
    expect(field?.commit).toEqual({ kind: "prop" });

    // A custom property inside a pseudo state stays reachable there.
    store.apply({
      op: "upsertStyleRule",
      rule: {
        ...createScopedRule({ id: "scope00001", nodeId: "head000001" }),
        states: { focus: { scrollSnapType: "x mandatory" } },
      },
    });
    const stateModel = buildInspector({
      document: store.document,
      nodeId: "head000001",
      breakpoint: "desktop",
      state: "focus",
    });
    const stateCustom = stateModel?.tabs
      .find((tab) => tab.id === "style")
      ?.groups.find((group) => group.id === "style/custom");
    const stateField = stateCustom?.fields.find((entry) => entry.key === "scrollSnapType");
    expect(stateField?.value).toBe("x mandatory");
    expect(stateField?.commit).toEqual({ kind: "state", state: "focus" });
  });

  // Ticket 04: an instance has no controls of its own — its Content tab shows
  // the parts of the definition, and the fields write the instance's override
  // bag. The definition's values stay the base the reset returns to.
  it("offers the definition's parts as overrides on an instance", () => {
    const store = baseStore();
    createComponent(store, "head000001", "karte");
    const instanceId = store.document.nodes["sec0000001"]?.children?.[0] ?? "";
    setComponentOverride(store, instanceId, "head000001", "text", "Eigene Karte");

    const model = buildInspector({
      document: store.document,
      nodeId: instanceId,
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    const groups = model?.tabs.find((tab) => tab.id === "content")?.groups ?? [];
    const overrideGroup = groups.find((group) => group.id === "content/override:head000001");
    expect(overrideGroup).toBeDefined();
    const text = overrideGroup?.fields.find((field) => field.key === "text");
    expect(text?.value).toBe("Eigene Karte");
    expect(text?.base).toBe("Hallo");
    expect(text?.overridden).toBe(true);
    expect(text?.commit).toEqual({ kind: "override", partId: "head000001" });

    // Clearing the override in the model view: the value falls back, the
    // field reports it as not overridden.
    setComponentOverride(store, instanceId, "head000001", "text", null);
    const plain = buildInspector({
      document: store.document,
      nodeId: instanceId,
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    const plainText = plain?.tabs
      .find((tab) => tab.id === "content")
      ?.groups.find((group) => group.id === "content/override:head000001")
      ?.fields.find((field) => field.key === "text");
    expect(plainText?.value).toBe("Hallo");
    expect(plainText?.overridden).toBe(false);
  });

  // Ticket 04, device levels: the override bag carries the same suffix keys as
  // a plain prop, so the fields resolve per breakpoint and the device dots see
  // the existing levels.
  it("gives instance overrides device levels", () => {
    const store = baseStore();
    createComponent(store, "head000001", "karte");
    const instanceId = store.document.nodes["sec0000001"]?.children?.[0] ?? "";
    setComponentOverride(store, instanceId, "head000001", "text_tablet", "Klein");

    const tablet = buildInspector({
      document: store.document,
      nodeId: instanceId,
      breakpoint: "tablet",
      theme: defaultTheme(),
    });
    const tabletText = tablet?.tabs
      .find((tab) => tab.id === "content")
      ?.groups.find((group) => group.id === "content/override:head000001")
      ?.fields.find((field) => field.key === "text");
    expect(tabletText?.value).toBe("Klein");
    expect(tabletText?.overridden).toBe(true);
    expect(tabletText?.overrideDevices).toEqual(["tablet"]);

    // Desktop shows the definition's value and no override of its own; the
    // tablet dot stays filled.
    const desktop = buildInspector({
      document: store.document,
      nodeId: instanceId,
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    const desktopText = desktop?.tabs
      .find((tab) => tab.id === "content")
      ?.groups.find((group) => group.id === "content/override:head000001")
      ?.fields.find((field) => field.key === "text");
    expect(desktopText?.value).toBe("Hallo");
    expect(desktopText?.overridden).toBe(false);
    expect(desktopText?.overrideDevices).toEqual(["tablet"]);
  });

  // Ticket 04, variants: the instance gets one switch per declared variant; the
  // active ones are on, and the commit writes the instance's variant list (the
  // definition's overlays stay where they are).
  it("offers the declared variants as switches on an instance", () => {
    const store = baseStore();
    const definitionId = createComponent(store, "head000001", "karte");
    const instanceId = store.document.nodes["sec0000001"]?.children?.[0] ?? "";
    store.applyBatch(
      [
        {
          op: "setNodeProp",
          id: definitionId!,
          key: "variants",
          value: {
            groß: { head000001: { text: "Groß" } },
            dunkel: { head000001: { text: "Dunkel" } },
          },
        },
      ],
      { label: "Varianten anlegen" },
    );
    setComponentVariants(store, instanceId, ["dunkel"]);

    const model = buildInspector({
      document: store.document,
      nodeId: instanceId,
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    const group = model?.tabs
      .find((tab) => tab.id === "content")
      ?.groups.find((entry) => entry.id === "content/variants");
    expect(group?.label).toBe("Varianten");
    expect(group?.fields.map((field) => field.key)).toEqual(["groß", "dunkel"]);
    const active = group?.fields.find((field) => field.key === "dunkel");
    expect(active?.kind).toBe("switcher");
    expect(active?.value).toBe(true);
    expect(active?.overridden).toBe(true);
    expect(active?.commit).toEqual({ kind: "variant" });
    expect(group?.fields.find((field) => field.key === "groß")?.value).toBe(false);

    // A definition without variants gets no group.
    const store2 = baseStore();
    createComponent(store2, "head000001", "karte");
    const plainInstance = store2.document.nodes["sec0000001"]?.children?.[0] ?? "";
    const plain = buildInspector({
      document: store2.document,
      nodeId: plainInstance,
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    expect(
      plain?.tabs
        .find((tab) => tab.id === "content")
        ?.groups.some((entry) => entry.id === "content/variants"),
    ).toBe(false);
  });

  // Ticket 04, variant register: a definition shows one editable row per
  // variant (the name is the value, the commit renames the overlay and pulls
  // the active instances along); an instance gets the switches instead.
  it("offers the variant register on a definition", () => {
    const store = baseStore();
    const definitionId = createComponent(store, "head000001", "karte");
    store.applyBatch(
      [
        {
          op: "setNodeProp",
          id: definitionId!,
          key: "variants",
          value: { groß: { head000001: { text: "Groß" } } },
        },
      ],
      { label: "Varianten anlegen" },
    );

    const model = buildInspector({
      document: store.document,
      nodeId: definitionId!,
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    const group = model?.tabs
      .find((tab) => tab.id === "content")
      ?.groups.find((entry) => entry.id === "content/variant-register");
    expect(group?.label).toBe("Varianten");
    const row = group?.fields[0];
    expect(row?.key).toBe("groß");
    expect(row?.kind).toBe("text");
    expect(row?.value).toBe("groß");
    expect(row?.commit).toEqual({ kind: "variant-rename", name: "groß" });
    expect(row?.responsive).toBe(false);
    expect(row?.overridden).toBe(false);
    // The instance of the same definition shows the switch group, not the
    // register.
    const instanceId = store.document.nodes["sec0000001"]?.children?.[0] ?? "";
    const instanceModel = buildInspector({
      document: store.document,
      nodeId: instanceId,
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    expect(
      instanceModel?.tabs
        .find((tab) => tab.id === "content")
        ?.groups.some((entry) => entry.id === "content/variant-register"),
    ).toBe(false);

    // A definition without variants gets no register group.
    const store2 = baseStore();
    const plainId = createComponent(store2, "head000001", "karte");
    const plain = buildInspector({
      document: store2.document,
      nodeId: plainId!,
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    expect(
      plain?.tabs
        .find((tab) => tab.id === "content")
        ?.groups.some((entry) => entry.id === "content/variant-register"),
    ).toBe(false);
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

  it("edits imported tween values without dropping the original curve", () => {
    const current = { preset: "imported-appear", trigger: "load" as const, importedAppear: { from: { opacity: 0, x: 0, y: 28, scale: 1 }, to: { opacity: 1, x: 0, y: 0, scale: 1 }, durationMs: 1000, delayMs: 200, easing: [0.22, 1, 0.36, 1] as [number, number, number, number] } };
    const updated = motionSpecFrom("imported-appear", { appearFromY: 40, appearDelay: 400 }, current);
    expect(updated.importedAppear?.from.y).toBe(40);
    expect(updated.importedAppear?.delayMs).toBe(400);
    expect(updated.importedAppear?.easing).toEqual([0.22, 1, 0.36, 1]);
    expect(updated.trigger).toBe("load");
  });
});

// Task 1: der Content-Tab gruppiert Controls nach `control.group`. Diese Fälle
// beweisen die Gruppierung direkt am Inspector-Modell (nicht nur am Schema).
// Rot gegen die alte Ein-Gruppen-Implementierung: die kannte nur die Gruppen
// "content/main" und "content/settings" — nie eine explizite Gruppe wie
// "content/bewegung", und sie legte alle Nicht-Settings-Felder in "content/main".
describe("Content-Gruppen nach control.group", () => {
  it("gruppiert Content-Controls nach group in First-Appearance-Reihenfolge", () => {
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "fixture-gruppen", id: "fix0000001", props: {} },
    });
    const model = buildInspector({
      document: store.document,
      nodeId: "fix0000001",
      breakpoint: "desktop",
    });
    const groups = model?.tabs.find((tab) => tab.id === "content")?.groups ?? [];
    // First-Appearance: "Bewegung" (speed) vor "Inhalt" (foo), Einstellungen zuletzt.
    expect(groups.map((group) => group.id)).toEqual([
      "content/bewegung",
      "content/main",
      "content/settings",
    ]);
    expect(groups.map((group) => group.label)).toEqual(["Bewegung", "Inhalt", "Einstellungen"]);
    const bewegung = groups.find((group) => group.id === "content/bewegung");
    // Katalog-Reihenfolge innerhalb der Gruppe: speed vor direction; das
    // ungruppierte foo bleibt draußen.
    expect(bewegung?.fields.map((field) => field.key)).toEqual(["speed", "direction"]);
    const inhalt = groups.find((group) => group.id === "content/main");
    expect(inhalt?.fields.map((field) => field.key)).toEqual(["foo"]);
    // Das Settings-Control (anchorId steht in SETTINGS_KEYS) landet in
    // "Einstellungen", nicht in den Content-Gruppen.
    const settings = groups.find((group) => group.id === "content/settings");
    expect(settings?.fields.map((field) => field.key)).toEqual(expect.arrayContaining(["anchorId"]));
    expect(bewegung?.fields.some((field) => field.key === "anchorId")).toBe(false);
    expect(inhalt?.fields.some((field) => field.key === "anchorId")).toBe(false);
  });

  it("bildet den Gruppen-Slug und behält die Default-Gruppe nur für ungruppierte Controls", () => {
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "fixture-slug", id: "fix0000002", props: {} },
    });
    const model = buildInspector({
      document: store.document,
      nodeId: "fix0000002",
      breakpoint: "desktop",
    });
    const groups = model?.tabs.find((tab) => tab.id === "content")?.groups ?? [];
    // "Darstellung & Farbe" wird zum Slug "darstellung-farbe"; die Gruppe
    // "Bewegung" erscheint nur einmal (Map), obwohl gamma sie erneut nutzt.
    expect(groups.map((group) => group.id)).toEqual([
      "content/bewegung",
      "content/darstellung-farbe",
      "content/settings",
    ]);
    const bewegung = groups.find((group) => group.id === "content/bewegung");
    expect(bewegung?.fields.map((field) => field.key)).toEqual(["alpha", "gamma"]);
    const darstellung = groups.find((group) => group.id === "content/darstellung-farbe");
    expect(darstellung?.label).toBe("Darstellung & Farbe");
    expect(darstellung?.fields.map((field) => field.key)).toEqual(["beta"]);
    // Kein ungruppiertes Control: die Default-Gruppe "Inhalt" entfällt.
    expect(groups.some((group) => group.id === "content/main")).toBe(false);
  });

  // Task 3: jetzt mit einem echten Katalog-Primitive — die Framer-Einstellungen
  // der Ribbon Gallery erscheinen als eigene Content-Gruppen in Katalog-Reihenfolge
  // ("Einstellungen" zuletzt).
  it("gruppiert die Ribbon-Gallery-Einstellungen in Katalog-Reihenfolge", () => {
    const store = baseStore();
    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "ribbon-gallery", id: "rib0000001", props: {} },
    });
    const model = buildInspector({
      document: store.document,
      nodeId: "rib0000001",
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    const groups = model?.tabs.find((tab) => tab.id === "content")?.groups ?? [];
    expect(groups.map((group) => group.label)).toEqual([
      "Bilder",
      "Seite",
      "Bewegung",
      "Form",
      "Optik",
      "Einblendung",
      "Einstellungen",
    ]);
    expect(groups[groups.length - 1]?.id).toBe("content/settings");
    const groupOf = (key: string) =>
      groups.find((group) => group.fields.some((field) => field.key === key))?.label;
    expect(groupOf("images")).toBe("Bilder");
    expect(groupOf("speed")).toBe("Bewegung");
    expect(groupOf("radius")).toBe("Form");
    expect(groupOf("trigger")).toBe("Einblendung");
    // Jedes Feld steht in genau einer Content-Gruppe; die Settings tragen die
    // Struktur-Flags (Sonderfall) und wiederholen kein Katalog-Control.
    const contentKeys = groups
      .filter((group) => group.id !== "content/settings")
      .flatMap((group) => group.fields.map((field) => field.key));
    expect(new Set(contentKeys).size).toBe(contentKeys.length);
    const fieldOf = (key: string) =>
      groups.flatMap((group) => group.fields).find((field) => field.key === key);
    expect(fieldOf("start")?.hidden).toBe(false);
    expect(fieldOf("replay")?.hidden).toBe(false);
    expect(fieldOf("delay")?.hidden).toBe(false);

    store.apply({
      op: "insertNode",
      parent: { nodeId: store.document.rootNodeId },
      node: { primitive: "ribbon-gallery", id: "rib0000002", props: { trigger: "none" } },
    });
    const noneGroups =
      buildInspector({
        document: store.document,
        nodeId: "rib0000002",
        breakpoint: "desktop",
        theme: defaultTheme(),
      })?.tabs.find((tab) => tab.id === "content")?.groups ?? [];
    const noneFieldOf = (key: string) =>
      noneGroups.flatMap((group) => group.fields).find((field) => field.key === key);
    expect(noneFieldOf("start")?.hidden).toBe(true);
    expect(noneFieldOf("replay")?.hidden).toBe(true);
    expect(noneFieldOf("delay")?.hidden).toBe(true);
  });
});
