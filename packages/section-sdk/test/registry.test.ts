import { describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { Registry, validateDefinition } from "@senify/section-sdk";
import { cardDefinition, heroDefinition } from "./fixtures.ts";

describe("validateDefinition", () => {
  it("returns no issues for a valid definition", () => {
    expect(validateDefinition(heroDefinition())).toEqual([]);
  });

  it("flags duplicate prop keys", () => {
    const definition = heroDefinition();
    definition.props.push({ key: "headline", control: "text", label: "Dup" });
    const issues = validateDefinition(definition);
    expect(issues.some((i) => i.message.includes("Duplicate prop key"))).toBe(true);
  });
});

describe("Registry", () => {
  it("registers and retrieves sections", () => {
    const registry = new Registry();
    registry.register(heroDefinition());
    expect(registry.has("hero")).toBe(true);
    expect(registry.list().map((s) => s.type)).toEqual(["hero"]);
    expect(registry.get("hero").title).toBe("Hero");
  });

  it("rejects duplicate registrations", () => {
    const registry = new Registry();
    registry.register(heroDefinition());
    expect(() => registry.register(heroDefinition())).toThrowError(SenifyError);
  });

  it("reports unknown section types with a suggestion", () => {
    const registry = new Registry();
    try {
      registry.get("nope");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SenifyError);
      const senifyError = error as SenifyError;
      expect(senifyError.category).toBe("not_found");
      expect(senifyError.suggestion).toBeTruthy();
    }
  });

  it("rejects a golden example with unknown props", () => {
    const registry = new Registry();
    const definition = heroDefinition();
    definition.golden.tree.props = { headline: "Welcome", bogus: true };
    expect(() => registry.register(definition)).toThrowError(/Unknown prop "bogus"/);
  });

  it("rejects a golden example with a wrong prop value type", () => {
    const registry = new Registry();
    const definition = heroDefinition();
    definition.golden.tree.props = { headline: "Welcome", columns: "two" };
    expect(() => registry.register(definition)).toThrowError(/does not match its schema/);
  });

  it("rejects children on sections that allow none", () => {
    const registry = new Registry();
    registry.register(cardDefinition());
    const definition = heroDefinition();
    definition.golden.tree.children = [{ type: "card", props: { title: "Nested" } }];
    expect(() => registry.register(definition)).toThrowError(/does not allow children/);
  });

  it("allows children when the definition whitelists their type", () => {
    const registry = new Registry();
    registry.register(cardDefinition());
    const definition = heroDefinition();
    definition.allowedChildren = ["card"];
    definition.golden.tree.children = [{ type: "card", props: { title: "Nested" } }];
    expect(() => registry.register(definition)).not.toThrow();
  });

  it("flags non-whitelisted child types with an issue", () => {
    const registry = new Registry();
    registry.register(cardDefinition());
    const definition = heroDefinition();
    definition.allowedChildren = ["card"];
    const issues = registry.validateGoldenTree(definition, {
      type: "hero",
      props: { headline: "Welcome", columns: 2 },
      children: [{ type: "nope", props: {} }],
    });
    expect(issues.some((i) => i.message.includes('does not allow child "nope"'))).toBe(true);
  });
});
