import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { SenifyError } from "@senify/core";
import { AuthError } from "./auth.ts";
import {
  resolveBuildFile,
  resolvePreviewFile,
  resolveReleaseFile,
} from "./lifecycle.ts";
import type { Store } from "./store.ts";
import { sendError, sendFile, sendText } from "./http-response.ts";

// Serving files out of a bake (P3-2 extraction from `http.ts`).
//
// Two shapes read a build directory, and they differ in exactly one thing:
// a **preview** is public-by-token (the browser opens the signed URL, the
// token travels as a query parameter), a **release** is public without one.
// Everything else — the path into the build, the index fallback, the root
// files (`/assets/theme.css`, `/_astro/…`), the cache headers — is shared,
// which is why both live here instead of in the route table.
//
// The security rule of the module is the token comparison: a preview serves
// only to a holder of its own token, and the comparison is constant-time.

export type BuildFileContext = {
  store: Store;
};

function sameToken(presented: string | null, expected: string): boolean {
  if (presented === null) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Preview files are public-by-token: browsers open the signed URL directly,
// so no bearer token is required — the token travels as a query parameter.
export async function servePreviewFile(
  context: BuildFileContext,
  res: Parameters<typeof sendError>[0],
  previewId: string,
  relativePath: string,
  url: URL,
): Promise<void> {
  let preview;
  try {
    preview = await context.store.getPreview(previewId);
  } catch (error) {
    sendError(res, error);
    return;
  }
  if (!sameToken(url.searchParams.get("token"), preview.token)) {
    sendError(
      res,
      new AuthError(401, "Preview token is missing or invalid", {
        suggestion: "Use the signed preview URL from the review item.",
      }),
    );
    return;
  }
  if (preview.status !== "ready" || Date.parse(preview.expiresAt) <= Date.now()) {
    if (preview.status === "ready") {
      await context.store.markPreviewExpired(preview.id);
    }
    sendError(
      res,
      new SenifyError("not_found", "Preview is expired", {
        suggestion: "Create a new preview.",
      }),
    );
    return;
  }
  const file = previewFileTarget(preview.buildRef, relativePath, (path) =>
    resolvePreviewFile(preview, path),
  );
  if (!file) {
    sendError(
      res,
      new SenifyError("validation", "Invalid preview file path", {
        field: "path",
      }),
    );
    return;
  }
  // An HTML document links the build's own files root-absolute
  // (/assets/theme.css, /_astro/…, page links). Nothing serves the build root
  // next to the preview, so the document keeps all of them inside its own
  // build — including for previews baked before the pages became self-contained.
  if (extname(file).toLowerCase() === ".html") {
    const html = readFileSync(file, "utf8");
    sendText(
      res,
      200,
      rewriteToBuildPrefix(html, `/api/previews/${preview.id}/files/`, preview.token),
      CONTENT_TYPE_HTML,
      { "cache-control": "no-store" },
    );
    return;
  }
  sendFile(res, { path: file });
}

const CONTENT_TYPE_HTML = "text/html; charset=utf-8";

// `/assets/theme.css` → `<prefix>assets/theme.css?token=…`: the leading slash
// of every local URL is replaced and the preview token is carried into the
// sub-resource request, because the signed preview serves every file by token.
// Foreign URLs (http/https, protocol-relative) and fragment links stay as they
// are.
function rewriteToBuildPrefix(html: string, prefix: string, token: string): string {
  const suffix = `token=${encodeURIComponent(token)}`;
  const local = (value: string): string => {
    if (!value.startsWith("/") || value.startsWith("//")) return value;
    const hashIndex = value.indexOf("#");
    const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
    const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
    const queryIndex = beforeHash.indexOf("?");
    const path = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
    const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "";
    const merged = query === "" ? suffix : `${query}&${suffix}`;
    return `${prefix}${path.slice(1)}?${merged}${hash}`;
  };
  return html.replace(
    /\b(href|src|srcset)="([^"]*)"/g,
    (match, attribute: string, value: string) => {
      const rewritten =
        attribute === "srcset"
          ? value
              .split(",")
              .map((entry) => {
                const [url, ...rest] = entry.trim().split(/\s+/);
                return [local(url ?? ""), ...rest].join(" ");
              })
              .join(", ")
          : local(value);
      return rewritten === value ? match : `${attribute}="${rewritten}"`;
    },
  );
}

