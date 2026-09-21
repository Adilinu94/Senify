import { describe, expect, it } from "vitest";
import { EXPECTED_SECTION_TYPES } from "@senify/registry";
import {
  LEGACY_SECTION_TYPES,
  SECTION_COMPOSITION,
  SECTION_PRIMITIVE_TWINS,
  getPrimitive,
  isSectionPrimitiveTwin,
  missingPrimitives,
  primitiveTypes,
  primitivesFor,
  sectionToPrimitiveProps,
  sectionTwinControls,
  unusedPrimitiveTypes,
} from "../src/index.ts";

describe("section mapping", () => {
  it("covers the 28 existing building blocks without duplicates", () => {
    expect(SECTION_COMPOSITION).toHaveLength(28);
    const names = SECTION_COMPOSITION.map((entry) => entry.section);
    expect(new Set(names).size).toBe(28);
    expect([...names].sort()).toEqual([...EXPECTED_SECTION_TYPES].sort());
  });

  it("composes every building block from real primitives", () => {
    const known = new Set(primitiveTypes());
    for (const entry of SECTION_COMPOSITION) {
      expect(entry.primitives.length, entry.section).toBeGreaterThan(0);
      for (const primitive of entry.primitives) {
        expect(known.has(primitive), `${entry.section} -> ${primitive}`).toBe(true);
      }
    }
  });

  it("has no gaps between mapping and catalog", () => {
    expect(missingPrimitives()).toEqual([]);
  });

  it("fills the expected gaps (table, accordion, body)", () => {
    expect(getPrimitive("table")).toBeDefined();
    expect(getPrimitive("accordion")).toBeDefined();
    expect(getPrimitive("body")).toBeDefined();
  });

  it("resolves the primitives of a known block and of an unknown one", () => {
    expect(primitivesFor("faq")).toContain("accordion");
    expect(primitivesFor("nope")).toBeUndefined();
  });

  it("only leaves the document root unused by the blocks", () => {
    expect(unusedPrimitiveTypes()).toEqual(["root"]);
  });
});

// The twin names (see `legacy.ts`): exactly two names live in both vocabularies.
// The running section renders until the parity gate, so the editor writes the
// section's controls and the cutover migration reads the prop bridge.
describe("section/primitive twins", () => {
  it("pins the collision set to divider and embed", () => {
    const primitives = new Set(primitiveTypes());
    const collision = LEGACY_SECTION_TYPES.filter((type) => primitives.has(type));
    expect(collision).toEqual([...SECTION_PRIMITIVE_TWINS]);
    expect(isSectionPrimitiveTwin("divider")).toBe(true);
    expect(isSectionPrimitiveTwin("embed")).toBe(true);
    expect(isSectionPrimitiveTwin("hero")).toBe(false);
  });

  it("gives the editor the section's controls, not the primitive's", () => {
    expect(sectionTwinControls("divider")?.map((control) => control.key)).toEqual(["spacing"]);
    expect(sectionTwinControls("divider")?.[0]?.kind).toBe("choose");
    expect(sectionTwinControls("embed")?.map((control) => control.key)).toEqual([
      "url",
      "aspect",
      "title",
    ]);
    expect(sectionTwinControls("hero")).toBeUndefined();
  });

  it("maps a divider node onto the primitive shape", () => {
    expect(sectionToPrimitiveProps("divider", { spacing: "m" }, "line")).toEqual({
      style: "line",
      spacing: 32,
    });
    expect(sectionToPrimitiveProps("divider", { spacing: "xl" }, "dots")).toEqual({
      style: "dotted",
      spacing: 128,
    });
    // Legacy nodes without a variant/prop stay the plain default line.
    expect(sectionToPrimitiveProps("divider", {})).toEqual({ style: "line", spacing: 32 });
    expect(sectionToPrimitiveProps("divider", { spacing: "unknown" })).toEqual({
      style: "line",
      spacing: 32,
    });
  });

  it("maps an embed node onto the primitive shape", () => {
    expect(
      sectionToPrimitiveProps(
        "embed",
        { url: "https://example.com/x", aspect: "4/3", title: "Karte" },
        "map",
      ),
    ).toEqual({
      url: "https://example.com/x",
      provider: "map",
      aspect: "4/3",
      title: "Karte",
    });
    // No variant and empty props: the primitive defaults.
    expect(sectionToPrimitiveProps("embed", {})).toEqual({
      url: "",
      provider: "iframe",
      aspect: "16/9",
      title: "Eingebetteter Inhalt",
    });
    // Any other section has no bridge here (their migration is ticket 04).
    expect(sectionToPrimitiveProps("hero", { headline: "Hallo" })).toBeUndefined();
  });
});
