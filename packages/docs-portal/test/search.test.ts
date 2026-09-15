import { describe, expect, it } from "vitest";
import { portalPages, readDoc, searchDocs } from "@senify/docs-portal";

describe("docs search", () => {
  const pages = portalPages();

  it("ranks title matches above body matches", () => {
    const hits = searchDocs(pages, "hero");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.path).toBe("/reference/sections/hero");
  });

  it("finds tools and error codes across the corpus", () => {
    const tools = searchDocs(pages, "apply_mutations baseDraftVersion");
    expect(tools.some((hit) => hit.path === "/reference/tools")).toBe(true);
    const errors = searchDocs(pages, "guardrail");
    expect(errors.some((hit) => hit.path === "/reference/errors")).toBe(true);
  });

  it("returns snippets and honours the limit", () => {
    const hits = searchDocs(pages, "token", 2);
    expect(hits).toHaveLength(2);
    for (const hit of hits) {
      expect(hit.snippet.length).toBeGreaterThan(0);
      expect(hit.score).toBeGreaterThan(0);
    }
  });

  it("returns nothing for empty or unknown queries", () => {
    expect(searchDocs(pages, " ")).toEqual([]);
    expect(searchDocs(pages, "xyzzyplugh")).toEqual([]);
  });

  it("resolves page paths tolerantly for read_docs", () => {
    expect(readDoc(pages, "/reference/tools")?.title).toBe("Tools");
    expect(readDoc(pages, "reference/tools")?.path).toBe("/reference/tools");
    expect(readDoc(pages, "/reference/tools.md")?.path).toBe("/reference/tools");
    expect(readDoc(pages, "/REFERENCE/TOOLS")?.path).toBe("/reference/tools");
    expect(readDoc(pages, "/nope")).toBeUndefined();
  });
});