// The published site: releases have no token, a browser opens them directly
// (`/api/releases/<id>/files/…`), and their pages link the build root files
// (theme.css, _astro/*, islands.js) that `/assets/<file>` and `/_astro/<file>`
// serve from the newest build.
export async function serveReleaseFile(
  context: BuildFileContext,
  res: Parameters<typeof sendError>[0],
  releaseId: string,
  relativePath: string,
): Promise<void> {
  let release;
  try {
    release = await context.store.getRelease(releaseId);
  } catch (error) {
    sendError(res, error);
    return;
  }
  if (release.buildRef === null) {
    sendError(
      res,
      new SenifyError("not_found", `Release "${releaseId}" has no build`, {
        suggestion: "Publish the site first.",
      }),
    );
    return;
  }
  const file = previewFileTarget(release.buildRef, relativePath, (path) =>
    resolveReleaseFile(release, path),
  );
  if (!file) {
    sendError(
      res,
      new SenifyError("validation", "Invalid release file path", {
        field: "path",
      }),
    );
    return;
  }
  sendFile(res, { path: file });
}

// A build is a directory tree: a request that ends in a folder (or at the build
// root itself) answers with its index page.
function previewFileTarget(
  root: string,
  relativePath: string,
  resolveInBuild: (path: string) => string | undefined,
): string | undefined {
  const requested =
    relativePath === "" || relativePath.endsWith("/")
      ? `${relativePath}index.html`
      : relativePath;
  const file = resolveInBuild(requested);
  if (file === undefined) return undefined;
  if (existsSync(file) && statSync(file).isDirectory()) {
    return resolveBuildFile(root, `${requested.replace(/\/+$/, "")}/index.html`);
  }
  return file;
}

// Root files of a bake. The baked pages link them as `/assets/theme.css`,
// `/assets/islands.js` and `/_astro/<hash>.css`; the asset store keeps its own
// `/assets/<id>/<file>` route (a different prefix depth, no collision).
export const BUILD_ROOT_FILES = new Set([
  "theme.css",
  "components.css",
  "sections.css",
  "islands.js",
  "page.js",
  "forms.js",
  // The theme webfonts (Sora, Inter): the theme CSS references them as root
  // files, the bake copies them next to it (ticket 17).
  "sora-400.woff2",
  "sora-600.woff2",
  "sora-700.woff2",
  "inter-400.woff2",
  "inter-500.woff2",
  "inter-600.woff2",
]);

// Which build serves those root paths? `?release=`/`?preview=` pick one
// explicitly (the preview needs its token), otherwise the published state wins:
// the active release of a site, and while nothing is published yet the newest
// ready preview. The engine is a local, single-operator program.
async function currentBuildRoot(
  context: BuildFileContext,
  url: URL,
): Promise<string | undefined> {
  const releaseId = url.searchParams.get("release");
  if (releaseId !== null) {
    const release = await context.store.getRelease(releaseId);
    return release.buildRef ?? undefined;
  }
  const previewId = url.searchParams.get("preview");
  if (previewId !== null) {
    const preview = await context.store.getPreview(previewId);
    if (!sameToken(url.searchParams.get("token"), preview.token)) {
      throw new AuthError(401, "Preview token is missing or invalid", {
        suggestion: "Use the signed preview URL from the review item.",
      });
    }
    return preview.buildRef;
  }
  const sites = await context.store.listSites();
  for (const site of sites) {
    const activeId = await context.store.getActiveReleaseId(site.id);
    if (activeId === null) continue;
    const release = await context.store.getRelease(activeId);
    if (release.buildRef !== null && existsSync(release.buildRef)) {
      return release.buildRef;
    }
  }
  let newest: { buildRef: string; createdAt: string } | undefined;
  for (const site of sites) {
    for (const preview of await context.store.listPreviews(site.id)) {
      if (preview.status !== "ready") continue;
      if (Date.parse(preview.expiresAt) <= Date.now()) continue;
      if (newest === undefined || preview.createdAt > newest.createdAt) {
        newest = preview;
      }
    }
  }
  return newest?.buildRef;
}

export async function buildRootFile(
  context: BuildFileContext,
  url: URL,
  relativePath: string,
): Promise<{ status: number; file: { path: string; headers: Record<string, string> } }> {
  const root = await currentBuildRoot(context, url);
  if (root === undefined) {
    throw new SenifyError("not_found", `Build file "${relativePath}" does not exist`, {
      suggestion: "Publish a release or create a preview first.",
    });
  }
  const file = resolveBuildFile(root, relativePath);
  if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
    throw new SenifyError("not_found", `Build file "${relativePath}" does not exist`, {
      field: "filename",
    });
  }
  // Revalidate: a new release replaces the file under the stable path.
  return {
    status: 200,
    file: { path: file, headers: { "cache-control": "public, max-age=0, must-revalidate" } },
  };
}
