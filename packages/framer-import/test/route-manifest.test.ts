import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSitemapRoutes, importRoutes, parseSitemap } from "../src/route-manifest.ts";

vi.mock("@senify/core/net", async (original) => ({
  ...(await original<typeof import("@senify/core/net")>()),
  fetchPublic: (url: string, options: RequestInit) => fetch(url, options),
}));
afterEach(() => vi.unstubAllGlobals());

describe("route manifest", () => {
  it("beschränkt das Sitemap-Inventar auf die Origin der angefragten Site", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<urlset><url><loc>https://other.test/</loc></url><url><loc>https://example.test/</loc></url><url><loc>http://127.0.0.1/admin</loc></url><url><loc>https://other.test/private</loc></url></urlset>'));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchSitemapRoutes("https://example.test/start")).toEqual([{ pagePath: "/", url: "https://example.test/" }]);
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/sitemap.xml", expect.objectContaining({ maxBytes: 5_000_000 }));
  });
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
