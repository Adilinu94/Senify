import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { selfContainedHtml } from "../src/bake.ts";

// A served preview inlines the baked stylesheets as <style>. The CSS is ours,
// but it sits inside an HTML raw-text element: `</style>` in it would end the
// element and let whatever follows run as markup.

function bake(css: string): string {
  const outDir = mkdtempSync(join(tmpdir(), "senify-selfcontained-"));
  mkdirSync(join(outDir, "assets"));
  writeFileSync(join(outDir, "assets", "style-rules.css"), css, "utf8");
  return selfContainedHtml(
    '<html><head><link rel="stylesheet" href="/assets/style-rules.css"></head><body>x</body></html>',
    outDir,
  );
}

describe("selfContainedHtml", () => {
  it("inlines a stylesheet as one <style> element", () => {
    const html = bake(".a { color: red; }");
    expect(html).toContain("<style>.a { color: red; }</style>");
  });

  it("cannot be left through a closing tag inside the stylesheet", () => {
    const html = bake('.a { font-family: "</style><script>window.pwned = 1</script>"; }');
    expect(html).not.toContain("</style><script>");
    expect(html.match(/<\/style>/g)?.length).toBe(1);
    // The escaped text still reads as the same CSS string.
    expect(html).toContain('"<\\/style><script>window.pwned = 1<\\/script>"');
  });
});
