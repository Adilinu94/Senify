import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import type { NodeTree } from "@senify/section-sdk";
import { ensureSchema, Store } from "@senify/engine";
import { RevisionsRepository } from "../src/store-revisions.ts";
import { createTestDatabase, TEST_AUTHOR } from "./helpers.ts";

// ADR 0019: page revisions live in `RevisionsRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return { db: database.db, repo: new RevisionsRepository(database.db) };
}

const tree = (nodeCount = 2): NodeTree => {
  const nodes: Record<string, unknown> = { root: { id: "root", type: "page", props: {}, children: [] } };
  for (let i = 1; i < nodeCount; i += 1) nodes[`n${i}`] = { id: `n${i}`, type: "section", props: {}, children: [] };
  return { rootNodeId: "root", nodes } as unknown as NodeTree;
};

const revision = (pageId = "p1", note: string | null = "vor dem Umbau") => ({
  pageId,
  siteId: "s1",
  title: "Start",
  path: "/",
  tree: tree(),
  author: TEST_AUTHOR,
  note,
});

describe("RevisionsRepository", () => {
  it("snapshots a page and reads the snapshot back unchanged", async () => {
    const { repo } = await fixture();
    const created = await repo.createRevision(revision());
    expect(created).toMatchObject({ pageId: "p1", siteId: "s1", title: "Start", path: "/", note: "vor dem Umbau" });
    expect(await repo.getRevision(created.id)).toEqual(created);
    expect((await repo.getRevision((await repo.createRevision(revision("p1", null))).id)).note).toBeNull();
  });

  it("answers an unknown id with not_found on revisionId", async () => {
    const { repo } = await fixture();
    const error = await repo.getRevision("missing").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found", field: "revisionId" });
  });

  it("lists one page's revisions newest first as summaries without the tree", async () => {
    const { db, repo } = await fixture();
    const older = await repo.createRevision({ ...revision(), tree: tree(2) });
    const newer = await repo.createRevision({ ...revision(), tree: tree(4) });
    await repo.createRevision(revision("p2"));
    await db.query(`UPDATE page_revisions SET created_at = $2 WHERE id = $1`, [older.id, "2026-10-01T10:00:00.000Z"]);
    await db.query(`UPDATE page_revisions SET created_at = $2 WHERE id = $1`, [newer.id, "2026-10-02T10:00:00.000Z"]);
    const listed = await repo.listRevisions("p1");
    expect(listed.map((r) => [r.id, r.nodeCount])).toEqual([
      [newer.id, 4],
      [older.id, 2],
    ]);
    expect(listed[0]).not.toHaveProperty("tree");
  });

  it("clamps the limit to 1..200", async () => {
    const { repo } = await fixture();
    for (let i = 0; i < 201; i += 1) await repo.createRevision(revision());
    expect(await repo.listRevisions("p1", 0)).toHaveLength(1);
    expect(await repo.listRevisions("p1", 10_000)).toHaveLength(200);
  });

  it("refuses to read a snapshot whose tree has no valid shape", async () => {
    const { db, repo } = await fixture();
    const created = await repo.createRevision(revision());
    await db.query(`UPDATE page_revisions SET tree = $2 WHERE id = $1`, [created.id, JSON.stringify({ nodes: {} })]);
    await expect(repo.getRevision(created.id)).rejects.toThrow("Stored page draft has an invalid shape");
  });

  it("is what Store delegates to: both see the same revisions", async () => {
    const { db, repo } = await fixture();
    const store = new Store(db);
    const viaStore = await store.createRevision(revision());
    expect(await repo.getRevision(viaStore.id)).toEqual(viaStore);
    const viaRepo = await repo.createRevision(revision());
    expect(await store.getRevision(viaRepo.id)).toEqual(viaRepo);
    expect(await store.listRevisions("p1")).toEqual(await repo.listRevisions("p1"));
  });
});
