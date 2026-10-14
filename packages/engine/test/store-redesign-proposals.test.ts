import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import type {
  DirectionCard,
  DirectionDecision,
  OpenMediaNeed,
  RedesignProposalApplyResult,
  RedesignProposalBasis,
} from "../src/redesign-proposal-contract.ts";
import { RedesignProposalsRepository } from "../src/store-redesign-proposals.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: redesign proposals live in `RedesignProposalsRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return { db: database.db, repo: new RedesignProposalsRepository(database.db) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// The repository stores cards, basis and results as JSON and reads only
// `basis.source`; the fixtures carry what the assertions look at.
const cards = [{ id: "dir-1", referenceId: "ref-1" }] as unknown as DirectionCard[];
const basis = (pageId = "p1"): RedesignProposalBasis => ({
  source: { siteId: "s1", pageId, title: "Start", path: "/", draftVersion: 3, themeVersion: 2 },
  references: [{ referenceId: "ref-1", profileRevision: 1, profileHash: "hash-1" }],
});
const decision: DirectionDecision = {
  directionId: "dir-1",
  referenceId: "ref-1",
  offerHash: "offer-1",
  author: { kind: "human", id: "u1", label: "Adi" },
  at: "2026-10-13T10:00:00.000Z",
};
const need = (needId: string, resolved = false): OpenMediaNeed => ({
  needId,
  targetNodeId: "node-1",
  targetPath: "items[0].cover",
  role: "new-visual",
  treatment: "generate",
  reason: "kein Bild vorhanden",
  prompt: null,
  alt: null,
  decorative: false,
  resolvedWith: resolved ? { treatment: "manual", assetId: null } : null,
});
const applyResult = (openMediaNeeds: OpenMediaNeed[]): RedesignProposalApplyResult =>
  ({
    status: "applied",
    scope: "scaffold-theme",
    sectionPlanApplied: false,
    planHash: null,
    openMediaNeeds,
    warnings: ["Hinweis"],
  }) as unknown as RedesignProposalApplyResult;

let nextId = 0;
const create = (
  repo: RedesignProposalsRepository,
  overrides: Partial<{ id: string; sourcePageId: string; ttlMs: number }> = {},
) =>
  repo.createRedesignProposal({
    id: overrides.id ?? `prop-${(nextId += 1)}`,
    sourcePageId: overrides.sourcePageId ?? "p1",
    cards,
    basis: basis(overrides.sourcePageId ?? "p1"),
    ...(overrides.ttlMs === undefined ? {} : { ttlMs: overrides.ttlMs }),
  });

const caught = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

