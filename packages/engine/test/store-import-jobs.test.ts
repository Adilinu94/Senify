import { afterEach, describe, expect, it, vi } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { ImportJobsRepository, type CreateImportJobInput } from "../src/store-import-jobs.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the import-job queue lives in `ImportJobsRepository`; `Store` only delegates.
// The site existence check is handed in as a function, as in `CollectionsRepository`.
// `commitFramerImportPlan` is a cross-domain transaction and stays on the Store.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  const store = new Store(database.db);
  const site = await store.createSite({ name: "Demo" });
  const getSite = vi.fn((siteId: string) => store.getSite(siteId));
  return { db: database.db, store, site, getSite, repo: new ImportJobsRepository(database.db, getSite) };
}

const input = (siteId: string, extra: Partial<CreateImportJobInput> = {}): CreateImportJobInput => ({
  siteId,
  source: { kind: "url", url: "https://example.com/", rootDir: null, html: null, baseUrl: null },
  pagePath: "/",
  dryRun: false,
  maxAttempts: 3,
  ...extra,
});

const update = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "running" as const,
  stage: "fetch",
  progress: 40,
  attempts: 1,
  nextAttemptAt: "2026-10-14T10:00:00.000Z",
  lastError: null,
  finishedAt: null,
  ...extra,
});

const caught = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

