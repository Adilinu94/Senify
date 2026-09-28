import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { SenifyError } from "@senify/core";
import { RENDERER_VERSION } from "@senify/renderer";
import type { Author, NodeTree } from "@senify/section-sdk";
import type { StyleRule } from "@senify/widget-engine";
import { bakePages } from "./bake.ts";
import { hashBuildDir } from "./build-hash.ts";
import { runChecks } from "./checks.ts";
import { buildDesignReport, designStateVersion } from "./design-report.ts";
import { collectAssetIds } from "./media.ts";
import { resolveStoredFile } from "./storage.ts";
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
  Entry,
  Page,
  Preview,
  Release,
  ReleaseAssetSnapshot,
  ReleaseComponentSnapshot,
  ReleaseEntrySnapshot,
  ReleasePageRevision,
  ReleasePayloadSnapshot,
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
  // P3-4 (R7): a content re-bake re-snapshots rather than inheriting. The
  // pages are the same, but "the same" has to be checked, not assumed: a
  // re-bake runs after a CMS sync, and an entry that became published in
  // between belongs to THIS release. The base release's snapshots are the
  // fallback only for a manifest written before this step existed.
  const snapshots = await buildReleaseSnapshots(context, {
    siteId,
    pages: pages.map((page) => ({ draft: page.draft })),
  });
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
      assets: snapshots.assets,
      components: snapshots.components,
      payloads: snapshots.payloads,
      entries: snapshots.entries,
      // P2-4 (R4): a content re-bake changes no content - the same draft, the
      // same theme, the same design. It therefore carries the base release's
      // design record forward instead of measuring again: re-measuring here
      // would attach a second, equally valid record to a release that is
      // materially the same one, and the manifest would stop being a statement
      // about the release.
      designRecordId: activeRelease.manifest?.designRecordId ?? null,
      designScore: activeRelease.manifest?.designScore ?? null,
      designVerdict: activeRelease.manifest?.designVerdict ?? null,
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
  // P2-4 (R4): the report is frozen as a record before the release is built,
  // so the release manifest and the review can point at this object instead of
  // recomputing it later. A recomputation would let today's score rewrite what
  // this release was.
  const publishRecord = await context.store.createDesignRecord({
    siteId: input.siteId,
    stage: "publish",
    draftVersion: designStateVersion({
      pages: (await context.store.listPageDrafts(input.siteId)).map((page) => ({
        id: page.id,
        draftVersion: page.draftVersion,
      })),
      themeVersion: siteTheme.version,
    }),
    themeVersion: siteTheme.version,
    report: designReport,
  });

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
      // P3-4 (R7): the rest of the manifest, restored the same way the style
      // registry is. Without this the pages come back pointing at assets that
      // were deleted after the release, or at different ones with the same
      // name - a rollback that restores the styling of a site whose media
      // moved on is not a rollback.
      await restoreSnapshotAssets(context, {
        siteId: input.siteId,
        assets: basis.manifest.assets,
        // The basis release's own build directory. Its copy of every asset is
        // the only place the original bytes still exist once the library has
        // replaced or deleted them.
        basisBuildDir: releaseDir(context, basis.id),
      });
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

  // P3-4 (R7): what the release USED, frozen as values. Collected from the
  // pages that are going INTO this release, so the snapshot is about this
  // release and not about the site. The warnings ride along on the release's
  // own warning list: an asset a page references but the library no longer has
  // is a fact about this release, and hiding it would make the rollback look
  // cleaner than the release was.
  const snapshots = await buildReleaseSnapshots(context, {
    siteId: input.siteId,
    pages: await context.store
      .listPageDrafts(input.siteId)
      .then((list) => list.map((page) => ({ draft: page.draft }))),
  });

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
      assets: snapshots.assets,
      components: snapshots.components,
      payloads: snapshots.payloads,
      entries: snapshots.entries,
      // P2-4 (R4): the manifest points at the frozen record and repeats the
      // three numbers that opened the gate. The record is the authority; these
      // are what a reader of the manifest alone should see.
      designRecordId: publishRecord.id,
      designScore: designReport.score,
      designVerdict: designReport.verdict,
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
  // P2-4 (R4): the review freezes its own measurement. Publish and review ask
  // different questions of the same site at the same moment, so the review
  // record is not a copy of the publish one - it is a second, separate
  // measurement that stays true even after the draft moves on.
  await context.store.createDesignRecord({
    siteId: input.siteId,
    stage: "review",
    draftVersion: designStateVersion({
      pages: allPages.map((page) => ({ id: page.id, draftVersion: page.draftVersion })),
      themeVersion: siteTheme.version,
    }),
    themeVersion: siteTheme.version,
    report: designReport,
  });

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

