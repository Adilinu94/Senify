import { describe, expect, it } from "vitest";
import { ensureSchema, Store, type Db, type DbClient } from "@senify/engine";
import { createTestDatabase, createTestRegistry } from "./helpers.ts";
import { applyMutations } from "@senify/engine";

const hasRealPostgres = (process.env.TEST_DATABASE_URL ?? "").length > 0;

describe.skipIf(!hasRealPostgres)("persistBatch transactions (real Postgres)", () => {
  it("rolls back the page write when an audit insert fails", async () => {
    const database = await createTestDatabase();
    try {
      const store = new Store(database.db);
      const site = await store.createSite({ name: "Tx Site" });
      const created = await store.createPage(site.id, {});
      expect(created.draftVersion).toBe(1);

      const sabotaged: Db = {
        query: (text, params) => database.db.query(text, params),
        withTransaction: (task) =>
          database.db.withTransaction((tx) => {
            const guarded: DbClient = {
              query: (text, params) => {
                if (text.includes("audit_entries")) {
                  throw new Error("Simulated audit write failure");
                }
                return tx.query(text, params);
              },
            };
            return task(guarded);
          }),
      };
      const txStore = new Store(sabotaged);
      await expect(
        txStore.persistBatch({
          pageId: created.id,
          expectedVersion: 1,
          draft: created.draft,
          title: created.title,
          path: created.path,
          entries: [
            {
              siteId: site.id,
              pageId: created.id,
              batchId: "batch-tx-1",
              opIndex: 0,
              mutation: "updatePageMeta",
              params: { op: "updatePageMeta", title: "Changed" },
              author: { kind: "agent", id: "a", label: "A" },
              undoPatch: [],
              draftVersionAfter: 0,
            },
          ],
        }),
      ).rejects.toThrow("Simulated audit write failure");

      const reloaded = await store.getPage(created.id);
      expect(reloaded.draftVersion).toBe(1);
      expect(reloaded.title).toBe(created.title);
      expect(await store.listAudit(created.id)).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it("persists page and audit atomically on success", async () => {
    const database = await createTestDatabase();
    try {
      const store = new Store(database.db);
      const site = await store.createSite({ name: "Tx Site 2" });
      const created = await store.createPage(site.id, {});
      const version = await store.persistBatch({
        pageId: created.id,
        expectedVersion: 1,
        draft: created.draft,
        title: "Renamed",
        path: created.path,
        entries: [
          {
            siteId: site.id,
            pageId: created.id,
            batchId: "batch-tx-2",
            opIndex: 0,
            mutation: "updatePageMeta",
            params: { op: "updatePageMeta", title: "Renamed" },
            author: { kind: "human", id: "h", label: "H" },
            undoPatch: [{ patch: "setPageMeta", title: created.title, path: created.path }],
            draftVersionAfter: 0,
          },
        ],
      });
      expect(version).toBe(2);
      const entries = await store.listAudit(created.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.draftVersionAfter).toBe(2);
    } finally {
      await database.close();
    }
  });
});

describe("applyMutations purity", () => {
  it("never mutates its input tree", async () => {
    const database = await createTestDatabase();
    try {
      await ensureSchema(database.db);
      const registry = createTestRegistry();
      const store = new Store(database.db);
      const site = await store.createSite({ name: "Purity Site" });
      const created = await store.createPage(site.id, {});
      const frozen = structuredClone(created.draft);
      const outcome = applyMutations({
        registry,
        tree: created.draft,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: created.draft.rootNodeId },
            node: { type: "block", props: { headline: "New" } },
          },
        ],
        previousTitle: created.title,
        previousPath: created.path,
      });
      expect(created.draft).toEqual(frozen);
      expect(outcome.tree).not.toEqual(frozen);
    } finally {
      await database.close();
    }
  });
});