describe("ImportJobsRepository", () => {
  it("queues a job after checking the site and reads it back unchanged", async () => {
    const { site, getSite, repo } = await fixture();
    const created = await repo.createImportJob(input(site.id, { dryRun: true, pagePath: "/start" }));
    expect(getSite).toHaveBeenCalledWith(site.id);
    expect(created).toMatchObject({
      siteId: site.id,
      sourceKind: "url",
      sourceUrl: "https://example.com/",
      pagePath: "/start",
      dryRun: true,
      status: "queued",
      stage: "queued",
      progress: 0,
      attempts: 0,
      maxAttempts: 3,
      lastError: null,
      finishedAt: null,
    });
    expect(created.nextAttemptAt).toBe(created.createdAt);
    expect(await repo.getImportJob(created.id)).toEqual(created);
  });

  it("refuses a job for an unknown site and writes nothing", async () => {
    const { db, repo } = await fixture();
    const error = await caught(repo.createImportJob(input("missing")));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found" });
    expect((await db.query(`SELECT id FROM import_jobs`)).rows).toHaveLength(0);
  });

  it("answers an unknown job id with not_found on jobId", async () => {
    const { repo } = await fixture();
    const error = await caught(repo.getImportJob("missing"));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found", field: "jobId" });
  });

  it("keeps the request payload for a retry and reports none when there is none", async () => {
    const { site, repo } = await fixture();
    const payload = { source: { kind: "url", url: "https://example.com/" }, options: { depth: 1 } };
    const withPayload = await repo.createImportJob(input(site.id, { payload }));
    const without = await repo.createImportJob(input(site.id));
    const explicitNull = await repo.createImportJob(input(site.id, { payload: null }));
    expect(await repo.getImportJobPayload(withPayload.id)).toEqual(payload);
    expect(await repo.getImportJobPayload(without.id)).toBeNull();
    expect(await repo.getImportJobPayload(explicitNull.id)).toBeNull();
    expect(await repo.getImportJobPayload("missing")).toBeNull();
  });

  it("lists only queued jobs that are due, earliest attempt first, with a limit of 1..100", async () => {
    const { site, repo } = await fixture();
    const late = await repo.createImportJob(input(site.id));
    const early = await repo.createImportJob(input(site.id));
    const future = await repo.createImportJob(input(site.id));
    const running = await repo.createImportJob(input(site.id));
    const queued = (id: string, nextAttemptAt: string) =>
      update(id, { status: "queued", stage: "queued", progress: 0, attempts: 0, nextAttemptAt });
    await repo.updateImportJob(queued(late.id, "2026-10-14T09:00:00.000Z"));
    await repo.updateImportJob(queued(early.id, "2026-10-14T08:00:00.000Z"));
    await repo.updateImportJob(queued(future.id, "2026-10-14T12:00:00.000Z"));
    await repo.updateImportJob(update(running.id, { nextAttemptAt: "2026-10-14T07:00:00.000Z" }));
    const now = "2026-10-14T10:00:00.000Z";
    expect((await repo.listDueImportJobs(now)).map((job) => job.id)).toEqual([early.id, late.id]);
    expect((await repo.listDueImportJobs(now, 0)).map((job) => job.id)).toEqual([early.id]);
    expect(await repo.listDueImportJobs("2026-10-01T00:00:00.000Z")).toEqual([]);
    for (let i = 0; i < 100; i += 1) await repo.createImportJob(input(site.id));
    expect(await repo.listDueImportJobs("2099-01-01T00:00:00.000Z", 10_000)).toHaveLength(100);
  });

  it("lists one site's jobs newest first with a limit of 1..100 and checks the site", async () => {
    const { db, store, site, getSite, repo } = await fixture();
    const other = await store.createSite({ name: "Other" });
    const older = await repo.createImportJob(input(site.id));
    const newer = await repo.createImportJob(input(site.id));
    await repo.createImportJob(input(other.id));
    await db.query(`UPDATE import_jobs SET created_at = $2 WHERE id = $1`, [older.id, "2026-10-01T10:00:00.000Z"]);
    await db.query(`UPDATE import_jobs SET created_at = $2 WHERE id = $1`, [newer.id, "2026-10-02T10:00:00.000Z"]);
    getSite.mockClear();
    expect((await repo.listImportJobsForSite(site.id)).map((job) => job.id)).toEqual([newer.id, older.id]);
    expect(getSite).toHaveBeenCalledWith(site.id);
    expect((await repo.listImportJobsForSite(site.id, 0)).map((job) => job.id)).toEqual([newer.id]);
    expect(await caught(repo.listImportJobsForSite("missing"))).toMatchObject({ category: "not_found" });
  });

  it("moves a job through its states and refuses an unknown id", async () => {
    const { site, repo } = await fixture();
    const created = await repo.createImportJob(input(site.id));
    const running = await repo.updateImportJob(update(created.id));
    expect(running).toMatchObject({ status: "running", stage: "fetch", progress: 40, attempts: 1, lastError: null });
    expect(Date.parse(running.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
    const failed = await repo.updateImportJob(
      update(created.id, { status: "failed", stage: "fetch", attempts: 3, lastError: "timeout", finishedAt: "2026-10-14T10:05:00.000Z" }),
    );
    expect(failed).toMatchObject({ status: "failed", lastError: "timeout", finishedAt: "2026-10-14T10:05:00.000Z" });
    expect(await repo.getImportJob(created.id)).toEqual(failed);
    expect(await caught(repo.updateImportJob(update("missing")))).toMatchObject({ category: "not_found", field: "jobId" });
  });

  it("stores the report of a finished run and reports none before that", async () => {
    const { site, repo } = await fixture();
    const created = await repo.createImportJob(input(site.id));
    expect(await repo.getImportJobResult(created.id)).toBeNull();
    expect(await repo.getImportJobResult("missing")).toBeNull();
    await repo.setImportJobResult(created.id, { pages: 1, warnings: ["x"] });
    expect(await repo.getImportJobResult(created.id)).toEqual({ pages: 1, warnings: ["x"] });
    await repo.setImportJobResult(created.id, { pages: 2 });
    expect(await repo.getImportJobResult(created.id)).toEqual({ pages: 2 });
    await expect(repo.setImportJobResult("missing", { pages: 3 })).resolves.toBeUndefined();
  });

  it("is what Store delegates to: both see the same jobs", async () => {
    const { store, site, repo } = await fixture();
    const viaStore = await store.createImportJob(input(site.id, { payload: { a: 1 } }));
    expect(await repo.getImportJob(viaStore.id)).toEqual(viaStore);
    expect(await store.getImportJobPayload(viaStore.id)).toEqual(await repo.getImportJobPayload(viaStore.id));
    const viaRepo = await repo.createImportJob(input(site.id));
    expect(await store.getImportJob(viaRepo.id)).toEqual(viaRepo);
    const updated = await store.updateImportJob(update(viaRepo.id));
    expect(await repo.getImportJob(viaRepo.id)).toEqual(updated);
    await store.setImportJobResult(viaRepo.id, { ok: true });
    expect(await repo.getImportJobResult(viaRepo.id)).toEqual(await store.getImportJobResult(viaRepo.id));
    expect(await store.listImportJobsForSite(site.id)).toEqual(await repo.listImportJobsForSite(site.id));
    const now = "2099-01-01T00:00:00.000Z";
    expect(await store.listDueImportJobs(now)).toEqual(await repo.listDueImportJobs(now));
  });
});
