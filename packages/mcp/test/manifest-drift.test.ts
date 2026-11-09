import { describe, expect, it } from "vitest";
import { TOOL_MANIFEST } from "@senify/manifest";
import { TOOLS } from "@senify/mcp";

// P3-3 Punkt 5 (R8): server and manifest must describe the same catalog. The
// manifest is generated from `tools.ts`, and the route matrix consumes the
// manifest; without this drift test a hand edit to one side would leave the
// other silently stale.
describe("MCP-Server und generiertes Manifest", () => {
  it("beschreiben dieselben Werkzeuge mit Titel und Scope", () => {
    const byName = new Map(TOOL_MANIFEST.map((fact) => [fact.name, fact]));
    expect(new Set(TOOLS.map((tool) => tool.name))).toEqual(new Set(byName.keys()));
    for (const tool of TOOLS) {
      const fact = byName.get(tool.name);
      expect(fact, tool.name).toBeDefined();
      expect(fact?.title, tool.name).toBe(tool.title);
      expect(fact?.scope, tool.name).toBe(tool.scope);
      expect(fact?.routes.length ?? 0, tool.name).toBeGreaterThanOrEqual(0);
    }
  });
});
