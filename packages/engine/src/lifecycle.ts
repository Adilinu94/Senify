import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { SenifyError } from "@senify/core";
import { RENDERER_VERSION } from "@senify/renderer";
import type { Author, NodeTree } from "@senify/section-sdk";
import type { StyleRule } from "@senify/widget-engine";
import { bakePages } from "./bake.ts";
import { hashBuildDir } from "./build-hash.ts";
import { runChecks } from "./checks.ts";
import { buildDesignReport } from "./design-report.ts";
import type { FormSigner } from "./forms.ts";
import { newEntityId } from "./ids.ts";
import { referenceAdherenceForSite } from "./references-lifecycle.ts";
import { runReleasePreChecks } from "./release-checks.ts";
import {
  persistReviewVisuals,
  type ReviewVisualBreakpoint,
  type ReviewVisualDriver,
} from "./review-visuals.ts";
import type { ImportReport } from "./imports-contract.ts";
import type { Store } from "./store.ts";
import type {
  CheckIssue,
  Page,
  Preview,
  Release,
  ReleasePageRevision,
  ReviewItem,
  ReviewVisuals,
  Site,
  SiteTheme,
  StructureChange,
} from "./types.ts";

export type LifecycleContext = {
  store: Store;
  dataDir: string;
  // Forms (T11): release and preview bakes stamp signed form tokens when a
  // signer is present.
  formSigner?: FormSigner;
  formBaseUrl?: string;
  // Visual artifacts of a review submit (T07). Without a driver (tests, CI)
  // the review simply carries no visuals.
  visuals?: ReviewVisualDriver;
};

export const REVIEW_VISUAL_BREAKPOINTS: readonly ReviewVisualBreakpoint[] = [
  "desktop",
  "tablet",
  "mobile",
];

export type CheckSummary = { hard: CheckIssue[]; soft: CheckIssue[] };

function previewDir(context: LifecycleContext, previewId: string): string {
  return join(context.dataDir, "previews", previewId);
}

function releaseDir(context: LifecycleContext, releaseId: string): string {
  return join(context.dataDir, "releases", releaseId);
}

function hardFailure(issues: CheckIssue[], stage: string): SenifyError {
  const first = issues[0];
  const extra = issues.length > 1 ? ` (+${issues.length - 1} more)` : "";
  return new SenifyError(
    "guardrail",
    `Hard checks failed during ${stage}: ${first?.message ?? "unknown issue"}${extra}`,
    { field: first?.field, suggestion: first?.suggestion },
  );
}

// Soft adherence hint of the assigned references (T14): it never blocks, it
// tells the operator how far the draft drifted from the profile.
async function referenceAdherence(
  context: LifecycleContext,
  siteId: string,
  theme: SiteTheme["theme"],
): Promise<CheckIssue[]> {
  return referenceAdherenceForSite(
    { store: context.store, dataDir: context.dataDir },
    siteId,
    theme,
  );
}

// Restore is append-only: the old revision becomes a new draft version and
// the restore itself is recorded in the audit log.
export async function restoreRevisionAsDraft(
  context: LifecycleContext,
  input: { pageId: string; revisionId: string; author: Author },
): Promise<Page> {
  const revision = await context.store.getRevision(input.revisionId);
  if (revision.pageId !== input.pageId) {
    throw new SenifyError(
      "validation",
      `Revision "${input.revisionId}" belongs to another page`,
      {
        field: "revisionId",
        suggestion: "Use a revision of the page you are restoring.",
      },
    );
  }
  const page = await context.store.getPage(input.pageId);
  await context.store.persistBatch({
    pageId: page.id,
    expectedVersion: page.draftVersion,
    draft: revision.tree,
    title: revision.title,
    path: revision.path,
    entries: [
      {
        siteId: page.siteId,
        pageId: page.id,
        batchId: newEntityId(),
        opIndex: 0,
        mutation: "restoreRevision",
        params: { revisionId: revision.id },
        author: input.author,
        undoPatch: [],
        draftVersionAfter: 0,
      },
    ],
  });
  return context.store.getPage(page.id);
}

