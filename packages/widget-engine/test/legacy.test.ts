import { describe, expect, it } from "vitest";
import { EXPECTED_SECTION_TYPES } from "@senify/registry";
import {
  LEGACY_SECTION_TYPES,
  getPrimitive,
  isLegacySection,
  primitiveTypes,
  registerLegacyName,
} from "../src/index.ts";

// The legacy section bridge (Phase 0, fifth slice) keeps a migrated v1 page
// loadable: every section type is a structurally tolerated stand-in.

describe("legacy section bridge", () => {
  it("mirrors the section registry", () => {
    expect([...LEGACY_SECTION_TYPES].sort()).toEqual([...EXPECTED_SECTION_TYPES].sort());
  });

  it("resolves every section type to a primitive", () => {
    const known = new Set(primitiveTypes());
    for (const type of LEGACY_SECTION_TYPES) {
      const definition = getPrimitive(type);
      expect(definition, type).toBeDefined();
      expect(isLegacySection(type), type).toBe(true);
      // Types that are also real primitives keep their real definition.
      if (!known.has(type)) {
        expect(definition?.legacy, type).toBe(true);
      }
    }
  });

  it("still reports a truly unknown type", () => {
    expect(getPrimitive("nope")).toBeUndefined();
    expect(isLegacySection("nope")).toBe(false);
  });

  // The registry hands each running section's title to its stand-in
  // (`createRegistry()`); a type that is no legacy section is never touched.
  it("takes the section's title once it is registered", () => {
    expect(getPrimitive("banner")?.name).toBe("banner");
    registerLegacyName("banner", "Banner");
    expect(getPrimitive("banner")?.name).toBe("Banner");
    expect(getPrimitive("banner")?.legacy).toBe(true);
  });

  it("ignores a name for a type that is no legacy section", () => {
    registerLegacyName("heading", "Gekapert");
    registerLegacyName("nope", "Nope");
    expect(getPrimitive("heading")?.name).not.toBe("Gekapert");
    expect(getPrimitive("nope")).toBeUndefined();
  });
});
