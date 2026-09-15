import { describe, expect, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import { SectionDefinitionSchema } from "@senify/section-sdk";
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
});