function requireNote(note: string | undefined, action: string): string {
  const trimmed = note?.trim() ?? "";
  if (trimmed === "") {
    throw new SenifyError("validation", `${action} needs a note`, {
      field: "note",
      suggestion: "Write what should change (the agent reads it via get_review_feedback).",
    });
  }
  return trimmed;
}

// Re-bake the active release by creating a new immutable release. The old
// release and its build directory remain untouched; the active pointer moves
// only after the new build has passed its checks.
export async function rebakeActiveRelease(
  context: LifecycleContext,
  siteId: string,
): Promise<{ outDir: string; pageCount: number; releaseId: string }> {
  const activeReleaseId = await context.store.getActiveReleaseId(siteId);
  if (activeReleaseId === null) {
    throw new SenifyError("validation", "Site has no active release to re-bake", {
      field: "siteId",
      suggestion: "Publish a release first (publish_release).",
    });
  }
  const activeRelease = await context.store.getRelease(activeReleaseId);
  const site = await context.store.getSite(siteId);
  const pages = await context.store.listPageDrafts(siteId);
  const author: Author = { kind: "human", id: "system", label: "System" };
  const pageRevisions: ReleasePageRevision[] = [];
  for (const page of pages) {
    const revision = await context.store.createRevision({
      pageId: page.id,
      siteId: page.siteId,
      title: page.title,
      path: page.path,
      tree: page.draft,
      author,
      note: "Content re-bake",
    });
    pageRevisions.push({ pageId: page.id, path: page.path, revisionId: revision.id });
  }
  const siteTheme = await context.store.getTheme(siteId);
  const styleRules = await context.store.listStyleRules(siteId);
  const capturedAt = new Date().toISOString();
  const siteDate = capturedAt.slice(0, 10);
  const release = await context.store.createRelease({
    siteId,
    pageRevisions,
    themeSnapshot: siteTheme.theme,
    buildRef: null,
    manifest: {
      styleRules,
      rendererVersion: RENDERER_VERSION,
      buildHash: "",
      capturedAt,
      siteDate,
      rebakedFrom: activeRelease.id,
    },
    author,
    note: "Content re-bake",
    basisReleaseId: activeRelease.id,
  });
  const target = releaseDir(context, release.id);
  const next = `${target}.next`;
  rmSync(next, { recursive: true, force: true });
  try {
    const baked = await bakePages(context.store, {
      site,
      pages,
      outDir: next,
      dataDir: context.dataDir,
      siteDate,
      formBaseUrl: context.formBaseUrl,
      ...(context.formSigner === undefined ? {} : { formSigner: context.formSigner }),
    });
    const preCheck = runReleasePreChecks({ outDir: baked.outDir });
    if (preCheck.hard.length > 0) {
      rmSync(baked.outDir, { recursive: true, force: true });
      throw hardFailure(preCheck.hard, "rebake");
    }
    const buildHash = hashBuildDir(baked.outDir);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(baked.outDir, target);
    await context.store.finalizeRelease({
      siteId,
      releaseId: release.id,
      buildRef: target,
      manifest: {
        ...(release.manifest as NonNullable<typeof release.manifest>),
        buildHash,
      },
    });
    return { outDir: target, pageCount: baked.pageCount, releaseId: release.id };
  } catch (error) {
    rmSync(next, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

export async function publishRelease(
  context: LifecycleContext,
  input: {
    siteId: string;
    author: Author;
    note: string | null;
    basisReleaseId?: string | null;
  },
): Promise<{ release: Release; checks: CheckSummary }> {
  const site = await context.store.getSite(input.siteId);
  const pages = await context.store.listPageDrafts(input.siteId);
  const siteTheme = await context.store.getTheme(input.siteId);

  if (pages.length === 0) {
    throw new SenifyError("validation", "Site has no pages to publish", {
      field: "siteId",
      suggestion: "Create at least one page first.",
    });
  }

  const report = runChecks({
    stage: "publish",
    pages,
    site,
    theme: siteTheme.theme,
    assets: await context.store.assetUsageMap(input.siteId),
    collectionIds: new Set(
      (await context.store.listCollections(input.siteId)).map(
        (collection) => collection.id,
      ),
    ),
    referenceAdherence: await referenceAdherence(context, input.siteId, siteTheme.theme),
  });
  if (report.hard.length > 0) {
    throw hardFailure(report.hard, "publish");
  }
  // Design-Score-Gate (E26 S3): below the profile's threshold the publish
  // blocks with the named findings — slop is not shippable. The threshold is
  // the profile's gate value (clean 55 / standard 60 / showcase 65).
  const designReport = await buildDesignReport({
    store: context.store,
    siteId: input.siteId,
  });
  if (designReport.verdict === "gate") {
    throw new SenifyError(
      "guardrail",
      `Design-Score ${designReport.score} liegt unter der Schwelle ${designReport.thresholds.gate} (Profil ${designReport.profile})`,
      {
        field: "designScore",
        suggestion:
          designReport.findings[0]?.suggestion ??
          "get_design_report liefert die Findings mit Fundstelle und Vorschlag.",
      },
    );
  }

  const basisId = input.basisReleaseId ?? null;
  let pageRevisions: ReleasePageRevision[];
  let themeSnapshot: unknown;
  // Manifest state (E2): a rollback restores the basis' style registry and
  // records where it came from; a normal publish captures the current one.
  let restoredRules: StyleRule[] | null = null;
  let restoredFrom: string | undefined;
  let restoredSiteDate: string | undefined;
  if (basisId !== null) {
    const basis = await context.store.getRelease(basisId);
    if (basis.siteId !== input.siteId) {
      throw new SenifyError(
        "validation",
        `Release "${basis.id}" belongs to another site`,
        { field: "basisReleaseId" },
      );
    }
    pageRevisions = basis.pageRevisions;
    themeSnapshot = basis.themeSnapshot;
    // Rollback snaps the working state back to the referenced revisions before
    // the bake, so the O9 curtain checks the state that would go live.
    await context.store.updateTheme(
      input.siteId,
      themeSnapshot as never,
      input.author,
    );
    for (const entry of pageRevisions) {
      await restoreRevisionAsDraft(context, {
        pageId: entry.pageId,
        revisionId: entry.revisionId,
        author: input.author,
      });
    }
    // A release from before the manifest column has none: the registry stays
    // as it is (documented fallback), the output is reproducible for pages,
    // theme and content.
    if (basis.manifest !== null) {
      restoredRules = await context.store.replaceStyleRules(
        input.siteId,
        basis.manifest.styleRules,
        input.author,
      );
      restoredFrom = basis.id;
      restoredSiteDate = basis.manifest.siteDate;
    }
  } else {
    pageRevisions = [];
    for (const page of pages) {
      const revision = await context.store.createRevision({
        pageId: page.id,
        siteId: page.siteId,
        title: page.title,
        path: page.path,
        tree: page.draft,
        author: input.author,
        note: input.note,
      });
      pageRevisions.push({
        pageId: page.id,
        path: page.path,
        revisionId: revision.id,
      });
    }
    themeSnapshot = siteTheme.theme;
  }

  // The registry the bake is about to read is the one the manifest records.
  const styleRules =
    restoredRules ?? (await context.store.listStyleRules(input.siteId));
  const capturedAt = new Date().toISOString();
  // A rollback keeps the restored release's sitemap date, a fresh publish uses
  // its own — both travel in the manifest so the build is reproducible.
  const bakedSiteDate = restoredSiteDate ?? capturedAt.slice(0, 10);

  // O9 curtain (ticket 17): the bake happens into a preflight directory, the
  // static release checks run against the real output, and only a passing build
  // becomes a release. A failing check throws — no release row, no activation,
  // the previous release keeps serving.
  const preflightDir = mkdtempSync(join(context.dataDir, "preflight-"));
  let baked;
  try {
    baked = await bakePages(context.store, {
      site,
      pages: await context.store.listPageDrafts(input.siteId),
      outDir: preflightDir,
      dataDir: context.dataDir,
      siteDate: bakedSiteDate,
      formBaseUrl: context.formBaseUrl,
      ...(context.formSigner === undefined
        ? {}
        : { formSigner: context.formSigner }),
    });
  } catch (error) {
    rmSync(preflightDir, { recursive: true, force: true });
    throw error;
  }
  const preCheck = runReleasePreChecks({ outDir: baked.outDir });
  if (preCheck.hard.length > 0) {
    rmSync(preflightDir, { recursive: true, force: true });
    throw hardFailure(preCheck.hard, "publish");
  }

  const release = await context.store.createRelease({
    siteId: input.siteId,
    pageRevisions,
    themeSnapshot,
    buildRef: null,
    manifest: {
      styleRules,
      rendererVersion: RENDERER_VERSION,
      buildHash: hashBuildDir(baked.outDir),
      capturedAt,
      siteDate: bakedSiteDate,
      ...(restoredFrom === undefined ? {} : { restoredFrom }),
    },
    author: input.author,
    note: input.note,
    basisReleaseId: basisId,
  });

  // Move the checked build into place: one rename, no second bake. The
  // activation (build ref + active row) is one transaction; a crash before it
  // leaves the previous release serving and this one inactive.
  const target = releaseDir(context, release.id);
  mkdirSync(dirname(target), { recursive: true });
  renameSync(baked.outDir, target);
  await context.store.activateRelease({
    siteId: input.siteId,
    releaseId: release.id,
    buildRef: target,
  });
  return {
    release: { ...release, buildRef: target },
    checks: { hard: [], soft: [...report.soft, ...preCheck.soft] },
  };
}

export async function createPreview(
  context: LifecycleContext,
  input: { siteId: string; author: Author; ttlDays?: number },
): Promise<Preview> {
  const site = await context.store.getSite(input.siteId);
  const pages = await context.store.listPageDrafts(input.siteId);
  if (pages.length === 0) {
    throw new SenifyError("validation", "Site has no pages to preview", {
      field: "siteId",
    });
  }
  const previewId = newEntityId();
  const token = randomBytes(24).toString("base64url");
  const ttlDays = input.ttlDays ?? 30;
  const expiresAt = new Date(
    Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const baked = await bakePages(context.store, {
    site,
    pages,
    outDir: previewDir(context, previewId),
    dataDir: context.dataDir,
    formBaseUrl: context.formBaseUrl,
    // A preview is opened directly in a browser: the document carries the
    // build's own stylesheets and island scripts inlined, so nothing has to
    // serve the build root next to it (artifacts: preview without 404s).
    selfContained: true,
    ...(context.formSigner === undefined
      ? {}
      : { formSigner: context.formSigner }),
  });
  return context.store.createPreview({
    siteId: input.siteId,
    buildRef: baked.outDir,
    token,
    createdBy: input.author,
    expiresAt,
  });
}

export async function expirePreviews(
  context: LifecycleContext,
  siteId?: string,
): Promise<number> {
  const sites = siteId
    ? [siteId]
    : (await context.store.listSites()).map((site: Site) => site.id);
  let expired = 0;
  for (const id of sites) {
    for (const preview of await context.store.listPreviews(id, 200)) {
      if (preview.status !== "ready") continue;
      if (Date.parse(preview.expiresAt) > Date.now()) continue;
      await context.store.markPreviewExpired(preview.id);
      if (existsSync(preview.buildRef)) {
        rmSync(preview.buildRef, { recursive: true, force: true });
      }
      expired += 1;
    }
  }
  return expired;
}

// Build files are served from the build directory; the resolved path must
// stay inside it (no traversal through ..).
export function resolveBuildFile(
  root: string,
  relativePath: string,
): string | undefined {
  const base = resolve(root);
  const target = resolve(base, normalize(relativePath).replace(/^[/\\]+/, ""));
  if (target !== base && !target.startsWith(base + sep)) return undefined;
  return target;
}

export function resolvePreviewFile(
  preview: Preview,
  relativePath: string,
): string | undefined {
  return resolveBuildFile(preview.buildRef, relativePath);
}

// A release is the published build: the same resolution, but without a token —
// the site is public (see serveReleaseFile in http.ts).
export function resolveReleaseFile(
  release: Release,
  relativePath: string,
): string | undefined {
  if (release.buildRef === null) return undefined;
  return resolveBuildFile(release.buildRef, relativePath);
}

export function structureDiff(input: {
  baseByPage: Map<string, NodeTree>;
  pages: Page[];
}): StructureChange[] {
  const changes: StructureChange[] = [];
  for (const page of input.pages) {
    const base = input.baseByPage.get(page.id);
    if (!base) {
      changes.push({
        pageId: page.id,
        path: page.path,
        status: "added",
        sections: Object.values(page.draft.nodes)
          .filter((node) => node.id !== page.draft.rootNodeId)
          .map((node) => ({
            nodeId: node.id,
            type: node.type,
            change: "added" as const,
            fields: [],
          })),
      });
      continue;
    }
    const sections: StructureChange["sections"] = [];
    for (const [id, node] of Object.entries(page.draft.nodes)) {
      if (id === page.draft.rootNodeId) continue;
      const previous = base.nodes[id];
      if (!previous) {
        sections.push({ nodeId: id, type: node.type, change: "added", fields: [] });
        continue;
      }
      const fields: string[] = [];
      if (previous.variant !== node.variant) fields.push("variant");
      if (JSON.stringify(previous.props) !== JSON.stringify(node.props)) {
        fields.push("props");
      }
      if (JSON.stringify(previous.overrides) !== JSON.stringify(node.overrides)) {
        fields.push("overrides");
      }
      if (JSON.stringify(previous.motion) !== JSON.stringify(node.motion)) {
        fields.push("motion");
      }
      if (previous.hidden !== node.hidden) fields.push("hidden");
      if (fields.length > 0) {
        sections.push({ nodeId: id, type: node.type, change: "changed", fields });
      }
    }
    for (const [id, node] of Object.entries(base.nodes)) {
      if (id === page.draft.rootNodeId) continue;
      if (!page.draft.nodes[id]) {
        sections.push({ nodeId: id, type: node.type, change: "removed", fields: [] });
      }
    }
    changes.push({
      pageId: page.id,
      path: page.path,
      status: sections.length > 0 ? "changed" : "unchanged",
      sections,
    });
  }
  return changes;
}

async function baseTreesFromActiveRelease(
  context: LifecycleContext,
  siteId: string,
): Promise<Map<string, NodeTree>> {
  const base = new Map<string, NodeTree>();
  const activeReleaseId = await context.store.getActiveReleaseId(siteId);
  if (activeReleaseId === null) return base;
  const release = await context.store.getRelease(activeReleaseId);
  for (const entry of release.pageRevisions) {
    try {
      const revision = await context.store.getRevision(entry.revisionId);
      base.set(entry.pageId, revision.tree);
    } catch {
      // Missing revisions (deleted pages) simply drop out of the diff base.
    }
  }
  return base;
}

export type SubmitResult = {
  review: ReviewItem;
  preview: Preview;
  checks: CheckSummary;
};

export async function submitReview(
  context: LifecycleContext,
  input: {
    siteId: string;
    author: Author;
    note: string | null;
    pageIds?: string[];
    ttlDays?: number;
  },
): Promise<SubmitResult> {
  const site = await context.store.getSite(input.siteId);
  const allPages = await context.store.listPageDrafts(input.siteId);
  if (allPages.length === 0) {
    throw new SenifyError("validation", "Site has no pages to review", {
      field: "siteId",
    });
  }
  const siteTheme = await context.store.getTheme(input.siteId);
  const report = runChecks({
    stage: "submit",
    pages: allPages,
    site,
    theme: siteTheme.theme,
    assets: await context.store.assetUsageMap(input.siteId),
    referenceAdherence: await referenceAdherence(context, input.siteId, siteTheme.theme),
  });
  if (report.hard.length > 0) {
    throw hardFailure(report.hard, "submit");
  }
  // Design-Score (E26 S3): submit never blocks on the score, but the findings
  // ride along as soft issues so the review shows them with the item.
  const designReport = await buildDesignReport({
    store: context.store,
    siteId: input.siteId,
  });
  if (designReport.verdict !== "green") {
    report.soft.push({
      code: "design-score",
      severity: "soft",
      message: `Design-Score ${designReport.score} (${designReport.verdict}, Schwelle grün ${designReport.thresholds.green})`,
      suggestion: designReport.findings[0]?.suggestion ?? "get_design_report liefert die Findings.",
    });
  }

  const baseByPage = await baseTreesFromActiveRelease(context, input.siteId);
  const diff = structureDiff({ baseByPage, pages: allPages });
  const requested = input.pageIds;
  const changedPages = allPages.filter((page) => {
    if (requested !== undefined) return requested.includes(page.id);
    const entry = diff.find((candidate) => candidate.pageId === page.id);
    return entry === undefined || entry.status !== "unchanged";
  });
  if (changedPages.length === 0) {
    throw new SenifyError("validation", "Nothing changed since the active release", {
      field: "pageIds",
      suggestion: "Edit the draft first, or pass pageIds to review pages explicitly.",
    });
  }

  const preview = await createPreview(context, {
    siteId: input.siteId,
    author: input.author,
    ttlDays: input.ttlDays,
  });
  const importReports: ImportReport[] = [];
  for (const job of await context.store.listImportJobsForSite(input.siteId, 100)) {
    if (job.status !== "succeeded" || job.dryRun) continue;
    const raw = await context.store.getImportJobResult(job.id);
    if (raw === null) continue;
    const report = raw as unknown as ImportReport;
    if (report.pageId !== null && changedPages.some((page) => page.id === report.pageId)) {
      importReports.push(report);
    }
  }

  let review = await context.store.createReviewItem({
    siteId: input.siteId,
    previewId: preview.id,
    baseState: changedPages.map((page) => ({
      pageId: page.id,
      tree: page.draft,
      title: page.title,
      path: page.path,
    })),
    pages: changedPages.map((page) => page.id),
    author: input.author,
    structureDiff: diff,
    guardrails: { hard: [], soft: report.soft },
    importReports,
    note: input.note,
  });
  // Visual artifacts (T07): captured after the item exists so the files can
  // live under its id. A failed capture never blocks the review.
  const visuals = await captureReviewVisuals(context, {
    siteId: input.siteId,
    reviewId: review.id,
    preview,
    pages: changedPages,
    diff,
  });
  if (visuals !== null) {
    review = await context.store.updateReviewItem(review.id, { visuals });
  }
  return { review, preview, checks: report };
}

// Screenshots (three breakpoints per changed page) plus the diff against the
// active release; the motion video only when the structure diff touched a
// motion field. Failures land as a note on the item.
async function captureReviewVisuals(
  context: LifecycleContext,
  input: {
    siteId: string;
    reviewId: string;
    preview: Preview;
    pages: Page[];
    diff: StructureChange[];
  },
): Promise<ReviewVisuals | null> {
  const driver = context.visuals;
  if (driver === undefined) return null;
  const releaseId = await context.store.getActiveReleaseId(input.siteId);
  const release = releaseId === null ? null : await context.store.getRelease(releaseId);
  const pages = input.pages
    .filter((page) => page.template === null)
    .map((page) => ({ pageId: page.id, path: page.path }));
  if (pages.length === 0) return null;
  const recordMotion = input.diff.some((entry) =>
    entry.sections.some((section) => section.fields.includes("motion")),
  );
  try {
    const capture = await driver({
      baseDir: release?.buildRef ?? null,
      afterDir: input.preview.buildRef,
      pages,
      recordMotion,
      breakpoints: REVIEW_VISUAL_BREAKPOINTS,
    });
    return persistReviewVisuals(context, input.reviewId, capture);
  } catch (error) {
    return {
      capturedAt: new Date().toISOString(),
      assets: [],
      diffs: [],
      note:
        error instanceof Error
          ? `Visuelle Aufnahme fehlgeschlagen: ${error.message}`
          : "Visuelle Aufnahme fehlgeschlagen",
    };
  }
}

export async function approveReview(
  context: LifecycleContext,
  input: { reviewId: string; author: Author; note?: string },
): Promise<{ review: ReviewItem; release: Release }> {
  const review = await context.store.getReviewItem(input.reviewId);
  if (review.status === "approved" || review.status === "discarded") {
    throw new SenifyError(
      "conflict",
      `Review "${review.id}" is already ${review.status}`,
      { field: "reviewId" },
    );
  }
  const { release } = await publishRelease(context, {
    siteId: review.siteId,
    author: input.author,
    note: input.note ?? `review ${review.id}`,
  });
  const updated = await context.store.updateReviewItem(review.id, {
    status: "approved",
    releaseId: release.id,
    resolvedAt: new Date().toISOString(),
    ...(input.note === undefined
      ? {}
      : {
          comment: {
            at: new Date().toISOString(),
            author: input.author,
            note: input.note,
          },
        }),
  });
  return { review: updated, release };
}

export async function requestChanges(
  context: LifecycleContext,
  input: { reviewId: string; author: Author; note: string },
): Promise<ReviewItem> {
  const review = await context.store.getReviewItem(input.reviewId);
  if (review.status === "discarded") {
    throw new SenifyError("conflict", `Review "${review.id}" was discarded`, {
      field: "reviewId",
    });
  }
  const note = requireNote(input.note, "Request changes");
  return context.store.updateReviewItem(review.id, {
    status: "changes_requested",
    resolvedAt: new Date().toISOString(),
    comment: { at: new Date().toISOString(), author: input.author, note },
  });
}

export async function discardReview(
  context: LifecycleContext,
  input: { reviewId: string; author: Author; note?: string },
): Promise<ReviewItem> {
  const review = await context.store.getReviewItem(input.reviewId);
  if (review.status === "discarded") return review;
  for (const snapshot of review.baseState) {
    const page = await context.store.getPage(snapshot.pageId);
    await context.store.persistBatch({
      pageId: page.id,
      expectedVersion: page.draftVersion,
      draft: snapshot.tree,
      title: snapshot.title,
      path: snapshot.path,
      entries: [
        {
          siteId: page.siteId,
          pageId: page.id,
          batchId: newEntityId(),
          opIndex: 0,
          mutation: "discardReview",
          params: { reviewId: review.id },
          author: input.author,
          undoPatch: [],
          draftVersionAfter: 0,
        },
      ],
    });
  }
  return context.store.updateReviewItem(review.id, {
    status: "discarded",
    resolvedAt: new Date().toISOString(),
    ...(input.note === undefined
      ? {}
      : {
          comment: {
            at: new Date().toISOString(),
            author: input.author,
            note: input.note,
          },
        }),
  });
}
