import { describe, expect, it } from "vitest";
import { EXPECTED_SECTION_TYPES } from "@senify/registry";
import {
  SECTION_COMPOSITION,
  getPrimitive,
  missingPrimitives,
  primitiveTypes,
  primitivesFor,
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
