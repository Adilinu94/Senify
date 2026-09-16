import { describe, expect, it } from "vitest";
import {
  assertInlineEditingSupported,
  buildPuckConfig,
  INLINE_ROOT_UNSUPPORTED,
  isPuckIssueCovered,
  KNOWN_ISSUE_IDS,
  PUCK_KNOWN_ISSUES,
  PUCK_PACKAGE,
  PUCK_PACKAGE_SPEC,
  PUCK_VERSION,
  puckOverrides,
  SENIFY_FIELD_TYPES,
} from "@senify/editor";
import { registry } from "./fixtures.ts";

// Upgrade regression cases (artifacts/24 §1, research/28): the two known
// 0.23 bugs must stay covered when Puck is bumped.
describe("Puck upgrade regression cases", () => {
  it("pins the analysed Puck version", () => {
    expect(PUCK_PACKAGE).toBe("@puckeditor/core");
    expect(PUCK_VERSION).toBe("0.23.0");
    expect(PUCK_PACKAGE_SPEC).toBe("@puckeditor/core@0.23.0");
  });

  it("documents #1829 and #1794 with workaround and regression case", () => {
    expect(KNOWN_ISSUE_IDS).toEqual([1829, 1794]);
    expect(isPuckIssueCovered(1829)).toBe(true);
    expect(isPuckIssueCovered(1794)).toBe(true);
    expect(isPuckIssueCovered(999)).toBe(false);
    for (const issue of PUCK_KNOWN_ISSUES) {
      expect(issue.version).toBe("0.23.0");
      expect(issue.summary.length).toBeGreaterThan(20);
      expect(issue.workaround.length).toBeGreaterThan(20);
      expect(issue.regression).toMatch(/test\.ts/);
    }
    expect(PUCK_KNOWN_ISSUES.map((issue) => issue.area)).toEqual(["overlays", "inline"]);
  });

  it("never relies on Puck's default overlay or action bar (#1829)", () => {
    const overrides = puckOverrides();
    expect(overrides.actionBar).toBe("custom");
    expect(overrides.componentOverlay).toBe("custom");
    // The frame manager owns the iframes — no nested Puck frame.
    expect(overrides.iframe).toEqual({ enabled: false, syncHostStyles: true });
    expect(overrides.fieldTypes).toEqual(SENIFY_FIELD_TYPES);
  });

  it("refuses inline editing on the page root (#1794)", () => {
    expect(() => assertInlineEditingSupported("hero000001", "page000001")).not.toThrow();
    expect(() => assertInlineEditingSupported("page000001", "page000001")).toThrow(
      INLINE_ROOT_UNSUPPORTED,
    );
  });
});

describe("registry → Puck config", () => {
  const config = buildPuckConfig(registry);

  it("maps every registered section", () => {
    expect(Object.keys(config.components).length).toBe(registry.list().length);
    expect(config.components.hero?.label).toBe("Hero");
  });

  it("maps controls to Puck fields plus our own token/media pickers", () => {
    const hero = config.components.hero;
    expect(hero?.fields.headline?.type).toBe("text");
    expect(hero?.fields.ctas?.type).toBe("array");
    expect(hero?.fields.contentWidth?.type).toBe("select");
    expect(hero?.fields.contentWidth?.options?.map((option) => option.value)).toEqual([
      "narrow",
      "regular",
      "wide",
      "full",
    ]);
    expect(hero?.fields.background?.type).toBe("custom");
    expect(hero?.fields.paddingY?.type).toBe("custom");
    expect(SENIFY_FIELD_TYPES.background).toBeUndefined();
    expect(SENIFY_FIELD_TYPES.color).toBe("senify-token-picker");
    expect(SENIFY_FIELD_TYPES.asset).toBe("senify-media-picker");
    expect(SENIFY_FIELD_TYPES.link).toBe("senify-link-picker");
  });

  it("turns slots into slot fields with the registry allow list", () => {
    const hero = config.components.hero;
    expect(hero?.fields.visual?.type).toBe("slot");
    expect(hero?.fields.visual?.allow).toEqual(["media"]);
    expect(config.components["collection-list"]?.fields.item?.type).toBe("slot");
    expect(config.components["collection-list"]?.fields.item?.allow).toEqual(["card"]);
  });

  it("mirrors registry metadata for the MCP side", () => {
    const hero = config.components.hero;
    expect(hero?.metadata.type).toBe("hero");
    expect(hero?.metadata.variants).toEqual(["centered", "split", "showcase-3d"]);
    expect(hero?.metadata.motionPresets).toContain("masked-headline");
    expect(hero?.metadata.thumbnails).toHaveProperty("desktop");
    expect(hero?.metadata.styleProps).toContain("paddingY");
    expect(hero?.defaultProps.headline).toBeDefined();
  });

  it("uses radio fields for booleans and numbers for numeric props", () => {
    const pricing = config.components.pricing;
    expect(pricing?.fields.billingToggle?.type).toBe("radio");
    expect(pricing?.fields.billingToggle?.options?.map((option) => option.value)).toEqual([
      true,
      false,
    ]);
  });
});
