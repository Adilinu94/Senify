import { describe, expect, it } from "vitest";
import { referencePaths, renameVariableReferences, variableReference } from "../src/variable-usage.ts";

describe("variable references", () => {
  it("rewrites recognized references without changing keys, prefixes or the original object", () => {
    const original = {
      "color.marker": { $token: "color.marker" },
      alias: { $ref: "color.marker" },
      nested: [{ value: "linear-gradient(VAR( --color-marker, red), var(--color-marker))" }],
      other: [{ $token: "color.marker-light" }, "var(--color-marker-light)"],
    };
    const result = renameVariableReferences(original, "color", "marker", "brandfarbe");
    expect(result).toEqual({
      "color.marker": { $token: "color.brandfarbe" },
      alias: { $ref: "color.brandfarbe" },
      nested: [{ value: "linear-gradient(VAR( --color-brandfarbe, red), var(--color-brandfarbe))" }],
      other: [{ $token: "color.marker-light" }, "var(--color-marker-light)"],
    });
    expect(original.alias.$ref).toBe("color.marker");
    const old = variableReference("color", "marker");
    const renamed = variableReference("color", "brandfarbe");
    expect(referencePaths(original, old.ref, old.cssVariable)).toHaveLength(3);
    expect(referencePaths(result, old.ref, old.cssVariable)).toHaveLength(0);
    expect(referencePaths(result, renamed.ref, renamed.cssVariable)).toHaveLength(3);
  });

  it("does not match case changes in the case-sensitive custom-property name", () => {
    const { ref, cssVariable } = variableReference("spacing", "luft");
    expect(referencePaths(["VAR(--space-luft)", "var(--space-LUFT)", "var(--space-luftig)"], ref, cssVariable)).toEqual(["[0]"]);
    expect(renameVariableReferences("VAR(--space-luft, var(--space-luftig))", "spacing", "luft", "weit")).toBe("VAR(--space-weit, var(--space-luftig))");
  });

  it("kennt Radius- und Schattenvariablen mit ihren CSS-Namen", () => {
    expect(variableReference("radius", "karte")).toEqual({
      group: "radius",
      ref: "radius.karte",
      cssVariable: "--radius-karte",
    });
    expect(variableReference("shadow", "laut")).toEqual({
      group: "shadow",
      ref: "shadow.laut",
      cssVariable: "--shadow-laut",
    });
    expect(variableReference("fontSize", "gross")).toEqual({
      group: "fontSize",
      ref: "fontSize.gross",
      cssVariable: "--font-size-gross",
    });
    const value = { card: { $token: "radius.karte" }, box: "0 1px 2px var(--shadow-laut)" };
    const radius = variableReference("radius", "karte");
    const shadow = variableReference("shadow", "laut");
    expect(referencePaths(value, radius.ref, radius.cssVariable)).toEqual(["card.$token"]);
    expect(referencePaths(value, shadow.ref, shadow.cssVariable)).toEqual(["box"]);
    expect(renameVariableReferences(value, "shadow", "laut", "leise")).toEqual({
      card: { $token: "radius.karte" },
      box: "0 1px 2px var(--shadow-leise)",
    });
    expect(() => variableReference("fonts", "x")).toThrow(/Ungültige Variable/);
  });
});
