import { afterEach, describe, expect, it } from "vitest";
import { ensureSchema } from "@senify/engine";
import { ReviewsRepository } from "../src/store-reviews.ts";
import { createTestDatabase, TEST_AUTHOR } from "./helpers.ts";

// ADR 0019: previews and review items live in `ReviewsRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return new ReviewsRepository(database.db);
}

const review = (repo: ReviewsRepository, note: string | null = "Bitte prüfen") =>
  repo.createReviewItem({
    siteId: "s1",
    previewId: null,
    baseState: [],
    pages: ["page-1"],
    author: TEST_AUTHOR,
    structureDiff: [],
    guardrails: { hard: [], soft: [] },
    note,
  });

describe("ReviewsRepository", () => {
  it("round-trips a preview and marks it expired once", async () => {
    const repo = await fixture();
    const created = await repo.createPreview({
      siteId: "s1",
      buildRef: "build-1",
      token: "tok",
      createdBy: TEST_AUTHOR,
      expiresAt: "2026-10-12T00:00:00.000Z",
    });
    expect(await repo.getPreview(created.id)).toEqual(created);
    await repo.markPreviewExpired(created.id);
    await repo.markPreviewExpired(created.id);
    expect((await repo.getPreview(created.id)).status).toBe("expired");
    expect((await repo.listPreviews("s1")).map((p) => p.id)).toEqual([created.id]);
  });

  it("stores a review with its opening note and reads it back unchanged", async () => {
    const repo = await fixture();
    const created = await review(repo);
    expect(created.thread).toHaveLength(1);
    expect(await repo.getReviewItem(created.id)).toEqual(created);
    expect((await review(repo, null)).thread).toEqual([]);
  });

  it("filters reviews by status", async () => {
    const repo = await fixture();
    const open = await review(repo);
    const done = await review(repo);
    await repo.updateReviewItem(done.id, { status: "approved" });
    expect((await repo.listReviewItems("s1", { status: "approved" })).map((r) => r.id)).toEqual([done.id]);
    expect((await repo.listReviewItems("s1", { status: "submitted" })).map((r) => r.id)).toEqual([open.id]);
    expect(await repo.listReviewItems("s1")).toHaveLength(2);
  });

  it("appends comments and keeps fields the patch leaves out", async () => {
    const repo = await fixture();
    const created = await review(repo);
    const comment = { at: "2026-10-11T12:00:00.000Z", author: TEST_AUTHOR, note: "Passt" };
    const updated = await repo.updateReviewItem(created.id, {
      status: "approved",
      comment,
      releaseId: "rel-1",
      resolvedAt: comment.at,
    });
    expect(updated.thread.map((entry) => entry.note)).toEqual(["Bitte prüfen", "Passt"]);
    expect(await repo.getReviewItem(created.id)).toEqual(updated);
    const again = await repo.updateReviewItem(created.id, {});
    expect(again).toMatchObject({ status: "approved", releaseId: "rel-1", resolvedAt: comment.at });
  });

  it("reports unknown previews and reviews as not_found", async () => {
    const repo = await fixture();
    await expect(repo.getPreview("missing")).rejects.toMatchObject({ category: "not_found" });
    await expect(repo.getReviewItem("missing")).rejects.toMatchObject({ category: "not_found" });
    await expect(repo.updateReviewItem("missing", {})).rejects.toMatchObject({ category: "not_found" });
  });
});
