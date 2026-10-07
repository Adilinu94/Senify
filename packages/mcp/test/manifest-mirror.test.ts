import { describe, expect, it } from "vitest";
import { TOOL_MANIFEST, toolsByName } from "@senify/manifest";
import { TOOLS } from "../src/tools.ts";

// Server-side mirror of the manifest contract (P3-3 Punkt 8): the manifest
// holds the FACTS about the tools (name, scope, title, description), the
// server owns the behaviour (schemas, handlers). The two must not drift -
// and the check belongs on BOTH sides, without parsing source text. The
// manifest package checks names against `tools.ts` text
// (`manifest.test.ts`); this test reads the live `TOOLS` array the server
// registers from, so a renamed title or scope fails here even when the
// names still match.

const FACTS_BY_NAME = toolsByName(TOOL_MANIFEST);

describe("Tool-Manifest-Spiegel (Fahrplan P3-3 Punkt 8, R8)", () => {
  it("spiegelt jedes registrierte Werkzeug mit denselben Fakten", () => {
    expect(TOOLS.length).toBe(TOOL_MANIFEST.length);
    for (const tool of TOOLS) {
      const fact = FACTS_BY_NAME.get(tool.name);
      expect(fact, `Werkzeug ${tool.name} fehlt im Manifest`).toBeDefined();
      expect(fact?.scope, `${tool.name}: scope`).toBe(tool.scope);
      expect(fact?.title, `${tool.name}: title`).toBe(tool.title);
      expect(fact?.description, `${tool.name}: description`).toBe(
        tool.description,
      );
      expect(fact?.writes, `${tool.name}: writes`).toBe(tool.scope !== "read");
    }
  });

  it("enthält nichts, was der Server nicht registriert", () => {
    const registered = new Set(TOOLS.map((tool) => tool.name));
    const extra = TOOL_MANIFEST.map((fact) => fact.name).filter(
      (name) => !registered.has(name),
    );
    expect(extra, `Manifest ohne Server-Tool: ${extra.join(", ")}`).toEqual([]);
  });
});
