import { afterEach, describe, expect, it, vi } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import type { ReferenceProfile, ReferenceProvenance } from "../src/types.ts";
import { ReferenceLibraryRepository } from "../src/store-reference-library.ts";
import { ReferencesRepository } from "../src/store-references.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the design references (T14) with their profile revisions, analysis jobs and site
// assignments live in `ReferencesRepository`; `Store` only delegates. The repository gets the
// reference library as a module (it reads the collection of a card), never the `Store`.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  const store = new Store(database.db);
  const library = new ReferenceLibraryRepository(database.db);
  const repo = new ReferencesRepository(database.db, library);
  return { db: database.db, store, library, repo };
}

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

function expectNotFound(error: unknown, field: string) {
  expect(error).toBeInstanceOf(SenifyError);
  expect(error).toMatchObject({ category: "not_found", field });
}

// `createdAt` of two rows made in the same millisecond would tie; the tests that order by
// time pin the clock (only `Date`, so the database driver keeps its timers).
function at(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

const provenance = (url = "https://example.net/"): ReferenceProvenance => ({
  url,
  capturedAt: "2026-10-10T00:00:00.000Z",
  hash: "hash",
  method: "manual",
  note: null,
});

const manual = (name: string, extra: Partial<Parameters<ReferencesRepository["createReference"]>[0]> = {}) => ({
  name,
  sourceUrl: `https://example.net/${name.toLowerCase().replace(/\s+/g, "-")}`,
  method: "manual" as const,
  provenance: provenance(),
  ...extra,
});

function profile(styleBrief = "Ruhig und hell"): ReferenceProfile {
  return {
    tokens: { color: [], type: [], families: [], space: [], radius: [], shadow: [] },
    breakpoints: [],
    customProperties: [],
    motion: [],
    surfaces: [],
    libraries: [],
    assets: [],
    components: [],
    families: [],
    vocabulary: [],
    rules: { constants: [], never: [] },
    styleBrief,
    guardrails: [],
    reduced: false,
  };
}

const author = { kind: "human", id: "tester", label: "Tester" } as const;

describe("ReferencesRepository: create, read and update", () => {
  it("creates a reference with the documented defaults and reads it back", async () => {
    const { repo } = await fixture();
    const created = await repo.createReference(manual("Warm"));
    expect(created).toMatchObject({
      name: "Warm",
      sourceUrl: "https://example.net/warm",
      method: "manual",
      status: "analyzing",
      stage: "governance",
      progress: 0,
      failureReason: null,
      families: [],
      vocabulary: [],
      styleBrief: "",
      snapshots: [],
      origin: "analysis",
      collectionId: null,
      note: null,
      imageRecipe: null,
      heroUsage: null,
      family: null,
      documents: { design: null, guidelines: null, components: null },
      usedInProjects: [],
      collection: null,
    });
    expect(await repo.getReference(created.id)).toEqual(created);
  });

  it("answers an unknown reference with not_found and the field referenceId", async () => {
    const { repo } = await fixture();
    expectNotFound(await rejected(repo.getReference("missing")), "referenceId");
  });

  it("reads the collection of a card from the reference library module", async () => {
    const { library, repo } = await fixture();
    const collection = await library.createReferenceCollection({ name: "Handwerk" });
    const created = await repo.createReference(manual("Warm", { collectionId: collection.id }));
    expect(created.collection).toMatchObject({ id: collection.id, name: "Handwerk" });
    expect(created.collectionId).toBe(collection.id);
  });

  it("stores the library fields and documents verbatim", async () => {
    const { repo } = await fixture();
    const created = await repo.createReference(
      manual("Import", {
        origin: "manual",
        status: "ready",
        stage: "done",
        progress: 100,
        note: "Notiz",
        imageRecipe: "Rezept",
        heroUsage: "Hero",
        documents: { design: "# design", guidelines: null, components: "# c" },
      }),
    );
    expect(created).toMatchObject({
      origin: "manual",
      status: "ready",
      stage: "done",
      progress: 100,
      note: "Notiz",
      imageRecipe: "Rezept",
      heroUsage: "Hero",
      documents: { design: "# design", guidelines: null, components: "# c" },
    });
    expect((await repo.updateReference(created.id, { family: "Serif" })).family).toBe("Serif");
  });

  it("updates only the fields of the patch and clears nullable fields with null", async () => {
    const { repo } = await fixture();
    const created = await repo.createReference(manual("Warm", { note: "alt", heroUsage: "Hero" }));
    const updated = await repo.updateReference(created.id, {
      status: "ready",
      progress: 100,
      families: ["Inter"],
      note: null,
    });
    expect(updated).toMatchObject({
      name: "Warm",
      sourceUrl: created.sourceUrl,
      status: "ready",
      progress: 100,
      families: ["Inter"],
      note: null,
      heroUsage: "Hero",
      stage: "governance",
    });
    const failed = await repo.updateReference(created.id, { failureReason: "boom", name: "Neu" });
    expect(failed).toMatchObject({ failureReason: "boom", name: "Neu", status: "ready" });
    expect((await repo.updateReference(created.id, { failureReason: null })).failureReason).toBeNull();
  });

  it("rejects an update of an unknown reference with not_found", async () => {
    const { repo } = await fixture();
    expectNotFound(await rejected(repo.updateReference("missing", { name: "x" })), "referenceId");
  });
});

describe("ReferencesRepository: lists", () => {
  it("lists newest first by default and by name on request", async () => {
    const { repo } = await fixture();
    at("2026-10-01T00:00:00.000Z");
    await repo.createReference(manual("beta"));
    at("2026-10-02T00:00:00.000Z");
    await repo.createReference(manual("Alpha"));
    at("2026-10-03T00:00:00.000Z");
    await repo.createReference(manual("gamma"));
    expect((await repo.listReferences()).map((card) => card.name)).toEqual(["gamma", "Alpha", "beta"]);
    expect((await repo.listReferences({ sort: "name" })).map((card) => card.name)).toEqual([
      "Alpha",
      "beta",
      "gamma",
    ]);
  });

  it("carries the latest profile revision, the sites that use it and the collection on a card", async () => {
    const { library, repo, store } = await fixture();
    const collection = await library.createReferenceCollection({ name: "Studio" });
    const site = await store.createSite({ name: "Demo" });
    const withProfile = await repo.createReference(manual("Mit Profil", { collectionId: collection.id }));
    const bare = await repo.createReference(manual("Ohne Profil"));
    await repo.createReferenceProfileRevision({
      referenceId: withProfile.id,
      profile: profile(),
      evidence: [],
      provenance: provenance(),
      author,
      note: null,
    });
    await repo.createReferenceProfileRevision({
      referenceId: withProfile.id,
      profile: profile("Zweite Fassung"),
      evidence: [],
      provenance: provenance(),
      author,
      note: null,
    });
    await repo.upsertReferenceAssignment({
      siteId: site.id,
      referenceId: withProfile.id,
      scales: ["color"],
      priority: 1,
    });
    const cards = new Map((await repo.listReferences()).map((card) => [card.id, card]));
    expect(cards.get(withProfile.id)).toMatchObject({
      revision: 2,
      usedInProjects: [site.id],
      collection: { id: collection.id, name: "Studio" },
    });
    expect(cards.get(bare.id)).toMatchObject({ revision: 0, usedInProjects: [], collection: null });
  });

  it("lists the ready reference ids of a collection, oldest first", async () => {
    const { library, repo } = await fixture();
    const collection = await library.createReferenceCollection({ name: "Set" });
    at("2026-10-01T00:00:00.000Z");
    const first = await repo.createReference(manual("Erste", { collectionId: collection.id, status: "ready" }));
    at("2026-10-02T00:00:00.000Z");
    await repo.createReference(manual("Wartet", { collectionId: collection.id }));
    at("2026-10-03T00:00:00.000Z");
    const third = await repo.createReference(manual("Dritte", { collectionId: collection.id, status: "ready" }));
    await repo.createReference(manual("Fremd", { status: "ready" }));
    expect(await repo.listReferenceIdsByCollection(collection.id)).toEqual([first.id, third.id]);
    expect(await repo.listReferenceIdsByCollection("missing")).toEqual([]);
  });
});

describe("ReferencesRepository: search", () => {
  it("returns nothing for blank tokens", async () => {
    const { repo } = await fixture();
    await repo.createReference(manual("Warm"));
    expect(await repo.searchReferences([])).toEqual([]);
    expect(await repo.searchReferences(["  ", ""])).toEqual([]);
  });

  it("weights the name above note and vocabulary above the documents, ties by name", async () => {
    const { repo } = await fixture();
    const byName = await repo.createReference(manual("Leder"));
    const byNote = await repo.createReference(manual("Zwei", { note: "mit Leder" }));
    const byVocabulary = await repo.createReference(manual("Drei"));
    await repo.updateReference(byVocabulary.id, { vocabulary: ["Leder"] });
    const byDocument = await repo.createReference(
      manual("Vier", { documents: { design: "echtes LEDER", guidelines: null, components: null } }),
    );
    await repo.createReference(manual("Fuenf"));
    const hits = await repo.searchReferences(["leder"]);
    expect(hits.map((hit) => [hit.reference.id, hit.weight])).toEqual([
      [byName.id, 4],
      [byVocabulary.id, 2], // "Drei" sorts before "Zwei" at the same weight
      [byNote.id, 2],
      [byDocument.id, 1],
    ]);
    expect(hits[3]?.documents.design).toBe("echtes LEDER");
  });

  it("needs every token to hit and also searches the collection name", async () => {
    const { library, repo } = await fixture();
    const collection = await library.createReferenceCollection({ name: "Bäckerei" });
    const inCollection = await repo.createReference(manual("Warm", { collectionId: collection.id, note: "Brot" }));
    await repo.createReference(manual("Kalt", { note: "Brot" }));
    const hits = await repo.searchReferences(["brot", "bäckerei"]);
    expect(hits.map((hit) => hit.reference.id)).toEqual([inCollection.id]);
    expect(hits[0]?.weight).toBe(4);
  });
});

describe("ReferencesRepository: duplicates", () => {
  it("marks the newer reference as the duplicate by url and by name", async () => {
    const { repo } = await fixture();
    at("2026-10-01T00:00:00.000Z");
    const original = await repo.createReference(manual("Original", { sourceUrl: "https://Example.net/seite/" }));
    at("2026-10-02T00:00:00.000Z");
    const sameUrl = await repo.createReference(manual("Anders", { sourceUrl: "http://example.net/seite" }));
    at("2026-10-03T00:00:00.000Z");
    const sameName = await repo.createReference(manual("  ORIGINAL ", { sourceUrl: "https://other.example/" }));
    at("2026-10-04T00:00:00.000Z");
    await repo.createReference(manual("Einzigartig", { sourceUrl: "https://third.example/" }));
    const duplicates = await repo.findDuplicateReferences();
    expect(
      duplicates.map((entry) => [entry.reference.id, entry.duplicateOf.id, entry.reason]),
    ).toEqual([
      [sameUrl.id, original.id, "sourceUrl"],
      [sameName.id, original.id, "name"],
    ]);
  });
});

describe("ReferencesRepository: delete", () => {
  it("removes the reference with its profiles, jobs and assignments", async () => {
    const { db, repo, store } = await fixture();
    const site = await store.createSite({ name: "Demo" });
    const doomed = await repo.createReference(manual("Weg"));
    const kept = await repo.createReference(manual("Bleibt"));
    for (const reference of [doomed, kept]) {
      await repo.createReferenceProfileRevision({
        referenceId: reference.id,
        profile: profile(),
        evidence: [],
        provenance: provenance(),
        author,
        note: null,
      });
      await repo.createReferenceJob({ referenceId: reference.id, maxAttempts: 3 });
    }
    await repo.upsertReferenceAssignment({ siteId: site.id, referenceId: doomed.id, scales: [], priority: 1 });
    await repo.upsertReferenceAssignment({ siteId: site.id, referenceId: kept.id, scales: [], priority: 2 });
    await repo.deleteReference(doomed.id);
    expectNotFound(await rejected(repo.getReference(doomed.id)), "referenceId");
    for (const table of ["reference_profiles", "reference_jobs", "reference_assignments"]) {
      const rows = await db.query<{ reference_id: string }>(`SELECT reference_id FROM ${table}`);
      expect(rows.rows.map((row) => row.reference_id)).toEqual([kept.id]);
    }
    expect((await repo.getReference(kept.id)).id).toBe(kept.id);
  });

  it("answers an unknown reference with not_found and deletes nothing", async () => {
    const { repo } = await fixture();
    const kept = await repo.createReference(manual("Bleibt"));
    expectNotFound(await rejected(repo.deleteReference("missing")), "referenceId");
    expect((await repo.listReferences()).map((card) => card.id)).toEqual([kept.id]);
  });
});

describe("ReferencesRepository: profile revisions", () => {
  it("numbers the revisions per reference and returns the latest and the full history", async () => {
    const { repo } = await fixture();
    const one = await repo.createReference(manual("Eins"));
    const two = await repo.createReference(manual("Zwei"));
    const revise = (referenceId: string, styleBrief: string) =>
      repo.createReferenceProfileRevision({
        referenceId,
        profile: profile(styleBrief),
        evidence: [{ claim: "belegt", level: "confirmed", source: "test" }],
        provenance: provenance(),
        author,
        note: styleBrief,
      });
    expect(await repo.getLatestReferenceProfile(one.id)).toBeNull();
    const first = await revise(one.id, "v1");
    const second = await revise(one.id, "v2");
    const other = await revise(two.id, "andere");
    expect([first.revision, second.revision, other.revision]).toEqual([1, 2, 1]);
    expect(second).toMatchObject({
      referenceId: one.id,
      author,
      note: "v2",
      evidence: [{ claim: "belegt", level: "confirmed", source: "test" }],
    });
    expect(second.profile.styleBrief).toBe("v2");
    expect((await repo.getLatestReferenceProfile(one.id))?.id).toBe(second.id);
    expect((await repo.listReferenceProfileRevisions(one.id)).map((entry) => entry.revision)).toEqual([2, 1]);
    expect(await repo.listReferenceProfileRevisions("missing")).toEqual([]);
    expect((await repo.getReference(one.id)).revision).toBe(2);
  });

  it("refuses a revision for an unknown reference", async () => {
    const { repo } = await fixture();
    const error = await rejected(
      repo.createReferenceProfileRevision({
        referenceId: "missing",
        profile: profile(),
        evidence: [],
        provenance: provenance(),
        author,
        note: null,
      }),
    );
    expectNotFound(error, "referenceId");
  });
});

describe("ReferencesRepository: analysis jobs", () => {
  it("queues a job with its payload and reads it back", async () => {
    const { repo } = await fixture();
    const reference = await repo.createReference(manual("Warm"));
    const job = await repo.createReferenceJob({
      referenceId: reference.id,
      maxAttempts: 3,
      payload: { snapshot: "fallback" },
    });
    expect(job).toMatchObject({
      referenceId: reference.id,
      status: "queued",
      stage: "queued",
      progress: 0,
      attempts: 0,
      maxAttempts: 3,
      lastError: null,
      finishedAt: null,
    });
    expect(await repo.getReferenceJob(job.id)).toEqual(job);
    expect(await repo.getReferenceJobPayload(job.id)).toEqual({ snapshot: "fallback" });
    const bare = await repo.createReferenceJob({ referenceId: reference.id, maxAttempts: 1 });
    expect(await repo.getReferenceJobPayload(bare.id)).toBeNull();
    const explicitNull = await repo.createReferenceJob({ referenceId: reference.id, maxAttempts: 1, payload: null });
    expect(await repo.getReferenceJobPayload(explicitNull.id)).toBeNull();
    expect(await repo.getReferenceJobPayload("missing")).toBeNull();
  });

  it("answers an unknown job with not_found and the field jobId", async () => {
    const { repo } = await fixture();
    expectNotFound(await rejected(repo.getReferenceJob("missing")), "jobId");
    const error = await rejected(
      repo.updateReferenceJob({
        id: "missing",
        status: "failed",
        stage: "x",
        progress: 0,
        attempts: 1,
        nextAttemptAt: "2026-10-10T00:00:00.000Z",
        lastError: null,
        finishedAt: null,
      }),
    );
    expectNotFound(error, "jobId");
  });

  it("lists only queued jobs that are due, oldest due first, with the limit held to 1..100", async () => {
    const { repo } = await fixture();
    const reference = await repo.createReference(manual("Warm"));
    at("2026-10-01T00:00:00.000Z");
    const early = await repo.createReferenceJob({ referenceId: reference.id, maxAttempts: 3 });
    at("2026-10-02T00:00:00.000Z");
    const late = await repo.createReferenceJob({ referenceId: reference.id, maxAttempts: 3 });
    at("2026-10-03T00:00:00.000Z");
    const future = await repo.createReferenceJob({ referenceId: reference.id, maxAttempts: 3 });
    const running = await repo.createReferenceJob({ referenceId: reference.id, maxAttempts: 3 });
    await repo.updateReferenceJob({
      id: running.id,
      status: "running",
      stage: "capture",
      progress: 10,
      attempts: 1,
      nextAttemptAt: "2026-10-01T00:00:00.000Z",
      lastError: null,
      finishedAt: null,
    });
    const now = "2026-10-02T12:00:00.000Z";
    expect((await repo.listDueReferenceJobs(now)).map((job) => job.id)).toEqual([early.id, late.id]);
    expect((await repo.listDueReferenceJobs(now, 1)).map((job) => job.id)).toEqual([early.id]);
    expect((await repo.listDueReferenceJobs(now, 0)).map((job) => job.id)).toEqual([early.id]);
    expect((await repo.listDueReferenceJobs("2026-10-04T00:00:00.000Z", 500)).map((job) => job.id)).toEqual([
      early.id,
      late.id,
      future.id,
    ]);
  });

  it("changes the state of a job and keeps the payload", async () => {
    const { repo } = await fixture();
    const reference = await repo.createReference(manual("Warm"));
    const job = await repo.createReferenceJob({
      referenceId: reference.id,
      maxAttempts: 3,
      payload: { keep: true },
    });
    const finished = await repo.updateReferenceJob({
      id: job.id,
      status: "failed",
      stage: "capture",
      progress: 40,
      attempts: 3,
      nextAttemptAt: "2026-10-20T00:00:00.000Z",
      lastError: "Zeitüberschreitung",
      finishedAt: "2026-10-12T00:00:00.000Z",
    });
    expect(finished).toMatchObject({
      id: job.id,
      status: "failed",
      stage: "capture",
      progress: 40,
      attempts: 3,
      lastError: "Zeitüberschreitung",
      finishedAt: "2026-10-12T00:00:00.000Z",
    });
    expect(await repo.getReferenceJobPayload(job.id)).toEqual({ keep: true });
  });
});

describe("ReferencesRepository: site assignments", () => {
  it("assigns a reference to a site and updates the same pair instead of duplicating it", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Demo" });
    const reference = await repo.createReference(manual("Warm"));
    const first = await repo.upsertReferenceAssignment({
      siteId: site.id,
      referenceId: reference.id,
      scales: ["color", "type"],
      priority: 2,
    });
    expect(first).toMatchObject({ siteId: site.id, referenceId: reference.id, scales: ["color", "type"], priority: 2 });
    const again = await repo.upsertReferenceAssignment({
      siteId: site.id,
      referenceId: reference.id,
      scales: ["motion"],
      priority: 5,
    });
    expect(again).toMatchObject({ id: first.id, scales: ["motion"], priority: 5 });
    expect(await repo.listReferenceAssignments(site.id)).toEqual([again]);
    expect(await repo.countReferenceAssignments(reference.id)).toBe(1);
  });

  it("refuses an assignment of an unknown reference with not_found", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Demo" });
    const error = await rejected(
      repo.upsertReferenceAssignment({ siteId: site.id, referenceId: "missing", scales: [], priority: 1 }),
    );
    expectNotFound(error, "referenceId");
  });

  it("lists a site's assignments by priority and counts them per reference", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Eins" });
    const other = await store.createSite({ name: "Zwei" });
    const a = await repo.createReference(manual("A"));
    const b = await repo.createReference(manual("B"));
    await repo.upsertReferenceAssignment({ siteId: site.id, referenceId: a.id, scales: [], priority: 2 });
    await repo.upsertReferenceAssignment({ siteId: site.id, referenceId: b.id, scales: [], priority: 1 });
    await repo.upsertReferenceAssignment({ siteId: other.id, referenceId: a.id, scales: [], priority: 1 });
    expect((await repo.listReferenceAssignments(site.id)).map((entry) => entry.referenceId)).toEqual([b.id, a.id]);
    expect(await repo.countReferenceAssignments(a.id)).toBe(2);
    expect(await repo.countReferenceAssignments(b.id)).toBe(1);
    expect(await repo.countReferenceAssignments("missing")).toBe(0);
    expect((await repo.getReference(a.id)).usedInProjects).toEqual([site.id, other.id].sort());
  });

  it("removes an assignment and tells whether there was one", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Demo" });
    const reference = await repo.createReference(manual("Warm"));
    await repo.upsertReferenceAssignment({ siteId: site.id, referenceId: reference.id, scales: [], priority: 1 });
    expect(await repo.deleteReferenceAssignment({ siteId: site.id, referenceId: reference.id })).toBe(true);
    expect(await repo.deleteReferenceAssignment({ siteId: site.id, referenceId: reference.id })).toBe(false);
    expect(await repo.listReferenceAssignments(site.id)).toEqual([]);
  });
});

