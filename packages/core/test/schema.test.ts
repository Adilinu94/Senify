import { describe, expect, it } from "vitest";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { SectionDefinitionSchema } from "@senify/core";

function validHero() {
  return {
    type: "hero",
    version: 1,
    title: "Hero",
    description: "Top-of-page hero with headline and calls to action.",
    category: "structure",
    props: [
      { key: "headline", control: "text", label: "Headline", schema: Type.String() },
    ],
    golden: {
      tree: {
        type: "hero",
        props: { headline: "Hello" },
      },
      thumbnails: {},
    },
  };
}

describe("SectionDefinitionSchema", () => {
  it("accepts a valid definition", () => {
    expect(Value.Check(SectionDefinitionSchema, validHero())).toBe(true);
  });

  it("rejects a definition without type", () => {
    const definition: Record<string, unknown> = validHero();
    delete definition.type;
    expect(Value.Check(SectionDefinitionSchema, definition)).toBe(false);
  });

  it("rejects unknown prop controls", () => {
    const definition = validHero();
    definition.props = [
      { key: "headline", control: "bogus", label: "Headline" },
    ] as never;
    expect(Value.Check(SectionDefinitionSchema, definition)).toBe(false);
  });

  it("rejects unknown categories", () => {
    const definition: Record<string, unknown> = validHero();
    definition.category = "bogus";
    expect(Value.Check(SectionDefinitionSchema, definition)).toBe(false);
  });
});
