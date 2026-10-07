// Links between the pages of one site.
//
// A Framer export writes internal links relative to the page they sit on
// (`./about` on the home page, `../about` on a nested page). The imported page
// lives at its own path in Senify, so a relative reference would resolve
// against the wrong directory as soon as pages are imported under other paths.
// Internal links are therefore made root-relative at import time (`/about`),
// which is also what makes a link list usable to discover the site's pages.
import type { IrNode } from "./ir.ts";

const EXTERNAL_SCHEME = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)/;
const ASSET_EXTENSION = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|mp4|webm|mp3|woff2?|ttf|otf|css|js|json|xml|txt)$/i;

// A link made root-relative against the page it sits on; anything that is not
// an internal page reference (external site, `mailto:`, `tel:`, `#anchor`)
// comes back unchanged. A same-origin absolute URL becomes its path.
export function resolveHref(href: string, pagePath: string, origin: string | null): string {
  const value = href.trim();
  if (value === "" || value.startsWith("#")) return href;
  if (EXTERNAL_SCHEME.test(value) || value.startsWith("//")) {
    if (origin === null) return href;
    try {
      const url = new URL(value, origin);
      return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : href;
    } catch {
      return href;
    }
  }
  try {
    // Resolved like a browser does it: the page's own URL is the base, so its
    // last segment is dropped (`/legal/privacy` + `../about` → `/about`).
    const url = new URL(value, `https://page.invalid${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

// `/about?x=1#team` → `/about`; null for an asset, an anchor-only or empty path.
export function pagePathOf(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const path = href.replace(/[?#].*$/, "");
  if (ASSET_EXTENSION.test(path)) return null;
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return clean === "" ? "/" : clean;
}

// Make every internal link of the tree root-relative, in place.
export function rewriteLinks(root: IrNode, pagePath: string, origin: string | null): void {
  const visit = (node: IrNode): void => {
    if (node.href !== null && node.href !== undefined) node.href = resolveHref(node.href, pagePath, origin);
    node.children.forEach(visit);
  };
  visit(root);
}

// The other pages the links of this page point to (the links are root-relative
// after `rewriteLinks`), in first-seen order, without duplicates.
export function discoverPagePaths(root: IrNode, pagePath: string, limit = 40): string[] {
  const here = pagePathOf(pagePath) ?? "/";
  const found: string[] = [];
  const seen = new Set<string>([here]);
  const visit = (node: IrNode): void => {
    if (found.length >= limit) return;
    const path = node.href === null || node.href === undefined ? null : pagePathOf(node.href);
    if (path !== null && !seen.has(path)) {
      seen.add(path);
      found.push(path);
    }
    node.children.forEach(visit);
  };
  visit(root);
  return found;
}
