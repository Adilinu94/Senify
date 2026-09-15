import { describe, expect, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import {
  SectionDefinitionSchema,
  validatePropValues,
} from "@senify/section-sdk";
import { heroDefinition } from "./fixtures.ts";

describe("SectionDefinitionSchema", () => {
  it("accepts a valid definition", () => {
    expect(Value.Check(SectionDefinitionSchema, heroDefinition())).toBe(true);
  });

  it("rejects a definition without type", () => {
    const definition: Record<string, unknown> = { ...heroDefinition() };
    delete definition.type;
    expect(Value.Check(SectionDefinitionSchema, definition)).toBe(false);
  });

  it("rejects unknown prop controls", () => {
    const definition = heroDefinition();
    definition.props = [
      { key: "headline", control: "bogus", label: "Headline" },
    ] as never;
    expect(Value.Check(SectionDefinitionSchema, definition)).toBe(false);
  });

  it("rejects unknown categories", () => {
    const definition: Record<string, unknown> = { ...heroDefinition() };
    definition.category = "bogus";
    expect(Value.Check(SectionDefinitionSchema, definition)).toBe(false);
  });

  it("accepts scale style props with token group and part metadata", () => {
    const definition = heroDefinition();
    definition.styleProps = [
      {
        key: "paddingY",
        control: "scale",
        label: "Padding oben/unten",
        group: "Styling",
        tokenGroup: "space",
      },
      {
        key: "cardBackground",
        control: "color",
        label: "Karte: Hintergrund",
        group: "Styling",
        tokenGroup: "color",
        part: "card",
      },
    ];
    expect(Value.Check(SectionDefinitionSchema, definition)).toBe(true);
  });

  it("rejects unknown token groups", () => {
    const definition = heroDefinition();
    definition.styleProps = [
      {
        key: "paddingY",
        control: "scale",
        label: "Padding",
        tokenGroup: "bogus",
      },
    ] as never;
    expect(Value.Check(SectionDefinitionSchema, definition)).toBe(false);
  });

  it("validates scale values as token ref or free value", () => {
    const definition = heroDefinition();
    definition.styleProps = [
      {
        key: "paddingY",
        control: "scale",
        label: "Padding",
        tokenGroup: "space",
      },
    ];
    expect(
      validatePropValues(definition, { paddingY: { $token: "space.4" } }),
    ).toEqual([]);
    expect(validatePropValues(definition, { paddingY: "96px" })).toEqual([]);
    expect(
      validatePropValues(definition, { paddingY: "" }).length,
    ).toBeGreaterThan(0);
    expect(
      validatePropValues(definition, { paddingY: 96 }).length,
    ).toBeGreaterThan(0);
  });
});
