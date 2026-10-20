import { describe, expect, it } from "vitest";
import { compileRedesign, Store, type Db, type DbClient } from "@senify/engine";
import type { ReferenceToken } from "../src/types.ts";
import {
  createTransactionDatabase,
  createTestRegistry,
  realPostgresAvailable,
} from "./helpers.ts";

// The redesign apply runs as one transaction (ADR-0014). These proofs need a
// real database: the pg-mem test double ignores ROLLBACK, so an atomicity test
// on it would pass without proving anything. A configured PostgreSQL is used
// if there is one; otherwise PGlite - real PostgreSQL compiled to WebAssembly,
// in the process - proves the same thing without a server.

const hasRealPostgres = await realPostgresAvailable();

// A real reference with a real profile.
//
// The three tests below pass `referenceIds` and once passed it EMPTY, which
// `compileRedesign` refuses with "Es wurde keine Referenz angegeben". That was
// not a database problem: the tests are about transaction atomicity, and they
// happened to trip a validation that has nothing to do with it. The fix is a
// reference that exists, not a relaxation of the check - an apply without a
// direction is a real error the guard should keep catching.
//
// The reference goes through the store, not the HTTP route, because the route
// would add an analysis pipeline this suite does not otherwise need.
const PROVENANCE = {
  url: "https://example.invalid/transaction",
  capturedAt: "2026-01-01T00:00:00.000Z",
  hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  method: "manual",
  note: null,
} as const;

function token(value: string, role: string): ReferenceToken {
  return { value, uses: 1, where: ["body"], role, level: "inferred" };
}

async function createReferenceWithProfile(store: Store): Promise<string> {
  const reference = await store.createReference({
    name: "Transaktions-Referenz",
    sourceUrl: "https://example.invalid/transaction",
    method: "manual",
    provenance: { ...PROVENANCE },
  });
  await store.createReferenceProfileRevision({
    referenceId: reference.id,
    profile: {
      tokens: {
        color: [token("#123456", "primary"), token("#ffffff", "surface")],
        type: [
          {
            role: "body",
            size: "16px",
            lineHeight: "1.5",
            weight: 400,
            uses: 1,
            where: ["body"],
            level: "inferred",
          },
        ],
        families: [token("Inter", "body")],
        space: [token("8px", "base")],
        radius: [],
        shadow: [],
      },
      breakpoints: [640, 1024],
      customProperties: [],
      motion: [],
      surfaces: [],
      libraries: [],
      assets: [],
      components: [],
      families: ["body"],
      vocabulary: [],
      rules: { constants: [], never: [] },
      styleBrief: "",
      guardrails: [],
      reduced: false,
    },
    evidence: [],
    provenance: { ...PROVENANCE },
    author: { kind: "human", id: "operator", label: "Operator" },
    note: null,
  });
  return reference.id;
}

describe.skipIf(!hasRealPostgres)("redesign apply transactions (real Postgres)", () => {
  it("writes the duplicate, the pages and the theme together", async () => {
    const database = await createTransactionDatabase();
    try {
      const store = new Store(database.db);
      const site = await store.createSite({ name: "Atomar" });
      await store.createPage(site.id, { title: "Start", path: "/" });
      const referenceId = await createReferenceWithProfile(store);

      const plan = await compileRedesign({
        store,
        registry: createTestRegistry(),
        siteId: site.id,
        referenceIds: [referenceId],
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
    const database = await createTransactionDatabase();
    try {
      const store = new Store(database.db);
      const site = await store.createSite({ name: "Rollback" });
      await store.createPage(site.id, { title: "Start", path: "/" });
      const before = await store.listSiteSlugs();
      const referenceId = await createReferenceWithProfile(store);

      const plan = await compileRedesign({
        store,
        registry: createTestRegistry(),
        siteId: site.id,
        referenceIds: [referenceId],
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
    const database = await createTransactionDatabase();
    try {
      const store = new Store(database.db);
      const site = await store.createSite({ name: "Claim" });
      const page = await store.createPage(site.id, { title: "Start", path: "/" });
      const referenceId = await createReferenceWithProfile(store);
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
        referenceIds: [referenceId],
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
