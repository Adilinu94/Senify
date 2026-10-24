import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NodeTree } from "@senify/section-sdk";
import { approveReview, createPreview, discardReview, rebakeActiveRelease, requestChanges, restoreRevisionAsDraft, structureDiff, submitReview } from "@senify/engine";
import { bootEngine, createTestPage, createTestSite, TEST_AUTHOR, type BootEnv } from "./helpers.ts";

describe("Lifecycle-Verträge", () => {
  let env: BootEnv;
  let siteId: string;
  let pageId: string;
  beforeAll(async () => {
    env = await bootEngine();
    siteId = (await createTestSite(env.api)).id;
    pageId = (await createTestPage(env.api, siteId)).id;
  });
  afterAll(async () => { await env.close(); });

  it("verweigert eine fremde Revision ohne Änderung des Ziel-Drafts", async () => {
    const page = await env.engine.store.getPage(pageId);
    const revision = await env.engine.store.createRevision({ pageId, siteId, title: page.title, path: page.path, tree: page.draft, author: TEST_AUTHOR, note: null });
    const otherSiteId = (await createTestSite(env.api, "Andere Site")).id;
    const other = await createTestPage(env.api, otherSiteId, { path: "/other", title: "Andere" });
    await expect(restoreRevisionAsDraft(env.engine, { pageId: other.id, revisionId: revision.id, author: TEST_AUTHOR })).rejects.toMatchObject({ category: "validation", field: "revisionId" });
    const after = await env.engine.store.getPage(other.id);
    expect(after.draftVersion).toBe(other.draftVersion);
    expect(after.draft).toEqual(other.draft);
    expect(after.title).toBe(other.title);
    expect(after.path).toBe(other.path);
  });

  it("verweigert Re-bake ohne Release und Preview/Review ohne Pages", async () => {
    const empty = (await createTestSite(env.api, "Leer")).id;
    await expect(rebakeActiveRelease(env.engine, empty)).rejects.toMatchObject({ category: "validation", field: "siteId" });
    await expect(createPreview(env.engine, { siteId: empty, author: TEST_AUTHOR })).rejects.toMatchObject({ category: "validation", field: "siteId" });
    await expect(submitReview(env.engine, { siteId: empty, author: TEST_AUTHOR, note: null })).rejects.toMatchObject({ category: "validation", field: "siteId" });
  });

  it("verweigert eine leere Page-Auswahl vor dem Bake", async () => {
    await expect(submitReview(env.engine, { siteId, pageIds: [], author: TEST_AUTHOR, note: null })).rejects.toMatchObject({ category: "validation", field: "pageIds" });
    expect(await env.engine.store.listPreviews(siteId)).toEqual([]);
  });

  it("hält verworfene Reviews geschlossen und verwirft idempotent", async () => {
    const review = await env.engine.store.createReviewItem({ siteId, previewId: null, baseState: [], pages: [pageId], author: TEST_AUTHOR, structureDiff: [], guardrails: { hard: [], soft: [] }, note: null });
    const discarded = await discardReview(env.engine, { reviewId: review.id, author: TEST_AUTHOR });
    expect(discarded).toMatchObject({ status: "discarded", thread: [] });
    expect(await discardReview(env.engine, { reviewId: review.id, author: TEST_AUTHOR, note: "nochmal" })).toEqual(discarded);
    await expect(approveReview(env.engine, { reviewId: review.id, author: TEST_AUTHOR })).rejects.toMatchObject({ category: "conflict", field: "reviewId" });
    await expect(requestChanges(env.engine, { reviewId: review.id, author: TEST_AUTHOR, note: "Änderung" })).rejects.toMatchObject({ category: "conflict", field: "reviewId" });
    const open = await env.engine.store.createReviewItem({ siteId, previewId: null, baseState: [], pages: [pageId], author: TEST_AUTHOR, structureDiff: [], guardrails: { hard: [], soft: [] }, note: null });
    await expect(requestChanges(env.engine, { reviewId: open.id, author: TEST_AUTHOR, note: "  " })).rejects.toMatchObject({ category: "validation", field: "note" });
    expect((await env.engine.store.getReviewItem(open.id)).status).toBe("submitted");
  });

  it("unterscheidet neue, entfernte und pro Feld geänderte Sections", async () => {
    const page = await env.engine.store.getPage(pageId);
    const before: NodeTree = { rootNodeId: "root", nodes: {
      root: { id: "root", type: "page", props: {}, children: ["changed", "removed"] },
      changed: { id: "changed", type: "hero", props: { headline: "Alt" }, variant: "boxed" },
      removed: { id: "removed", type: "hero", props: {} },
    } };
    const after: NodeTree = { rootNodeId: "root", nodes: {
      root: { id: "root", type: "page", props: {}, children: ["changed", "added"] },
      changed: { id: "changed", type: "hero", props: { headline: "Neu" }, variant: "full", overrides: { mobile: { props: { headline: "Override" } } }, motion: { preset: "fade-up" }, hidden: true },
      added: { id: "added", type: "hero", props: {} },
    } };
    expect(structureDiff({ baseByPage: new Map([[page.id, before]]), pages: [{ ...page, draft: after }] })).toEqual([{
      pageId: page.id, path: page.path, status: "changed", sections: [
        { nodeId: "changed", type: "hero", change: "changed", fields: ["variant", "props", "overrides", "motion", "hidden"] },
        { nodeId: "added", type: "hero", change: "added", fields: [] },
        { nodeId: "removed", type: "hero", change: "removed", fields: [] },
      ],
    }]);
    expect(structureDiff({ baseByPage: new Map([[page.id, after]]), pages: [{ ...page, draft: after }] })[0]).toMatchObject({ status: "unchanged", sections: [] });
  });
});
