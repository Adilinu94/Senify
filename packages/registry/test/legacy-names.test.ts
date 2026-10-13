import { describe, expect, it } from "vitest";
import { getPrimitive } from "@senify/widget-engine";
import { createRegistry } from "../src/index.ts";

// The editor meets a running section as a legacy stand-in. `createRegistry()`
// names it by the section's title ("Hero"), not by its type ("hero"): the
// inspector title and the layer tree read that name.

describe("legacy names of the running sections", () => {
  const registry = createRegistry();

  it("names every section stand-in by its title", () => {
    for (const definition of registry.list()) {
      const primitive = getPrimitive(definition.type);
      // A twin name (divider, embed) keeps its catalog definition and name.
      if (primitive?.legacy !== true) continue;
      expect(primitive.name, definition.type).toBe(definition.title);
    }
    expect(getPrimitive("hero")?.name).toBe("Hero");
  });

  it("keeps the catalog name of a twin section", () => {
    expect(getPrimitive("divider")?.legacy).not.toBe(true);
    expect(getPrimitive("divider")?.name).not.toBe("divider");
  });
});
