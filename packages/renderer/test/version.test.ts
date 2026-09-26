import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RENDERER_VERSION } from "@senify/renderer";

// The manifest's renderer version must name the version the bake actually
// runs with; the constant and package.json cannot drift apart.
describe("renderer version", () => {
  it("matches package.json", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(RENDERER_VERSION).toBe(pkg.version);
  });
});
