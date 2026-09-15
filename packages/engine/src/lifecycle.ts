import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { SenifyError } from "@senify/core";
import type { Author, NodeTree } from "@senify/section-sdk";
import { bakePages } from "./bake.ts";
import { runChecks } from "./checks.ts";
import { newEntityId } from "./ids.ts";
import type { Store } from "./store.ts";
import type {
  CheckIssue,
  Page,
  Preview,
  Release,
  ReleasePageRevision,
  ReviewItem,
  Site,
  StructureChange,
} from "./types.ts";

export type LifecycleContext = {
  store: Store;
  dataDir: string;
};

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
  });
  if (report.hard.length > 0) {
    throw hardFailure(report.hard, "publish");
  }

  const basisId = input.basisReleaseId ?? null;
  let pageRevisions: ReleasePageRevision[];
  let themeSnapshot: unknown;
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

  const release = await context.store.createRelease({
    siteId: input.siteId,
    pageRevisions,
    themeSnapshot,
    buildRef: null,
    author: input.author,
    note: input.note,
    basisReleaseId: basisId,
  });

  // Rollback snaps the working state back to the referenced revisions
  // (append-only: new drafts and a new release, nothing is rewritten).
  if (basisId !== null) {
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
  }

  const baked = await bakePages(context.store, {
    site,
    pages: await context.store.listPageDrafts(input.siteId),
    outDir: releaseDir(context, release.id),
    dataDir: context.dataDir,
  });
  await context.store.attachReleaseBuild(release.id, baked.outDir);
  await context.store.setActiveRelease(input.siteId, release.id);
  return {
    release: { ...release, buildRef: baked.outDir },
    checks: { hard: [], soft: report.soft },
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

// Preview files are served from the build directory; the resolved path must
// stay inside it (no traversal through ..).
export function resolvePreviewFile(
  preview: Preview,
  relativePath: string,
): string | undefined {
  const root = resolve(preview.buildRef);
  const target = resolve(root, normalize(relativePath).replace(/^[/\\]+/, ""));
  if (target !== root && !target.startsWith(root + sep)) return undefined;
  return target;
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
  });
  if (report.hard.length > 0) {
    throw hardFailure(report.hard, "submit");
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
  const review = await context.store.createReviewItem({
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
    note: input.note,
  });
  return { review, preview, checks: report };
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
