import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadGuidePages, portalPages, referencePages } from "@senify/docs-portal";

function guidesDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "senify-guides-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

const validGuide = `---
title: Test-Guide
description: Ein Test.
path: /guides/test
group: Guides
order: 3
---

## Abschnitt

Inhalt.
`;

describe("curated guides", () => {
  it("parses frontmatter and body", () => {
    const dir = guidesDir({ "test.md": validGuide });
    try {
      const pages = loadGuidePages(dir);
      expect(pages).toHaveLength(1);
      expect(pages[0]?.path).toBe("/guides/test");
      expect(pages[0]?.group).toBe("Guides");
      expect(pages[0]?.order).toBe(3);
      expect(pages[0]?.body).toContain("## Abschnitt");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects guides without frontmatter and unknown groups", () => {
    const missing = guidesDir({ "broken.md": "# Kein Frontmatter\n" });
    const wrongGroup = guidesDir({
      "wrong.md": validGuide.replace("group: Guides", "group: Nonsense"),
    });
    try {
      expect(() => loadGuidePages(missing)).toThrow(/frontmatter/);
      expect(() => loadGuidePages(wrongGroup)).toThrow(/unknown group/);
    } finally {
      rmSync(missing, { recursive: true, force: true });
      rmSync(wrongGroup, { recursive: true, force: true });
    }
  });

  it("ships the curated guide set and folds it into the portal corpus", () => {
    const guides = loadGuidePages();
    expect(guides.map((guide) => guide.path).sort()).toEqual([
      "/changelog",
      "/getting-started",
      "/guides/assets",
      "/guides/site-aus-brief",
      "/platform/sites-and-pages",
    ]);
    expect(portalPages()).toHaveLength(
      referencePages().length + guides.length,
    );
  });
});