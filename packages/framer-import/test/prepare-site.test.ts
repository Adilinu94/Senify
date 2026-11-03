import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listMirrorPages, prepareMirrorSite } from "@senify/framer-import";

describe("prepareMirrorSite", () => {
  it("captures a structured multi-page export and localizes shared assets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "senify-site-"));
    try {
      const root = join(dir, "source");
      mkdirSync(join(root, "assets"), { recursive: true });
      mkdirSync(join(root, "blog"));
      mkdirSync(join(root, "subpages"));
      writeFileSync(join(root, "assets", "hero.png"), "local-image");
      writeFileSync(join(root, "index.html"), '<div id="main"><h1>Home</h1><img src="assets/hero.png"></div>');
      writeFileSync(join(root, "blog", "story.html"), '<div class="page" id="main"><h1>Story</h1><img src="assets/hero.png"></div>');
      writeFileSync(join(root, "404.html"), '<div id="main">Not found</div>');
      writeFileSync(join(root, "subpages", "blog_other.html"), '<div id="main">Other</div>');
      const inventory = listMirrorPages(root);
      expect(inventory.pages).toEqual(["/", "/blog/story"]);
      expect(inventory.ignoredFlattenedPages).toBe(true);
      const result = await prepareMirrorSite({ rootDir: root, outputDir: join(dir, "output") });
      expect(result.pages).toBe(2);
      expect(result.blockedPages).toEqual([]);
      expect(result.assets.failed).toBe(0);
      expect(result.assets.downloads).toHaveLength(1);
      expect(result.runtimeFreeVerified).toBe(false);
      const saved = JSON.parse(readFileSync(join(dir, "output", "site-ir.json"), "utf8"));
      expect(saved.pages.map((doc: FramerDoc) => doc.pages[0]?.path)).toEqual(["/", "/blog/story"]);
      expect(readFileSync(saved.assetReport.downloads[0].localUrl, "utf8")).toBe("local-image");
      await expect(prepareMirrorSite({ rootDir: root, outputDir: join(dir, "output") })).rejects.toThrow(/existiert bereits/);
      await expect(prepareMirrorSite({ rootDir: root, outputDir: join(root, "output") })).rejects.toThrow(/nicht im Quellordner/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

type FramerDoc = { pages: { path: string }[] };
