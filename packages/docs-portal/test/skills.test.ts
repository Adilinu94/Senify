import { describe, expect, it } from "vitest";
import { skillReferenceFiles } from "@senify/docs-portal";

describe("generated skill references", () => {
  const files = skillReferenceFiles();

  it("ships sections, errors and tools under stable names", () => {
    expect(files.map((file) => file.name)).toEqual([
      "sections.md",
      "errors.md",
      "tools.md",
    ]);
    for (const file of files) {
      expect(file.content.length).toBeGreaterThan(100);
    }
  });

  it("summarises the registry, the tool catalog and the error categories", () => {
    const sections = files.find((file) => file.name === "sections.md")?.content ?? "";
    expect(sections).toContain("**hero**");
    expect(sections).toContain("Varianten: `centered`");
    expect(sections).toContain("## structure");

    const tools = files.find((file) => file.name === "tools.md")?.content ?? "";
    expect(tools).toContain("**apply_mutations**");
    expect(tools).toContain("(required)");
    expect(tools).toContain("## read");

    const errors = files.find((file) => file.name === "errors.md")?.content ?? "";
    for (const category of [
      "validation",
      "guardrail",
      "conflict",
      "auth",
      "not_found",
    ]) {
      expect(errors).toContain(category);
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(skillReferenceFiles())).toBe(JSON.stringify(files));
  });
});
