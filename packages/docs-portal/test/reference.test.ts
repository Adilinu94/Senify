import { describe, expect, it } from "vitest";
import { referencePages, sectionCatalog } from "@senify/docs-portal";

describe("reference pages", () => {
  it("covers tools, sections and errors plus one page per section", () => {
    const pages = referencePages();
    expect(pages).toHaveLength(3 + sectionCatalog().length);
    const paths = pages.map((page) => page.path);
    expect(paths).toContain("/reference/tools");
    expect(paths).toContain("/reference/sections");
    expect(paths).toContain("/reference/sections/hero");
    expect(paths).toContain("/reference/errors");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("fills every page with a title, description and body", () => {
    for (const page of referencePages()) {
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.description.length).toBeGreaterThan(0);
      expect(page.body.length).toBeGreaterThan(40);
      expect(page.group).toBe("Reference");
    }
  });

  it("renders props tables and the golden example per section", () => {
    const hero = referencePages().find(
      (page) => page.path === "/reference/sections/hero",
    );
    expect(hero?.body).toContain("| Prop |");
    expect(hero?.body).toContain("```json");
    expect(hero?.body).toContain("centered");
  });

  it("lists every tool with scope and parameters", () => {
    const tools = referencePages().find(
      (page) => page.path === "/reference/tools",
    );
    for (const name of [
      "whoami",
      "apply_mutations",
      "publish_release",
      "upload_asset",
    ]) {
      expect(tools?.body).toContain(`\`${name}\``);
    }
    expect(tools?.body).toContain("baseDraftVersion");
    expect(tools?.body).toContain("Fehlerformat");
  });

  it("documents every error category on the errors page", () => {
    const errors = referencePages().find(
      (page) => page.path === "/reference/errors",
    );
    for (const category of [
      "validation",
      "guardrail",
      "conflict",
      "auth",
      "not_found",
    ]) {
      expect(errors?.body).toContain(category);
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(referencePages())).toBe(
      JSON.stringify(referencePages()),
    );
  });
});