import { existsSync } from "node:fs";
import { join } from "node:path";
import { SenifyError } from "@senify/core";

export type SitemapRoute = { pagePath: string; url: string };

export type ImportRoute = {
  pagePath: string;
  source: { rootDir: string; page: string } | { url: string };
  browser: boolean;
  mirrored: boolean;
};

// FramerExport flattens nested routes into `subpages/segments_joined.html`.
// The inverse is ambiguous, so the sitemap owns the route list. The homepage is
// still captured from the local mirror; flattened subpages are client-rendered
// shells that only the live browser capture can expand.
export function parseSitemap(xml: string): SitemapRoute[] {
  const routes = new Map<string, string>();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
    const raw = match[1]?.trim();
    if (raw === undefined || raw === "") continue;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const pagePath = url.pathname === "" ? "/" : url.pathname;
    if (!pagePath.startsWith("/") || routes.has(pagePath)) continue;
    routes.set(pagePath, url.href);
  }
  return [...routes].map(([pagePath, url]) => ({ pagePath, url }));
}

export async function fetchSitemapRoutes(sourceUrl: string): Promise<SitemapRoute[]> {
  const origin = new URL(sourceUrl).origin;
  const response = await fetch(`${origin}/sitemap.xml`, { headers: { accept: "application/xml,text/xml" } });
  if (!response.ok) {
    throw new SenifyError("validation", `Sitemap nicht erreichbar (HTTP ${response.status})`, { field: "sourceUrl" });
  }
  const routes = parseSitemap(await response.text());
  if (routes.length === 0) {
    throw new SenifyError("validation", "Sitemap enthält keine Routen", { field: "sourceUrl" });
  }
  return routes;
}

export function importRoutes(rootDir: string, routes: SitemapRoute[]): ImportRoute[] {
  return routes.map((route) => {
    const segments = route.pagePath.replace(/^\/+|\/+$/g, "");
    const mirrored = route.pagePath === "/"
      ? existsSync(join(rootDir, "index.html"))
      : existsSync(join(rootDir, "subpages", `${segments.split("/").join("_")}.html`));
    if (route.pagePath === "/" && mirrored) {
      return {
        pagePath: route.pagePath,
        source: { rootDir, page: "/" },
        browser: false,
        mirrored: true,
      };
    }
    return {
      pagePath: route.pagePath,
      source: { url: route.url },
      browser: true,
      mirrored,
    };
  });
}
