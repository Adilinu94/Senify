import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { SenifyError } from "@senify/core";
import type { ReviewVisualDiff, ReviewVisuals } from "./types.ts";

// Visual artifacts of a review submit (T07): screenshots of every changed page
// at the three breakpoints, the pixel diff against the active release and a
// short motion video when the change touched motion fields. The capture runs
// through an injectable driver; the default driver uses the Playwright harness
// of @senify/analysis-worker and serves the two build directories through
// throwaway localhost servers for the duration of the capture.

export type ReviewVisualBreakpoint = "desktop" | "tablet" | "mobile";

export type ReviewVisualPage = {
  pageId: string;
  // Route path of the page ("/" or "/kontakt"); the baked file is derived.
  path: string;
};

export type ReviewVisualRequest = {
  // Baked directory of the active release (the "before" state); null without
  // a release yet.
  baseDir: string | null;
  // Baked directory of the draft preview (the "after" state).
  afterDir: string;
  pages: ReviewVisualPage[];
  // Record the motion video (only when the structure diff touched motion).
  recordMotion: boolean;
  breakpoints: readonly ReviewVisualBreakpoint[];
};

export type ReviewVisualCapture = {
  screenshots: {
    pageId: string;
    path: string;
    role: "before" | "after";
    breakpoint: string;
    width: number;
    height: number;
    bytes: Buffer;
  }[];
  diffs: {
    pageId: string;
    breakpoint: string;
    changedPixels: number;
    ratio: number;
    bounds: ReviewVisualDiff["bounds"];
    bytes: Buffer;
  }[];
  video?: { bytes: Buffer; durationMs: number };
};

export type ReviewVisualDriver = (
  input: ReviewVisualRequest,
) => Promise<ReviewVisualCapture>;

export type ReviewVisualsContext = {
  dataDir: string;
};

// Baked file of a route path: "/" → index.html, "/blog/x" → blog/x/index.html.
export function bakedRouteFile(routePath: string): string {
  const trimmed = routePath.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed === "" ? "index.html" : `${trimmed}/index.html`;
}

// Writes the captured artifacts under <dataDir>/reviews/<reviewId>/visuals/
// and returns the review visual record with storage refs and preview routes.
export function persistReviewVisuals(
  context: ReviewVisualsContext,
  reviewId: string,
  capture: ReviewVisualCapture,
  now: number = Date.now(),
): ReviewVisuals {
  const dir = join(context.dataDir, "reviews", reviewId, "visuals");
  mkdirSync(dir, { recursive: true });
  const relative = ["reviews", reviewId, "visuals"];
  const store = (fileName: string, bytes: Buffer): string => {
    writeFileSync(join(dir, fileName), bytes);
    return [...relative, fileName].join("/");
  };
  const assets: ReviewVisuals["assets"] = capture.screenshots.map((shot, index) => {
    const name = `${pageSlug(shot.path)}-${shot.role}-${shot.breakpoint}-${index + 1}.png`;
    return {
      pageId: shot.pageId,
      path: shot.path,
      role: shot.role,
      breakpoint: shot.breakpoint,
      width: shot.width,
      height: shot.height,
      bytes: shot.bytes.byteLength,
      storageRef: store(name, shot.bytes),
      previewPath: `/api/reviews/${reviewId}/visuals/${name}`,
    };
  });
  const diffs: ReviewVisuals["diffs"] = capture.diffs.map((diff, index) => {
    const page = capture.screenshots.find((shot) => shot.pageId === diff.pageId);
    const name = `${pageSlug(page?.path ?? diff.pageId)}-diff-${diff.breakpoint}-${index + 1}.png`;
    return {
      pageId: diff.pageId,
      breakpoint: diff.breakpoint,
      changedPixels: diff.changedPixels,
      ratio: diff.ratio,
      bounds: diff.bounds,
      storageRef: store(name, diff.bytes),
      previewPath: `/api/reviews/${reviewId}/visuals/${name}`,
    };
  });
  const visuals: ReviewVisuals = {
    capturedAt: new Date(now).toISOString(),
    assets,
    diffs,
  };
  if (capture.video !== undefined && capture.video.bytes.byteLength > 0) {
    const name = "motion-1.webm";
    visuals.video = {
      durationMs: capture.video.durationMs,
      bytes: capture.video.bytes.byteLength,
      storageRef: store(name, capture.video.bytes),
      previewPath: `/api/reviews/${reviewId}/visuals/${name}`,
    };
  }
  return visuals;
}

// Every file name that belongs to the visuals of this review: the serving
// route only hands out listed files, so traversal cannot resolve.
export function reviewVisualFileNames(visuals: ReviewVisuals | null): string[] {
  if (visuals === null) return [];
  const names = [
    ...visuals.assets.map((asset) => storedName(asset.storageRef)),
    ...visuals.diffs.map((diff) => storedName(diff.storageRef)),
  ];
  if (visuals.video !== undefined) names.push(storedName(visuals.video.storageRef));
  return names;
}

