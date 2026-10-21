import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SenifyError } from "@senify/core";
import type {
  CaptureOptions,
  DiffReport,
  VisualCapture,
} from "@senify/analysis-worker";
import { bakePages } from "./bake.ts";
import type { FormSigner } from "./forms.ts";
import { bakedRouteFile, serveCaptureDir } from "./review-visuals.ts";
import { resolveStoredFile } from "./storage.ts";
import type { Store } from "./store.ts";
import type {
  Reference,
  ReferenceDesignDiff,
  ReferenceSnapshot,
  ReferenceSnapshotKind,
} from "./types.ts";

// Visual diff reference ↔ result (E26 slice 2): every diffable slot of the
// reference (hero-desktop, hero-mobile, fullpage captures with bytes on disk)
// is compared against the baked draft captured at the slot's own width —
// widths stay comparable, the number (ratio + changed pixels) and the heatmap
// make "close to the reference" measurable instead of taste.

export type ReferenceDiffDeps = {
  captureScreenshots: (
    options: CaptureOptions,
  ) => Promise<VisualCapture[]>;
  diffScreenshots: (input: {
    before: string;
    after: string;
    outDir: string;
    name?: string;
  }) => Promise<DiffReport>;
};

async function defaultDeps(): Promise<ReferenceDiffDeps> {
  try {
    return await import("@senify/analysis-worker");
  } catch {
    throw new SenifyError(
      "not_found",
      "Der Referenz-Diff braucht @senify/analysis-worker (Playwright)",
      {
        field: "referenceDiff",
        suggestion: "Workspace-Abhängigkeiten installieren (pnpm install).",
      },
    );
  }
}

// Slots that can serve as a diff basis: still images with bytes on disk.
// Motion is a recording, section excerpts have no page counterpart.
const DIFFABLE_KINDS: ReferenceSnapshotKind[] = [
  "hero-desktop",
  "hero-mobile",
  "fullpage",
];

export function diffableSnapshots(
  dataDir: string,
  snapshots: readonly ReferenceSnapshot[],
): { snapshot: ReferenceSnapshot; file: string }[] {
  const usable: { snapshot: ReferenceSnapshot; file: string }[] = [];
  for (const snapshot of snapshots) {
    if (!DIFFABLE_KINDS.includes(snapshot.kind)) continue;
    const file = resolveStoredFile(dataDir, snapshot.storageRef);
    if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
      continue;
    }
    usable.push({ snapshot, file });
  }
  return usable;
}

export function breakpointForWidth(width: number): "desktop" | "tablet" | "mobile" {
  if (width >= 1024) return "desktop";
  if (width >= 600) return "tablet";
  return "mobile";
}

function pageSlug(routePath: string): string {
  const slug = routePath
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-");
  return slug === "" ? "start" : slug;
}

export type ReferenceDiffInput = {
  dataDir: string;
  reference: Reference;
  // Baked directory of the draft (the result side); served throwaway-locally.
  afterDir: string;
  pages: { pageId: string; path: string }[];
  deps?: ReferenceDiffDeps;
};

export type ReferenceDiffResult = {
  diffs: ReferenceDesignDiff[];
  note: string | null;
};

