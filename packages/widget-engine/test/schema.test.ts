import { describe, expect, it } from "vitest";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import {
  ControlSchema,
  PRIMITIVES,
  PrimitiveDefinitionSchema,
  getPrimitive,
  validateControl,
  validatePrimitive,
  type Control,
  type PrimitiveDefinition,
} from "../src/index.ts";

// The catalog schemas are TypeBox schemas, checked with `TypeCompiler` — the
// same mechanism `@senify/section-sdk` uses. These tests mirror section-sdk's
// `schema.test.ts`, so schemas, validation and issue shape stay aligned.

const frame = getPrimitive("frame") as PrimitiveDefinition;
const primitiveCompiler = TypeCompiler.Compile(PrimitiveDefinitionSchema);
const controlCompiler = TypeCompiler.Compile(ControlSchema);

const validControl: Control = {
  key: "display",
  label: "Anzeige",
  kind: "choose",
  valueType: "enum",
  default: "block",
  options: [{ value: "block", label: "Block" }],
};

describe("catalog schemas (TypeBox)", () => {
  it("accepts a catalog primitive", () => {
    expect(primitiveCompiler.Check(frame)).toBe(true);
  });

  it("rejects an unknown category", () => {
    expect(primitiveCompiler.Check({ ...frame, category: "bogus" })).toBe(false);
  });

  it("rejects an unknown control kind", () => {
    expect(controlCompiler.Check({ ...validControl, kind: "bogus" })).toBe(false);
  });

  it("rejects an unknown value type", () => {
    expect(controlCompiler.Check({ ...validControl, valueType: "bogus" })).toBe(false);
  });

  it("rejects a primitive without a controls array", () => {
    const rest: Record<string, unknown> = { ...frame };
    delete rest["controls"];
    expect(primitiveCompiler.Check(rest)).toBe(false);
  });

  it("rejects a control without a default", () => {
    const rest: Record<string, unknown> = { ...validControl };
    delete rest["default"];
    expect(controlCompiler.Check(rest)).toBe(false);
  });
});

describe("validation issues", () => {
  it("reports path and message for a broken primitive", () => {
    const broken = {
      ...frame,
      controls: [{ ...validControl, kind: "bogus" }],
    } as unknown as PrimitiveDefinition;
    const issues = validatePrimitive(broken);
    expect(issues.length).toBeGreaterThan(0);
    expect(
      issues.every((issue) => typeof issue.path === "string" && issue.message.length > 0),
    ).toBe(true);
  });

  it("returns no issues for the whole catalog", () => {
    for (const primitive of PRIMITIVES) {
      expect(validatePrimitive(primitive), primitive.type).toEqual([]);
    }
  });

  it("returns issue objects from validateControl", () => {
    const broken: Control = {
      key: "x",
      label: "X",
      kind: "slider",
      valueType: "number",
      default: 1,
      min: 0,
      max: 10,
      step: 1,
      units: [],
    };
    const issues = validateControl(broken, "primitive(frame).controls");
    expect(issues[0]).toEqual({
      path: "primitive(frame).controls.x",
      message: "Schieberegler braucht mindestens eine Einheit",
    });
  });

  it("uses the same issue shape as the section SDK", () => {
    const issues = validateControl(
      { ...validControl, default: "nope" },
      "primitive(frame).controls",
    );
    expect(issues).toHaveLength(1);
    expect(Object.keys(issues[0]!).sort()).toEqual(["message", "path"]);
    expect(issues[0]!.message).toContain("keine der Optionen");
  });
});