// What the release actually USED, frozen as values (Fahrplan P3-4, R7).
//
// The rule is "only what this release needs", not "everything in the site": a
// rollback that restores an unused asset is a rollback that resurrects data
// someone deleted on purpose. So every list starts from the release's own
// pages and walks outward from there.
//
// A missing asset is not dropped. An id a page references but the library no
// longer has is a broken page today, and a snapshot that quietly omitted it
// would make the rollback look cleaner than the release was. It is reported
// instead, so the release's own state stays visible.
async function buildReleaseSnapshots(
  context: LifecycleContext,
  input: { siteId: string; pages: { draft: NodeTree }[] },
): Promise<{
  assets: ReleaseAssetSnapshot[];
  components: ReleaseComponentSnapshot[];
  payloads: ReleasePayloadSnapshot[];
  entries: ReleaseEntrySnapshot[];
  warnings: string[];
}> {
  const warnings: string[] = [];

  // Assets: only the ids the release's pages reference.
  const wantedAssets = collectAssetIds(input.pages);
  const library = await context.store.listAssets(input.siteId, { status: "all" });
  const assets: ReleaseAssetSnapshot[] = [];
  for (const asset of library) {
    if (!wantedAssets.has(asset.id)) continue;
    assets.push({
      id: asset.id,
      siteId: asset.siteId,
      filename: asset.filename,
      mime: asset.mime,
      kind: asset.kind,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      hash: asset.hash,
      altText: asset.altText,
      decorative: asset.decorative,
      folderId: asset.folderId,
      tags: asset.tags,
      storageRef: asset.storageRef,
    });
  }
  for (const id of wantedAssets) {
    if (assets.some((asset) => asset.id === id)) continue;
    warnings.push(
      `Release verweist auf Asset "${id}", das es in der Bibliothek nicht (mehr) gibt.`,
    );
  }

  // Components: the ones the release's pages instantiate. The registry is
  // global, so this is a narrow filter over what the pages use - a component
  // installed later must not join a release that predates it.
  const usedComponents = new Set<string>();
  const usedPayloadCarriers = new Set<string>();
  for (const page of input.pages) {
    for (const node of Object.values(page.draft.nodes)) {
      const props = node.props as Record<string, unknown>;
      const componentId = props["componentId"] ?? props["componentSlug"];
      if (typeof componentId === "string" && componentId !== "") {
        usedComponents.add(componentId);
      }
      if (typeof props["payloadId"] === "string") {
        usedPayloadCarriers.add(`${node.id}:${props["payloadId"]}`);
      }
    }
  }
  const components: ReleaseComponentSnapshot[] = [];
  for (const component of await context.store.listLibraryComponents()) {
    if (!usedComponents.has(component.id) && !usedComponents.has(component.slug)) continue;
    components.push({
      id: component.id,
      slug: component.slug,
      name: component.name,
      kind: component.kind,
      definition: component.definition,
      fingerprint: component.fingerprint,
      version: component.version,
    });
  }

  // Payloads: frozen with their provenance, because ADR-0010 moves a payload
  // between "proposal" and "published carrier" and a rollback has to restore
  // which of the two it was.
  const payloads: ReleasePayloadSnapshot[] = (
    await context.store.listCodePayloads(input.siteId)
  ).map((payload) => ({
    id: payload.id,
    name: payload.name,
    kind: payload.kind,
    bytes: payload.bytes,
    integrity: payload.integrity,
    version: payload.version,
    provenance: payload.provenance,
    license: payload.license,
  }));

  // Entries: the CMS content the release published, each with the version
  // that was live. The store filters on `status`, so this asks for exactly the
  // published ones - an entry that was edited but never published belongs to
  // the NEXT release, and including it would publish text nobody reviewed.
  //
  // `activeVersionId` is the authority, not `publishedAt`: the version is what
  // a rollback has to restore, and the timestamp is only there for reading.
  // An entry with a published status and no active version is reported rather
  // than skipped - a silent omission would make the rollback look complete
  // while it is not.
  const entries: ReleaseEntrySnapshot[] = [];
  const published = await context.store
    .listEntries({ siteId: input.siteId, status: "published" })
    .catch(() => [] as Entry[]);
  for (const entry of published) {
    if (entry.activeVersionId === null) {
      warnings.push(
        `Eintrag "${entry.slug}" ist veröffentlicht, hat aber keine aktive Version.`,
      );
      continue;
    }
    entries.push({
      id: entry.id,
      collection: entry.collectionId,
      path: entry.cells["path"] !== undefined ? String(entry.cells["path"]) : entry.slug,
      slug: entry.slug,
      revisionId: entry.activeVersionId,
      title: entry.cells["title"] !== undefined ? String(entry.cells["title"]) : entry.slug,
      publishedAt: entry.publishedAt ?? entry.updatedAt,
    });
  }

  return { assets, components, payloads, entries, warnings };
}