export async function diffReferenceDesign(
  input: ReferenceDiffInput,
): Promise<ReferenceDiffResult> {
  const usable = diffableSnapshots(input.dataDir, input.reference.snapshots);
  if (usable.length === 0) {
    return {
      diffs: [],
      note: "Die Referenz hat keine vergleichbaren Screenshots (hero/fullpage mit Datei) — Diff ohne Basis nicht möglich.",
    };
  }
  if (input.pages.length === 0) {
    return { diffs: [], note: "Die Site hat keine Seiten zum Vergleichen." };
  }
  const deps = input.deps ?? (await defaultDeps());
  const server = await serveCaptureDir(input.afterDir);
  const workRoot = mkdtempSync(join(tmpdir(), "senify-reference-diff-"));
  const diffDir = join(
    input.dataDir,
    "references",
    input.reference.id,
    "visual-diffs",
  );
  try {
    const diffs: ReferenceDesignDiff[] = [];
    let index = 0;
    for (const page of input.pages) {
      for (const { snapshot, file } of usable) {
        const breakpoint = breakpointForWidth(snapshot.width);
        const captures = await deps.captureScreenshots({
          url: `${server.origin}/${bakedRouteFile(page.path)}`,
          outDir: join(workRoot, "after"),
          breakpoints: [breakpoint],
          widths: { [breakpoint]: snapshot.width },
          // The server this diff started itself: the only private address the
          // browser may open (ADR-0022).
          browser: { allowOrigins: [server.origin] },
        });
        const after = captures[0];
        if (after === undefined) continue;
        const name = `${pageSlug(page.path)}-${snapshot.kind}-${breakpoint}-${(index += 1)}`;
        const report = await deps.diffScreenshots({
          before: file,
          after: after.path,
          outDir: join(workRoot, "diffs"),
          name,
        });
        mkdirSync(diffDir, { recursive: true });
        const storageRef = ["references", input.reference.id, "visual-diffs", `${name}.png`].join("/");
        // The heatmap comes back as a file; the side channel (`bytes`) exists
        // for memory-only test doubles.
        const sideChannel = report as DiffReport & { bytes?: Buffer };
        writeFileSync(
          join(diffDir, `${name}.png`),
          sideChannel.bytes ?? readFileSync(report.path),
        );
        diffs.push({
          snapshotKind: snapshot.kind,
          breakpoint,
          width: snapshot.width,
          pageId: page.pageId,
          pagePath: page.path,
          changedPixels: report.changedPixels,
          ratio: report.ratio,
          bounds: report.bounds,
          storageRef,
          previewPath: `/api/references/${input.reference.id}/visual-diffs/${name}.png`,
        });
      }
    }
    return { diffs, note: null };
  } finally {
    await server.close();
    rmSync(workRoot, { recursive: true, force: true });
  }
}

// Full route: bake the page drafts to a throwaway directory, diff them
// against the reference slots, clean up. Read-only in effect — no preview
// record, no review item, no release touch.
export type ReferenceDraftDiffInput = {
  store: Store;
  siteId: string;
  pageId?: string;
  reference: Reference;
  dataDir: string;
  formSigner?: FormSigner;
  formBaseUrl?: string;
  deps?: ReferenceDiffDeps;
};

export async function diffReferenceAgainstDraft(
  input: ReferenceDraftDiffInput,
): Promise<ReferenceDiffResult & { referenceId: string }> {
  const site = await input.store.getSite(input.siteId);
  const drafts = await input.store.listPageDrafts(input.siteId);
  const scoped =
    input.pageId === undefined
      ? drafts
      : drafts.filter((page) => page.id === input.pageId);
  if (input.pageId !== undefined && scoped.length === 0) {
    throw new SenifyError("not_found", `Page "${input.pageId}" does not exist`, {
      field: "pageId",
      suggestion: "Use list_pages to find the page of this site.",
    });
  }
  // Template pages have no route (mirrors the review submit).
  const pages = scoped.filter((page) => page.template === null);
  if (input.pageId !== undefined && pages.length === 0) {
    throw new SenifyError("validation", "Template pages have no route to capture", {
      field: "pageId",
      suggestion: "Pick a page with a path, not a template.",
    });
  }
  const outDir = mkdtempSync(join(tmpdir(), "senify-reference-diff-"));
  try {
    await bakePages(input.store, {
      site,
      pages,
      outDir,
      dataDir: input.dataDir,
      selfContained: true,
      ...(input.formSigner === undefined ? {} : { formSigner: input.formSigner }),
      ...(input.formBaseUrl === undefined ? {} : { formBaseUrl: input.formBaseUrl }),
    });
    const result = await diffReferenceDesign({
      dataDir: input.dataDir,
      reference: input.reference,
      afterDir: outDir,
      pages: pages.map((page) => ({ pageId: page.id, path: page.path })),
      ...(input.deps === undefined ? {} : { deps: input.deps }),
    });
    return { referenceId: input.reference.id, ...result };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}
