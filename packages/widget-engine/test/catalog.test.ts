import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  PRIMITIVES,
  STYLE_GROUPS,
  getPrimitive,
  primitiveTypes,
  primitivesByCategory,
  validatePrimitive,
} from "../src/index.ts";

const REQUIRED_PRIMITIVES = [
  // Layout
  "frame",
  "column",
  "grid",
  "section",
  // Basis
  "heading",
  "text",
  "body",
  "button",
  "link",
  "list",
  // Media
  "image",
  "video",
  "icon",
  // Formular
  "input",
  "select",
  "checkbox",
  "submit",
  // Erweitert
  "table",
  "accordion",
  "divider",
  "embed",
  "collection",
  "root",
];

describe("categories", () => {
  it("declares the five categories in order", () => {
    expect(CATEGORIES.map((category) => category.id)).toEqual([
      "layout",
      "basic",
      "media",
      "form",
      "advanced",
    ]);
    expect(CATEGORIES.map((category) => category.name)).toEqual([
      "Layout",
      "Basis",
      "Media",
      "Formular",
      "Erweitert",
    ]);
  });

  it("populates every category", () => {
    for (const category of CATEGORIES) {
      expect(
        primitivesByCategory(category.id).length,
        `category ${category.id}`,
      ).toBeGreaterThan(0);
    }
  });

  it("declares the six style groups", () => {
    expect(STYLE_GROUPS.map((group) => group.name)).toEqual([
      "Abstand",
      "Schrift",
      "Farbe",
      "Rahmen",
      "Größe",
      "Effekte",
    ]);
  });
});

describe("catalog", () => {
  it("has unique primitive types and names", () => {
    const types = primitiveTypes();
    expect(new Set(types).size).toBe(types.length);
    const names = PRIMITIVES.map((primitive) => primitive.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("contains every required foundation stone", () => {
    for (const type of REQUIRED_PRIMITIVES) {
      expect(getPrimitive(type), `primitive ${type}`).toBeDefined();
    }
  });

  it("keeps container flag consistent with the child rule", () => {
    for (const primitive of PRIMITIVES) {
      const hasSlots = Object.keys(primitive.slots).length > 0;
      const expected =
        primitive.allowedChildren !== "none" || hasSlots;
      expect(primitive.container, primitive.type).toBe(expected);
    }
  });

  it("references only known primitives as allowed children", () => {
    const known = new Set(primitiveTypes());
    for (const primitive of PRIMITIVES) {
      if (!Array.isArray(primitive.allowedChildren)) continue;
      for (const child of primitive.allowedChildren) {
        expect(known.has(child), `${primitive.type} -> ${child}`).toBe(true);
      }
    }
  });

  it("references only known primitives in slots", () => {
    const known = new Set(primitiveTypes());
    for (const primitive of PRIMITIVES) {
      for (const [name, slot] of Object.entries(primitive.slots)) {
        for (const allowed of slot.allowedTypes ?? []) {
          expect(
            known.has(allowed),
            `${primitive.type}.${name} -> ${allowed}`,
          ).toBe(true);
        }
      }
    }
  });

  it("uses only known, non-empty style groups", () => {
    const known = new Set(STYLE_GROUPS.map((group) => group.id));
    for (const primitive of PRIMITIVES) {
      expect(primitive.styleGroups.length, primitive.type).toBeGreaterThan(0);
      for (const group of primitive.styleGroups) {
        expect(known.has(group), `${primitive.type} -> ${group}`).toBe(true);
      }
    }
  });

  it("ships a meaningful description and name per primitive", () => {
    for (const primitive of PRIMITIVES) {
      expect(primitive.name.length, primitive.type).toBeGreaterThan(0);
      expect(primitive.description.length, primitive.type).toBeGreaterThan(20);
    }
  });
});

describe("property schemas", () => {
  it("validates every primitive definition", () => {
    for (const primitive of PRIMITIVES) {
      expect(validatePrimitive(primitive), primitive.type).toEqual([]);
    }
  });

  it("keeps control keys unique inside a primitive", () => {
    for (const primitive of PRIMITIVES) {
      const keys = primitive.controls.map((control) => control.key);
      expect(new Set(keys).size, primitive.type).toBe(keys.length);
    }
  });
});
