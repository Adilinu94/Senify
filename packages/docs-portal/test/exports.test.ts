import { describe, expect, it } from "vitest";
import {
  llmsFullTxt,
  llmsTxt,
  mdPath,
  pageMarkdown,
  referencePages,
  sortPages,
} from "@senify/docs-portal";

describe("agent exports", () => {
  it("writes an llms.txt index with one markdown link per page", () => {
    const pages = referencePages();
    const text = llmsTxt(pages);
    expect(text.startsWith("# Senify\n")).toBe(true);
    expect(text).toContain("## Reference");
    for (const page of pages) {
      expect(text).toContain(`- [${page.title}](${mdPath(page)}): ${page.description}`);
    }
  });

  it("builds llms-full from the complete page bodies", () => {
    const pages = referencePages();
    const text = llmsFullTxt(pages);
    for (const page of pages) {
      expect(text).toContain(`# ${page.title}\n`);
      expect(text).toContain(page.body);
    }
  });

  it("formats a single page as markdown with title and blockquote", () => {
    const tools = referencePages().find(
      (page) => page.path === "/reference/tools",
    );
    if (!tools) throw new Error("tools page missing");
    const markdown = pageMarkdown(tools);
    expect(markdown.startsWith("# Tools\n")).toBe(true);
    expect(markdown).toContain(`> ${tools.description}`);
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("keeps the navigation order stable", () => {
    const sorted = sortPages(referencePages());
    expect(sorted[0]?.path).toBe("/reference/tools");
    expect(sorted.at(-1)?.path).toBe("/reference/errors");
  });
});