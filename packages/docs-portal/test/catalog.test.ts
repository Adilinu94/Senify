import { describe, expect, it } from "vitest";
// P3-3 Punkt 5: der Katalog haelt die Zahl der Werkzeuge - und die Zahl
// kommt aus dem Manifest, nicht aus dem MCP-Server. Ein Test, der den Server
// einbezieht, haelt die letzte Kante des Zyklus, den das Manifest-Paket
// aufgeloest hat. Der Server spiegelt das Manifest (mcp/test/manifest-mirror).
import { TOOL_MANIFEST } from "@senify/manifest";
import { EXPECTED_SECTION_TYPES } from "@senify/registry";
import {
  ERROR_GUIDES,
  errorCatalog,
  sectionCatalog,
  toolCatalog,
} from "@senify/docs-portal";

describe("docs catalog (single sources)", () => {
  it("mirrors the registry, the tool catalog and the error categories", () => {
    const sections = sectionCatalog();
    expect(sections.map((section) => section.type)).toEqual([
      ...EXPECTED_SECTION_TYPES,
    ]);
    expect(toolCatalog()).toHaveLength(TOOL_MANIFEST.length);
    expect(errorCatalog().map((error) => error.category)).toEqual([
      "validation",
      "guardrail",
      "conflict",
      "auth",
      "not_found",
    ]);
  });

  it("carries props, variants and the golden example per section", () => {
    const hero = sectionCatalog().find((section) => section.type === "hero");
    expect(hero?.title).toBe("Hero");
    expect(hero?.props.some((prop) => prop.key === "headline")).toBe(true);
    expect(hero?.variants.map((variant) => variant.name)).toContain("centered");
    expect(hero?.golden).toContain('"type": "hero"');
    expect(hero?.motionPresets.length).toBeGreaterThan(0);
  });

  // P3-3 Punkt 4/5: the parameters no longer come from a live TypeBox schema
  // read out of the MCP server - that dependency was the cycle. They come from
  // the manifest, which `pnpm manifest:render` extracts from the same source.
  // The assertion is unchanged, and that is the point: the docs must show what
  // the tools take, however the answer is obtained.
  it("derives tool parameters from the manifest", () => {
    const apply = toolCatalog().find((tool) => tool.name === "apply_mutations");
    expect(apply?.scope).toBe("write");
    expect(
      apply?.parameters
        .filter((parameter) => parameter.required)
        .map((parameter) => parameter.name),
    ).toEqual(["pageId", "baseDraftVersion", "mutations"]);
    expect(
      apply?.parameters.find((parameter) => parameter.name === "mutations")
        ?.type,
    ).toBe("array<object>");
  });

  it("assigns every tool one of the three scopes", () => {
    const scopes = new Set(toolCatalog().map((tool) => tool.scope));
    expect([...scopes].sort()).toEqual(["publish", "read", "write"]);
    expect(
      toolCatalog().find((tool) => tool.name === "publish_release")?.scope,
    ).toBe("publish");
  });

  it("documents every error category with an example and a suggestion", () => {
    for (const error of errorCatalog()) {
      expect(ERROR_GUIDES[error.category].title.length).toBeGreaterThan(0);
      expect(error.summary.length).toBeGreaterThan(0);
      expect(error.example.message.length).toBeGreaterThan(0);
      expect(error.example.suggestion.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(sectionCatalog())).toBe(JSON.stringify(sectionCatalog()));
    expect(JSON.stringify(toolCatalog())).toBe(JSON.stringify(toolCatalog()));
  });
});
