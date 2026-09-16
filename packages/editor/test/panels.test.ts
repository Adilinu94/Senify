import { describe, expect, it } from "vitest";
import { buildMotionPanel, buildPanels, tokenOptionsFor, type PanelField } from "@senify/editor";
import { defaultTheme } from "@senify/tokens";
import { SenifyError } from "@senify/core";
import { draftTree, nodeOf, registry } from "./fixtures.ts";

function fieldFor(nodeId: string, key: string, options?: { breakpoint?: "desktop" | "tablet" | "mobile" }): PanelField {
  const tree = draftTree();
  const node = nodeOf(tree, nodeId);
  const panels = buildPanels({
    definition: registry.get(node.type),
    nodeId,
    tree,
    breakpoint: options?.breakpoint ?? "desktop",
    theme: defaultTheme(),
  });
  const field = panels
    .flatMap((group) => group.fields)
    .find((candidate) => candidate.key === key);
  if (!field) throw new Error(`No panel field "${key}" for ${node.type}`);
  return field;
}

describe("registry-generated property panels", () => {
  it("generates groups and controls from the section PropSpecs", () => {
    const tree = draftTree();
    const panels = buildPanels({
      definition: registry.get("hero"),
      nodeId: "hero000001",
      tree,
      breakpoint: "desktop",
      theme: defaultTheme(),
    });
    expect(panels.map((group) => group.id)).toEqual([
      "Content",
      "Actions",
      "Styling",
      "Layout",
      "Styling/heading",
      "Styling/button",
    ]);
    expect(panels.map((group) => group.label)).toEqual([
      "Content",
      "Aktionen",
      "Styling",
      "Layout",
      "Styling · heading",
      "Styling · button",
    ]);
    const content = panels[0];
    expect(content?.fields.map((field) => field.key)).toEqual([
      "eyebrow",
      "headline",
      "sub",
    ]);
    const actions = panels.find((group) => group.id === "Actions");
    expect(actions?.fields.map((field) => field.key)).toEqual(["ctas"]);
    expect(actions?.fields.find((field) => field.key === "ctas")?.control).toBe("list");
    expect(content?.fields.find((field) => field.key === "headline")?.ui).toBe("text");
    expect(content?.fields.find((field) => field.key === "headline")?.value).toBe(
      "Websites, gebaut von Agenten",
    );
  });

  it("carries min/max/step and enum options from the registry", () => {
    const field = fieldFor("pricing00001", "plans");
    expect(field.control).toBe("list");
    const contentWidth = fieldFor("hero000001", "contentWidth");
    expect(contentWidth.control).toBe("enum");
    expect(contentWidth.options?.map((option) => option.value)).toEqual([
      "narrow",
      "regular",
      "wide",
      "full",
    ]);
  });

  it("evaluates conditional visibility from the PropSpec", () => {
    const tree = draftTree();
    const pricing = nodeOf(tree, "pricing00001");
    pricing.props.billingToggle = false;
    const hidden = buildPanels({
      definition: registry.get("pricing"),
      nodeId: "pricing00001",
      tree,
      breakpoint: "desktop",
      theme: defaultTheme(),
    })
      .flatMap((group) => group.fields)
      .find((candidate) => candidate.key === "billingNote");
    expect(hidden?.hidden).toBe(true);
    pricing.props.billingToggle = true;
    const shown = buildPanels({
      definition: registry.get("pricing"),
      nodeId: "pricing00001",
      tree,
      breakpoint: "desktop",
      theme: defaultTheme(),
    })
      .flatMap((group) => group.fields)
      .find((candidate) => candidate.key === "billingNote");
    expect(shown?.hidden).toBe(false);
  });

  it("offers semantic tokens for token-aware controls", () => {
    const field = fieldFor("hero000001", "background");
    const refs = field.tokenOptions?.map((option) => option.ref) ?? [];
    expect(refs).toContain("bg.base");
    expect(refs).toContain("accent");
    expect(field.tokenOptions?.find((option) => option.ref === "bg.base")?.value).toMatch(
      /^(#|oklch\()/,
    );
    const padding = fieldFor("hero000001", "paddingY");
    expect(padding.tokenOptions?.find((option) => option.ref === "spacing.16")?.value).toBe(
      "4rem",
    );
    expect(tokenOptionsFor("radius", defaultTheme()).map((option) => option.ref)).toContain(
      "radius.full",
    );
  });

  it("warns on a literal where the theme expects a token", () => {
    const tree = draftTree();
    nodeOf(tree, "hero000001").props.background = "#ffffff";
    const literal = buildPanels({
      definition: registry.get("hero"),
      nodeId: "hero000001",
      tree,
      breakpoint: "desktop",
      theme: defaultTheme(),
    })
      .flatMap((group) => group.fields)
      .find((candidate) => candidate.key === "background");
    expect(literal?.literalWarning).toContain("umgeht die Theme-Tokens");
    nodeOf(tree, "hero000001").props.background = { $token: "bg.base" };
    const token = buildPanels({
      definition: registry.get("hero"),
      nodeId: "hero000001",
      tree,
      breakpoint: "desktop",
      theme: defaultTheme(),
    })
      .flatMap((group) => group.fields)
      .find((candidate) => candidate.key === "background");
    expect(token?.literalWarning).toBeUndefined();
  });

  it("shows override badges with the inherited base value", () => {
    const mobile = fieldFor("hero000001", "headline", { breakpoint: "mobile" });
    expect(mobile.overridden).toBe(true);
    expect(mobile.resettable).toBe(true);
    expect(mobile.target).toBe("mobile");
    expect(mobile.value).toBe("Kurz auf Mobile");
    expect(mobile.inherited).toBe("Websites, gebaut von Agenten");
    const desktop = fieldFor("hero000001", "headline");
    expect(desktop.overridden).toBe(false);
    expect(desktop.inherited).toBeUndefined();
  });

  it("fails loudly for nodes that are not in the tree", () => {
    expect(() =>
      buildPanels({
        definition: registry.get("hero"),
        nodeId: "missing",
        tree: draftTree(),
        breakpoint: "desktop",
      }),
    ).toThrow(SenifyError);
  });
});

describe("motion panel", () => {
  it("reads preset, intensity and the section's presets", () => {
    const panel = buildMotionPanel({
      definition: registry.get("hero"),
      nodeId: "hero000001",
      tree: draftTree(),
    });
    expect(panel.presets).toEqual(["masked-headline", "fade-up", "fade-up-deblur"]);
    expect(panel.preset).toBe("masked-headline");
    expect(panel.intensity).toBe(7);
    expect(panel.presetsDisabled).toBe(false);
  });

  it("defaults to intensity 5 for a section without motion", () => {
    const panel = buildMotionPanel({
      definition: registry.get("pricing"),
      nodeId: "pricing00001",
      tree: draftTree(),
    });
    expect(panel.preset).toBeNull();
    expect(panel.intensity).toBe(5);
    expect(panel.presets).toEqual(["fade-up"]);
  });
});
