// The public address of a site: what canonical links, og:url and the sitemap
// point at. The hosted default is `https://<slug>.senify.xyz`; a self-hosted or
// exported site sets `SENIFY_PUBLIC_BASE_URL` instead, with `{slug}` standing
// for the site's slug (`https://{slug}.example.com`, or a fixed
// `https://www.example.com`). A value that is not an http(s) URL is ignored
// rather than baked into every page.

export const DEFAULT_PUBLIC_BASE_URL = "https://{slug}.senify.xyz";

export function publicBaseUrl(
  slug: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env["SENIFY_PUBLIC_BASE_URL"]?.trim();
  for (const template of [configured, DEFAULT_PUBLIC_BASE_URL]) {
    if (template === undefined || template === "") continue;
    const candidate = template.replaceAll("{slug}", slug).replace(/\/+$/, "");
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.origin + (url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, ""));
      }
    } catch {
      // Not a URL: fall through to the next candidate.
    }
  }
  return `https://${slug}.senify.xyz`;
}

// The host part of the public address, for origin checks (form posts).
export function publicHost(slug: string, env: Record<string, string | undefined> = process.env): string {
  return new URL(publicBaseUrl(slug, env)).hostname.toLowerCase();
}
