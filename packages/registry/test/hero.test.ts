import { describe, expect, it } from "vitest";
import { createRegistry, heroSection } from "@senify/registry";

describe("bundled registry", () => {
  it("registers all bundled sections without validation errors", () => {
    const registry = createRegistry();
    expect(registry.list().map((s) => s.type)).toContain("hero");
  });

  it("keeps the hero golden example valid against its own definition", () => {
    const registry = createRegistry();
    const issues = registry.validateGoldenTree(
      registry.get("hero"),
      heroSection.golden.tree,
    );
    expect(issues).toEqual([]);
  });

  it("declares variants and motion presets", () => {
    const hero = heroSection;
    expect(Object.keys(hero.variants ?? {})).toEqual([
      "centered",
      "split",
      "showcase-3d",
    ]);
    expect(hero.motionPresets).toContain("masked-headline");
  });
});
