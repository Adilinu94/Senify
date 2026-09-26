import { describe, expect, it } from "vitest";
import { compileRedesign, Store, type Db, type DbClient } from "@senify/engine";
import { createTestDatabase, createTestRegistry } from "./helpers.ts";

// The redesign apply runs as one transaction (ADR-0014). These proofs need a
// real database: the pg-mem test double ignores ROLLBACK, so an atomicity test
// on it would pass without proving anything.

const hasRealPostgres = (process.env.TEST_DATABASE_URL ?? "").length > 0;

describe.skipIf(!hasRealPostgres)("redesign apply transactions (real Postgres)", () => {
  it("writes the duplicate, the pages and the theme together", async () => {
    const database = await createTestDatabase();
    try {
      const store = new Store(database.db);
      const site = await store.createSite({ name: "Atomar" });
      await store.createPage(site.id, { title: "Start", path: "/" });

      const plan = await compileRedesign({
        store,
        registry: createTestRegistry(),
        siteId: site.id,
        referenceIds: [],
        withContent: true,
        author: { kind: "human", id: "operator", label: "Operator" },
      });
      const sourceTheme = await store.getTheme(site.id);
      await store.applyRedesignPlan(plan, {
        now: new Date().toISOString(),
        author: { kind: "human", id: "operator", label: "Operator" },
        sourceSite: await store.getSite(site.id),
        themeDefinition: sourceTheme.theme,
        proposalClaim: null,
        proposalFinalize: null,
      });

      // Everything the plan prepared is present after one commit.
      const target = await store.getSite(plan.targetSite.id);
      expect(target.id).toBe(plan.targetSite.id);
      const pages = await store.listPageDrafts(target.id);
      expect(pages.length).toBeGreaterThan(0);
      const theme = await store.getTheme(target.id);
      expect(theme.id).toBe(plan.themeId);
    } finally {
      await database.close();
    }
  });

  it("writes nothing at all when the middle of the run fails", async () => {
    const database = await createTestDatabase();
    try {
      const store = new Store(database.db);
      const site = await store.createSite({ name: "Rollback" });
      await store.createPage(site.id, { title: "Start", path: "/" });
      const before = await store.listSiteSlugs();

      const plan = await compileRedesign({
        store,
        registry: createTestRegistry(),
        siteId: site.id,
        referenceIds: [],
        withContent: true,
        author: { kind: "human", id: "operator", label: "Operator" },
      });
      const sourceTheme = await store.getTheme(site.id);
      const sourceSite = await store.getSite(site.id);

      // A sabotaged client fails on the second page write, so the site and the
      // theme insert before it have to disappear again.
      const sabotaged: Db = {
        query: (text, params) => database.db.query(text, params),
        withTransaction: (task) =>
          database.db.withTransaction((tx) => {
            const guarded: DbClient = {
              query: (text, params) => {
                if (text.includes("UPDATE pages SET draft")) {
                  throw new Error("Simulated page write failure");
                }
                return tx.query(text, params);
              },
            };
            return task(guarded);
          }),
      };
      const txStore = new Store(sabotaged);
      await expect(
        txStore.applyRedesignPlan(plan, {
          now: new Date().toISOString(),
          author: { kind: "human", id: "operator", label: "Operator" },
          sourceSite,
          themeDefinition: sourceTheme.theme,
          proposalClaim: null,
          proposalFinalize: null,
        }),
      ).rejects.toThrow();

      // The duplicate is gone entirely: no site, no pages, no theme.
      const after = await store.listSiteSlugs();
      expect(after).toEqual(before);
      await expect(store.getSite(plan.targetSite.id)).rejects.toThrow();
      const rows = await database.db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM sites WHERE id = $1",
        [plan.targetSite.id],
      );
      expect(rows.rows[0]?.count).toBe(0);
    } finally {
      await database.close();
    }
  });

  it("leaves a proposal confirmable when the run fails", async () => {
    const database = await createTestDatabase();
    try {
      const store = new Store(database.db);
      const site = await store.createSite({ name: "Claim" });
      const page = await store.createPage(site.id, { title: "Start", path: "/" });
      const proposalId = "proposal-rollback";
      await store.createRedesignProposal({
        id: proposalId,
        sourcePageId: page.id,
        cards: [],
        basis: {
          source: {
            siteId: site.id,
            pageId: page.id,
            title: page.title,
            path: page.path,
            draftVersion: page.draftVersion,
            themeVersion: 1,
          },
          references: [],
        },
      });

      const plan = await compileRedesign({
        store,
        registry: createTestRegistry(),
        siteId: site.id,
        referenceIds: [],
        withContent: true,
        author: { kind: "human", id: "operator", label: "Operator" },
      });
      const sourceTheme = await store.getTheme(site.id);
      const sabotaged: Db = {
        query: (text, params) => database.db.query(text, params),
        withTransaction: (task) =>
          database.db.withTransaction((tx) => {
            const guarded: DbClient = {
              query: (text, params) => {
                if (text.includes("UPDATE pages SET draft")) {
                  throw new Error("Simulated page write failure");
                }
                return tx.query(text, params);
              },
            };
            return task(guarded);
          }),
      };
      await expect(
        new Store(sabotaged).applyRedesignPlan(plan, {
          now: new Date().toISOString(),
          author: { kind: "human", id: "operator", label: "Operator" },
          sourceSite: await store.getSite(site.id),
          themeDefinition: sourceTheme.theme,
          proposalClaim: {
            proposalId,
            directionId: "dir",
            decision: { directionId: "dir", at: new Date().toISOString() },
          },
          proposalFinalize: {
            proposalId,
            applyResult: { status: "applied", scope: "scaffold-theme" },
          },
        }),
      ).rejects.toThrow();

      // The claim rolled back with the effects: the proposal is still open, so
      // the human can confirm again instead of facing a stuck `applying`.
      const row = await database.db.query<{ status: string; decision: unknown }>(
        "SELECT status, decision FROM redesign_proposals WHERE id = $1",
        [proposalId],
      );
      expect(row.rows[0]?.status).toBe("proposed");
      expect(row.rows[0]?.decision ?? null).toBeNull();
    } finally {
      await database.close();
    }
  }, 120000);
});