// Puts the release's assets back the way the release found them (Fahrplan P3-4,
// R7). The comparison is by CONTENT HASH, not by id or file name:
//
//   - same id, same hash: nothing to do. The overwhelmingly common case.
//   - same id, different hash: the file was REPLACED after the release. The
//     release's bytes are still in the release directory it was baked into, so
//     the rollback copies them back and points the row at them. The pages were
//     built against those bytes; restoring the row without restoring the file
//     would show a picture the page never shipped with.
//   - missing id, file gone: the row comes back from the snapshot, the bytes
//     cannot. The publish guard then refuses the release, and that is the right
//     outcome - a hash is a fingerprint, not a backup. Pretending otherwise
//     would ship a broken image.
//
// What this deliberately does NOT do: restore an asset the release did not
// reference. A rollback that resurrects unrelated media is a rollback that
// undoes a deletion someone made on purpose.
async function restoreSnapshotAssets(
  context: LifecycleContext,
  input: {
    siteId: string;
    assets: ReleaseAssetSnapshot[];
    // The directory the basis release was baked into. The release's own copy of
    // every asset is there, and it is the only place the original bytes still
    // exist once the library has moved on.
    basisBuildDir: string | null;
  },
): Promise<{ restored: string[]; unrecoverable: string[] }> {
  const restored: string[] = [];
  const unrecoverable: string[] = [];
  for (const snapshot of input.assets) {
    // A snapshot from before this step existed carries no assets; the list is
    // empty and the rollback restores pages, theme and styling as before.
    const existing = await context.store
      .getAsset(snapshot.id)
      .catch(() => null);
    if (existing !== null && existing.hash === snapshot.hash) {
      // Present and identical. Nothing to do - the common path, and the one
      // that must stay cheap.
      continue;
    }
    // The release's copy of the bytes, when it is still there. This is what
    // makes a REPLACED asset recoverable: the library holds the new version, the
    // release directory holds the one the pages were built against.
    const releaseCopy =
      input.basisBuildDir === null
        ? null
        : join(input.basisBuildDir, "assets", snapshot.id, snapshot.filename);
    if (releaseCopy !== null && existsSync(releaseCopy)) {
      const target = resolveStoredFile(context.dataDir, snapshot.storageRef);
      if (target !== undefined) {
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(releaseCopy, target);
      }
    } else if (!existsSync(resolveStoredFile(context.dataDir, snapshot.storageRef) ?? "")) {
      // Neither the library nor the release has these bytes. The row can come
      // back; the page will bake to a missing image and the publish guard will
      // say so.
      unrecoverable.push(snapshot.id);
    }
    await context.store
      .replaceAssetFromSnapshot(snapshot)
      .then(() => {
        restored.push(snapshot.id);
      })
      .catch(() => {
        // The asset belonged to a DIFFERENT site, or its folder is gone. The
        // page will bake to a broken image either way; the report says so.
        unrecoverable.push(snapshot.id);
      });
  }
  return { restored, unrecoverable };
}