describe("Store facade", () => {
  it("answers exactly like the repository on the same database", async () => {
    const { repo, store } = await fixture();
    const site = await store.createSite({ name: "Demo" });
    const created = await store.createReference(manual("Warm", { note: "Brot" }));
    await store.createReferenceProfileRevision({
      referenceId: created.id,
      profile: profile(),
      evidence: [],
      provenance: provenance(),
      author,
      note: null,
    });
    const job = await store.createReferenceJob({ referenceId: created.id, maxAttempts: 2, payload: { a: 1 } });
    await store.upsertReferenceAssignment({ siteId: site.id, referenceId: created.id, scales: ["rest"], priority: 1 });
    expect(await store.getReference(created.id)).toEqual(await repo.getReference(created.id));
    expect(await store.listReferences({ sort: "name" })).toEqual(await repo.listReferences({ sort: "name" }));
    expect(await store.searchReferences(["brot"])).toEqual(await repo.searchReferences(["brot"]));
    expect(await store.findDuplicateReferences()).toEqual(await repo.findDuplicateReferences());
    expect(await store.listReferenceProfileRevisions(created.id)).toEqual(
      await repo.listReferenceProfileRevisions(created.id),
    );
    expect(await store.getReferenceJob(job.id)).toEqual(await repo.getReferenceJob(job.id));
    expect(await store.getReferenceJobPayload(job.id)).toEqual({ a: 1 });
    expect(await store.listReferenceAssignments(site.id)).toEqual(await repo.listReferenceAssignments(site.id));
    expect(await store.countReferenceAssignments(created.id)).toBe(1);
  });
});