function storedName(storageRef: string): string {
  return storageRef.split("/").at(-1) ?? "";
}

function pageSlug(routePath: string): string {
  const slug = routePath
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-");
  return slug === "" ? "start" : slug;
}

// ------------------------------------------------------------- the driver

const CAPTURE_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".webm": "video/webm",
};

// Throwaway static server for one baked directory: only alive while the
// capture runs, bound to 127.0.0.1 with a random port.
async function serveCaptureDir(dir: string): Promise<{ origin: string; close(): Promise<void> }> {
  const root = resolve(dir);
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const safe = normalize(requestPath).replace(/^[/\\]+/, "");
    let file = join(root, safe);
    if (file.endsWith(sep) || safe === "") file = join(file, "index.html");
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    const resolved = resolve(file);
    if (
      (resolved !== root && !resolved.startsWith(root + sep)) ||
      !existsSync(resolved) ||
      !statSync(resolved).isFile()
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "content-type":
        CAPTURE_CONTENT_TYPES[extname(resolved).toLowerCase()] ?? "application/octet-stream",
    });
    createReadStream(resolved).pipe(res);
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolveListen();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      }),
  };
}

// The production driver: Playwright harness from the analysis worker. It is
// lazy-imported, so an engine without a browser still boots; the capture then
// fails with the harness' clear message and lands as a note on the review.
export function createReviewVisualDriver(options: { recordMotion?: boolean } = {}): ReviewVisualDriver {
  return async (input) => {
    if (input.pages.length === 0) {
      return { screenshots: [], diffs: [] };
    }
    const harness = await import("@senify/analysis-worker").catch(() => {
      throw new SenifyError(
        "not_found",
        "Die visuelle Aufnahme braucht @senify/analysis-worker (Playwright)",
        {
          field: "reviewVisuals",
          suggestion: "Workspace-Abhängigkeiten installieren (pnpm install).",
        },
      );
    });
    const afterServer = await serveCaptureDir(input.afterDir);
    const baseServer =
      input.baseDir === null ? null : await serveCaptureDir(input.baseDir);
    const workRoot = mkdtempSync(join(tmpdir(), "senify-review-visuals-"));
    try {
      const screenshots: ReviewVisualCapture["screenshots"] = [];
      const diffs: ReviewVisualCapture["diffs"] = [];
      const capturePage = async (
        origin: string,
        page: ReviewVisualPage,
        role: "before" | "after",
        workDir: string,
      ): Promise<Map<string, { path: string; width: number; height: number }>> => {
        const url = `${origin}/${bakedRouteFile(page.path)}`;
        const captures = await harness.captureScreenshots({
          url,
          outDir: join(workDir, pageSlug(page.path)),
          breakpoints: input.breakpoints as ("desktop" | "tablet" | "mobile")[],
        });
        const byBreakpoint = new Map<string, { path: string; width: number; height: number }>();
        for (const shot of captures) {
          const bytes = readFileSync(shot.path);
          screenshots.push({
            pageId: page.pageId,
            path: page.path,
            role,
            breakpoint: shot.breakpoint,
            width: shot.width,
            height: shot.height,
            bytes,
          });
          byBreakpoint.set(shot.breakpoint, {
            path: shot.path,
            width: shot.width,
            height: shot.height,
          });
        }
        return byBreakpoint;
      };

      for (const page of input.pages) {
        const after = await capturePage(afterServer.origin, page, "after", workRoot);
        if (baseServer === null) continue;
        let before: Map<string, { path: string; width: number; height: number }>;
        try {
          before = await capturePage(baseServer.origin, page, "before", workRoot);
        } catch {
          // A page that exists only in the draft has no "before": the after
          // shot stays, the diff is simply missing.
          continue;
        }
        for (const breakpoint of input.breakpoints) {
          const beforeShot = before.get(breakpoint);
          const afterShot = after.get(breakpoint);
          if (beforeShot === undefined || afterShot === undefined) continue;
          const report = await harness.diffScreenshots({
            before: beforeShot.path,
            after: afterShot.path,
            outDir: join(workRoot, "diffs"),
            name: `${pageSlug(page.path)}-${breakpoint}`,
          });
          diffs.push({
            pageId: page.pageId,
            breakpoint,
            changedPixels: report.changedPixels,
            ratio: report.ratio,
            bounds: report.bounds,
            bytes: readFileSync(report.path),
          });
        }
      }

      const capture: ReviewVisualCapture = { screenshots, diffs };
      const wantMotion = options.recordMotion ?? true;
      if (wantMotion && input.recordMotion && input.pages[0] !== undefined) {
        const first = input.pages[0];
        const motion = await harness.recordMotion({
          url: `${afterServer.origin}/${bakedRouteFile(first.path)}`,
          outDir: join(workRoot, "motion"),
          name: "motion",
        });
        capture.video = {
          bytes: readFileSync(motion.path),
          durationMs: motion.durationMs,
        };
      }
      return capture;
    } finally {
      await baseServer?.close();
      await afterServer.close();
      rmSync(workRoot, { recursive: true, force: true });
    }
  };
}
