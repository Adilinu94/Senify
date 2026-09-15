import { describe, expect, it } from "vitest";
import {
  createRegistry,
  EXPECTED_SECTION_TYPES,
  heroSection,
} from "@senify/registry";
import { isPropHidden, validatePropValues } from "@senify/section-sdk";

describe("section catalog", () => {
  it("registers all 28 sections in build order", () => {
    const registry = createRegistry();
    expect(EXPECTED_SECTION_TYPES).toHaveLength(28);
    expect(registry.list().map((section) => section.type)).toEqual([
      ...EXPECTED_SECTION_TYPES,
    ]);
  });

  it("references only motion presets from the artifacts/03 catalog", () => {
    const catalog = [
      "fade-up",
      "fade-up-deblur",
      "masked-headline",
      "stagger-cascade",
      "scroll-reveal",
      "scrub-pin",
      "sticky-stack",
      "horizontal-pan",
      "parallax-subtle",
      "scroll-progress",
      "counter",
      "marquee",
      "char-split",
      "hover-lift",
      "magnetic-button",
      "tilt-card",
      "cursor-glow",
      "page-fade",
      "preloader-light",
      "accordion",
      "modal",
      "ambient-float",
      "grain",
      "webgl-scene",
    ];
    const registry = createRegistry();
    for (const definition of registry.list()) {
      for (const preset of definition.motionPresets ?? []) {
        expect(
          catalog,
          `${definition.type} motion preset "${preset}"`,
        ).toContain(preset);
      }
    }
  });

  it("validates every golden example against its own definition", () => {
    const registry = createRegistry();
    for (const definition of registry.list()) {
      const issues = registry.validateGoldenTree(
        definition,
        definition.golden.tree,
      );
      expect(issues, `golden of ${definition.type}`).toEqual([]);
      // The golden depicts the default variant (first key).
      const names = Object.keys(definition.variants ?? {});
      if (definition.golden.tree.variant !== undefined) {
        expect(definition.golden.tree.variant, `golden variant of ${definition.type}`).toBe(
          names[0],
        );
      }
    }
  });

  it("validates every variant preset", () => {
    const registry = createRegistry();
    for (const definition of registry.list()) {
      for (const [name, variant] of Object.entries(definition.variants ?? {})) {
        const issues = validatePropValues(
          definition,
          variant.preset as Record<string, never>,
          `variants.${name}.preset`,
        );
        expect(issues, `preset ${definition.type}/${name}`).toEqual([]);
      }
    }
  });

  it("declares thumbnails for the default variant and every other variant", () => {
    const registry = createRegistry();
    for (const definition of registry.list()) {
      const names = Object.keys(definition.variants ?? {});
      expect(names.length, `${definition.type} variants`).toBeGreaterThanOrEqual(2);
      const base = definition.golden.thumbnails;
      expect(base.desktop, `${definition.type} thumbnail desktop`).toMatch(
        /^thumbnails\/.+-1440\.png$/,
      );
      expect(base.tablet, `${definition.type} thumbnail tablet`).toMatch(
        /^thumbnails\/.+-810\.png$/,
      );
      expect(base.mobile, `${definition.type} thumbnail mobile`).toMatch(
        /^thumbnails\/.+-390\.png$/,
      );
      for (const name of names.slice(1)) {
        const thumbs = definition.golden.variantThumbnails?.[name];
        expect(thumbs, `${definition.type}/${name} thumbnails`).toBeDefined();
        expect(thumbs?.desktop).toMatch(/^thumbnails\/.+-1440\.png$/);
        expect(thumbs?.tablet).toMatch(/^thumbnails\/.+-810\.png$/);
        expect(thumbs?.mobile).toMatch(/^thumbnails\/.+-390\.png$/);
      }
    }
  });

  it("exposes agent-readable descriptions and UI metadata", () => {
    const registry = createRegistry();
    for (const definition of registry.list()) {
      expect(
        definition.description.length,
        `${definition.type} description`,
      ).toBeGreaterThan(40);
      expect(definition.props.length, `${definition.type} props`).toBeGreaterThan(0);
      for (const spec of [...definition.props, ...(definition.styleProps ?? [])]) {
        expect(spec.label.length, `${definition.type}.${spec.key} label`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the hero golden valid and its presets declared", () => {
    const registry = createRegistry();
    const issues = registry.validateGoldenTree(
      registry.get("hero"),
      heroSection.golden.tree,
    );
    expect(issues).toEqual([]);
    expect(Object.keys(heroSection.variants ?? {})).toEqual([
      "centered",
      "split",
      "showcase-3d",
    ]);
    expect(heroSection.motionPresets).toContain("masked-headline");
  });

  it("gives every section the standard style set", () => {
    const registry = createRegistry();
    const standardKeys = [
      "background",
      "textColor",
      "paddingY",
      "contentWidth",
      "align",
    ];
    for (const definition of registry.list()) {
      const byKey = new Map(
        (definition.styleProps ?? []).map((spec) => [spec.key, spec]),
      );
      for (const key of standardKeys) {
        expect(
          byKey.get(key),
          `${definition.type} style prop "${key}"`,
        ).toBeDefined();
      }
      expect(byKey.get("background")?.control, definition.type).toBe("color");
      expect(byKey.get("textColor")?.control, definition.type).toBe("color");
      expect(byKey.get("paddingY")?.control, definition.type).toBe("scale");
      expect(byKey.get("paddingY")?.tokenGroup, definition.type).toBe("space");
      expect(byKey.get("contentWidth")?.group, definition.type).toBe("Layout");
      expect(byKey.get("align")?.group, definition.type).toBe("Layout");
      for (const spec of definition.styleProps ?? []) {
        if (spec.control === "color" || spec.control === "scale") {
          expect(
            spec.tokenGroup,
            `${definition.type}.${spec.key} tokenGroup`,
          ).toBeDefined();
        }
      }
    }
  });

  it("declares named parts with matching keys and token groups", () => {
    const registry = createRegistry();
    const partOwners = new Set<string>();
    for (const definition of registry.list()) {
      for (const spec of definition.styleProps ?? []) {
        if (spec.part === undefined) continue;
        partOwners.add(spec.part);
        expect(
          spec.tokenGroup,
          `${definition.type}.${spec.key} tokenGroup`,
        ).toBeDefined();
        expect(
          spec.key.startsWith(spec.part),
          `${definition.type}.${spec.key} part prefix`,
        ).toBe(true);
      }
    }
    expect([...partOwners].sort()).toEqual([
      "button",
      "card",
      "heading",
      "link",
      "media",
    ]);
  });

  it("validates token refs and free values for the standard style set", () => {
    const registry = createRegistry();
    for (const definition of registry.list()) {
      const issues = validatePropValues(definition, {
        background: { $token: "bg.muted" },
        textColor: "#111827",
        paddingY: "96px",
        contentWidth: "wide",
        align: "center",
      });
      expect(issues, `${definition.type} style values`).toEqual([]);
    }
  });
});

describe("hidden conditions", () => {
  it("evaluates boolean, equals and notEquals", () => {
    expect(isPropHidden(undefined, {})).toBe(false);
    expect(isPropHidden(true, {})).toBe(true);
    expect(isPropHidden(false, { a: 1 })).toBe(false);
    expect(
      isPropHidden({ prop: "mode", equals: "simple" }, { mode: "simple" }),
    ).toBe(true);
    expect(
      isPropHidden({ prop: "mode", equals: "simple" }, { mode: "advanced" }),
    ).toBe(false);
    expect(
      isPropHidden({ prop: "billingToggle", notEquals: true }, { billingToggle: true }),
    ).toBe(false);
    expect(
      isPropHidden({ prop: "billingToggle", notEquals: true }, { billingToggle: false }),
    ).toBe(true);
    expect(isPropHidden({ prop: "missing", notEquals: true }, {})).toBe(true);
  });

  it("hides the pricing billing note unless the toggle is on", () => {
    const registry = createRegistry();
    const pricing = registry.get("pricing");
    const note = pricing.props.find((spec) => spec.key === "billingNote");
    expect(note).toBeDefined();
    expect(isPropHidden(note?.hidden, { billingToggle: true })).toBe(false);
    expect(isPropHidden(note?.hidden, { billingToggle: false })).toBe(true);
  });
});
