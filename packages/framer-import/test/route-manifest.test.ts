import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importRoutes, parseSitemap } from "../src/route-manifest.ts";

describe("route manifest", () => {
  it("reads unique HTTP routes from a sitemap", () => {
    const routes = parseSitemap(`<?xml version="1.0" encoding="UTF-8"?>
      <urlset>
        <url><loc>https://example.test/</loc></url>
        <url><loc>https://example.test/contact</loc></url>
        <url><loc>https://example.test/blogs/a-post</loc></url>
        <url><loc>https://example.test/contact</loc></url>
        <url><loc>mailto:team@example.test</loc></url>
      </urlset>`);
    expect(routes).toEqual([
      { pagePath: "/", url: "https://example.test/" },
      { pagePath: "/contact", url: "https://example.test/contact" },
      { pagePath: "/blogs/a-post", url: "https://example.test/blogs/a-post" },
    ]);
  });

  it("uses the local homepage and browser capture for flattened subpages", () => {
    const root = mkdtempSync(join(tmpdir(), "senify-routes-"));
    try {
      mkdirSync(join(root, "subpages"));
      writeFileSync(join(root, "index.html"), "<div id=main>Home</div>");
      writeFileSync(join(root, "subpages", "contact.html"), "<div id=main></div>");
      const routes = importRoutes(root, [
        { pagePath: "/", url: "https://example.test/" },
        { pagePath: "/contact", url: "https://example.test/contact" },
        { pagePath: "/blogs/a-post", url: "https://example.test/blogs/a-post" },
      ]);
      expect(routes[0]).toEqual({ pagePath: "/", source: { rootDir: root, page: "/" }, browser: false, mirrored: true });
      expect(routes[1]).toEqual({ pagePath: "/contact", source: { url: "https://example.test/contact" }, browser: true, mirrored: true });
      expect(routes[2]).toEqual({ pagePath: "/blogs/a-post", source: { url: "https://example.test/blogs/a-post" }, browser: true, mirrored: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