describe("RedesignProposalsRepository", () => {
  it("stores a proposal as proposed with a seven-day deadline and reads it back", async () => {
    const { repo } = await fixture();
    const created = await create(repo, { id: "prop-a" });
    expect(created).toMatchObject({
      id: "prop-a",
      sourcePageId: "p1",
      status: "proposed",
      source: basis().source,
      cards,
      decision: null,
      applyResult: null,
    });
    expect(Date.parse(created.expiresAt ?? "") - Date.parse(created.createdAt)).toBe(7 * DAY_MS);
    expect(await repo.getRedesignProposal("prop-a")).toEqual(created);
    const short = await create(repo, { ttlMs: 60_000 });
    expect(Date.parse(short.expiresAt ?? "") - Date.parse(short.createdAt)).toBe(60_000);
  });

  it("answers an unknown id with not_found on proposalId", async () => {
    const { repo } = await fixture();
    const error = await caught(repo.getRedesignProposal("missing"));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found", field: "proposalId" });
    expect((error as SenifyError).suggestion).toContain("create_redesign_proposal");
  });

  it("lists a page's inbox with open proposals first, then applying, then history", async () => {
    const { db, repo } = await fixture();
    const oldOpen = await create(repo);
    const running = await create(repo);
    const done = await create(repo);
    const newOpen = await create(repo);
    await create(repo, { sourcePageId: "p2" });
    await repo.claimRedesignProposal({ proposalId: running.id, directionId: "dir-1", decision });
    await repo.claimRedesignProposal({ proposalId: done.id, directionId: "dir-1", decision });
    await repo.finalizeRedesignProposal({ proposalId: done.id, status: "applied", applyResult: applyResult([]) });
    for (const [id, at] of [
      [oldOpen.id, "2026-10-01T10:00:00.000Z"],
      [running.id, "2026-10-02T10:00:00.000Z"],
      [done.id, "2026-10-03T10:00:00.000Z"],
      [newOpen.id, "2026-10-04T10:00:00.000Z"],
    ] as const) {
      await db.query(`UPDATE redesign_proposals SET created_at = $2 WHERE id = $1`, [id, at]);
    }
    expect((await repo.listRedesignProposals("p1")).map((p) => p.id)).toEqual([
      newOpen.id,
      oldOpen.id,
      running.id,
      done.id,
    ]);
    expect((await repo.listRedesignProposals("p1", { status: "applied" })).map((p) => p.id)).toEqual([done.id]);
    expect(await repo.listRedesignProposals("p3")).toEqual([]);
  });

  it("sweeps only undecided proposals past their deadline and reports the ids it moved", async () => {
    const { db, repo } = await fixture();
    const overdue = await create(repo, { ttlMs: -1000 });
    const alive = await create(repo);
    const running = await create(repo, { ttlMs: -1000 });
    await repo.claimRedesignProposal({ proposalId: running.id, directionId: "dir-1", decision });
    const undated = await create(repo);
    await db.query(`UPDATE redesign_proposals SET expires_at = NULL WHERE id = $1`, [undated.id]);
    expect(await repo.expireStaleRedesignProposals()).toEqual([overdue.id]);
    const status = async (id: string) => (await db.query<{ status: string }>(
      `SELECT status FROM redesign_proposals WHERE id = $1`,
      [id],
    )).rows[0]?.status;
    expect(await status(overdue.id)).toBe("expired");
    expect(await status(alive.id)).toBe("proposed");
    expect(await status(running.id)).toBe("applying");
    expect(await status(undated.id)).toBe("proposed");
    expect(await repo.expireStaleRedesignProposals()).toEqual([]);
    const farFuture = new Date(Date.now() + 30 * DAY_MS).toISOString();
    expect(await repo.expireStaleRedesignProposals(farFuture)).toEqual([alive.id]);
  });

  it("runs the sweep before a single read and before the inbox list", async () => {
    const { repo } = await fixture();
    const overdue = await create(repo, { ttlMs: -1000 });
    expect((await repo.getRedesignProposal(overdue.id)).status).toBe("expired");
    const listed = await create(repo, { ttlMs: -1000 });
    expect((await repo.listRedesignProposals("p1", { status: "expired" })).map((p) => p.id).sort()).toEqual(
      [overdue.id, listed.id].sort(),
    );
  });

  it("lets exactly one caller claim a proposal and tells the others why they lost", async () => {
    const { repo } = await fixture();
    const created = await create(repo);
    const first = await repo.claimRedesignProposal({ proposalId: created.id, directionId: "dir-1", decision });
    expect(first.state).toBe("claimed");
    expect(first.proposal).toMatchObject({ status: "applying", decision });
    const second = await repo.claimRedesignProposal({ proposalId: created.id, directionId: "dir-1", decision });
    expect(second).toMatchObject({ state: "already_decided", proposal: { status: "applying" } });
    const overdue = await create(repo, { ttlMs: -1000 });
    await repo.expireStaleRedesignProposals();
    expect(await repo.claimRedesignProposal({ proposalId: overdue.id, directionId: "dir-1", decision })).toMatchObject({
      state: "expired",
      proposal: { status: "expired", decision: null },
    });
    const error = await caught(repo.claimRedesignProposal({ proposalId: "missing", directionId: "dir-1", decision }));
    expect(error).toMatchObject({ category: "not_found", field: "proposalId" });
  });

  it("finalizes an applying proposal once and refuses every other state with a conflict", async () => {
    const { repo } = await fixture();
    const created = await create(repo);
    const early = await caught(
      repo.finalizeRedesignProposal({ proposalId: created.id, status: "applied", applyResult: applyResult([]) }),
    );
    expect(early).toBeInstanceOf(SenifyError);
    expect(early).toMatchObject({ category: "conflict", field: "proposalId" });
    await repo.claimRedesignProposal({ proposalId: created.id, directionId: "dir-1", decision });
    const result = applyResult([need("n1")]);
    const finalized = await repo.finalizeRedesignProposal({ proposalId: created.id, status: "failed", applyResult: result });
    expect(finalized).toMatchObject({ status: "failed", applyResult: result });
    const again = await caught(
      repo.finalizeRedesignProposal({ proposalId: created.id, status: "applied", applyResult: applyResult([]) }),
    );
    expect(again).toMatchObject({ category: "conflict", field: "proposalId" });
    expect((await repo.getRedesignProposal(created.id)).status).toBe("failed");
  });

  it("replaces only the open media needs and leaves the rest of the record alone", async () => {
    const { repo } = await fixture();
    const created = await create(repo);
    const noResult = await caught(repo.recordMediaNeedResolutions({ proposalId: created.id, openMediaNeeds: [] }));
    expect(noResult).toMatchObject({ category: "conflict", field: "proposalId" });
    await repo.claimRedesignProposal({ proposalId: created.id, directionId: "dir-1", decision });
    await repo.finalizeRedesignProposal({
      proposalId: created.id,
      status: "applied",
      applyResult: applyResult([need("n1"), need("n2")]),
    });
    const next = [need("n1", true), need("n2")];
    const updated = await repo.recordMediaNeedResolutions({ proposalId: created.id, openMediaNeeds: next });
    expect(updated.applyResult).toEqual({ ...applyResult([]), openMediaNeeds: next });
    expect(updated).toMatchObject({ status: "applied", decision, cards });
    expect(await repo.getRedesignProposal(created.id)).toEqual(updated);
    const missing = await caught(repo.recordMediaNeedResolutions({ proposalId: "missing", openMediaNeeds: [] }));
    expect(missing).toMatchObject({ category: "not_found", field: "proposalId" });
  });

  it("is what Store delegates to: both see the same proposals", async () => {
    const { db, repo } = await fixture();
    const store = new Store(db);
    const viaStore = await store.createRedesignProposal({ id: "prop-s", sourcePageId: "p1", cards, basis: basis() });
    expect(await repo.getRedesignProposal("prop-s")).toEqual(viaStore);
    const claimed = await store.claimRedesignProposal({ proposalId: "prop-s", directionId: "dir-1", decision });
    expect(claimed.state).toBe("claimed");
    expect(await repo.claimRedesignProposal({ proposalId: "prop-s", directionId: "dir-1", decision })).toMatchObject({
      state: "already_decided",
    });
    const finalized = await repo.finalizeRedesignProposal({
      proposalId: "prop-s",
      status: "applied",
      applyResult: applyResult([need("n1")]),
    });
    expect(await store.getRedesignProposal("prop-s")).toEqual(finalized);
    expect(await store.listRedesignProposals("p1")).toEqual(await repo.listRedesignProposals("p1"));
    expect(await store.expireStaleRedesignProposals()).toEqual([]);
    const recorded = await store.recordMediaNeedResolutions({ proposalId: "prop-s", openMediaNeeds: [] });
    expect(await repo.getRedesignProposal("prop-s")).toEqual(recorded);
  });
});
