import { describe, expect, it } from "vitest";
import { fetchSitemapRoutes } from "../src/route-manifest.ts";

describe("Sitemap-Netzwerkgrenze", () => {
  it("verweigert private Ziele ohne ausdrückliche Betreiberfreigabe", async () => {
    const previous = process.env.SENIFY_ALLOW_PRIVATE_URLS;
    delete process.env.SENIFY_ALLOW_PRIVATE_URLS;
    try {
      await expect(fetchSitemapRoutes("http://127.0.0.1/")).rejects.toThrow();
    } finally {
      if (previous === undefined) delete process.env.SENIFY_ALLOW_PRIVATE_URLS;
      else process.env.SENIFY_ALLOW_PRIVATE_URLS = previous;
    }
  });
});
