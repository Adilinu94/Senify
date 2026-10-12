import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema } from "@senify/engine";
import { BakeJobsRepository } from "../src/store-bake-jobs.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the re-bake queue lives in `BakeJobsRepository`; `Store` only delegates.

const NOW = "2026-10-11T10:00:00.000Z";
const later = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return new BakeJobsRepository(database.db);
}

describe("BakeJobsRepository", () => {
  it("absorbs a second request for the same site into the queued job", async () => {
    const repo = await fixture();
    const first = await repo.enqueueBakeJob({ siteId: "s1", reason: "page", paths: ["/b"], now: NOW });
    const second = await repo.enqueueBakeJob({ siteId: "s1", reason: "theme", paths: ["/a", "/b"], now: NOW });
    expect(second.id).toBe(first.id);
    expect(second.paths).toEqual(["/a", "/b"]);
    expect(second.reason).toBe("page, theme");
    expect(await repo.listBakeJobs("s1")).toHaveLength(1);
  });

  it("claims one job per site and lets a second worker race to nothing", async () => {
    const repo = await fixture();
    const job = await repo.enqueueBakeJob({ siteId: "s1", reason: "page", now: NOW });
    const claimed = await repo.claimBakeJob({ now: NOW, leaseMs: 60_000 });
    expect(claimed).toMatchObject({ id: job.id, status: "running", attempts: 1 });
    // A new job for the busy site waits behind the running one.
    await repo.enqueueBakeJob({ siteId: "s1", reason: "again", now: NOW });
    expect(await repo.claimBakeJob({ now: NOW, leaseMs: 60_000 })).toBeNull();
    expect((await repo.completeBakeJob(job.id, NOW)).status).toBe("done");
  });

  it("requeues with backoff until the attempts are used up", async () => {
    const repo = await fixture();
    const job = await repo.enqueueBakeJob({ siteId: "s1", reason: "page", maxAttempts: 2, now: NOW });
    await repo.claimBakeJob({ now: NOW, leaseMs: 60_000 });
    const retry = await repo.failBakeJob({ id: job.id, error: "boom", backoffMs: 5_000, now: NOW });
    expect(retry).toMatchObject({ status: "queued", nextAttemptAt: later(5_000), lastError: "boom" });
    expect(await repo.claimBakeJob({ now: NOW, leaseMs: 60_000 })).toBeNull();
    await repo.claimBakeJob({ now: later(5_000), leaseMs: 60_000 });
    const final = await repo.failBakeJob({ id: job.id, error: "boom", backoffMs: 5_000, now: later(5_000) });
    expect(final.status).toBe("failed");
  });

  it("returns an expired lease to the queue", async () => {
    const repo = await fixture();
    const job = await repo.enqueueBakeJob({ siteId: "s1", reason: "page", now: NOW });
    await repo.claimBakeJob({ now: NOW, leaseMs: 1_000 });
    expect(await repo.expireBakeLeases(later(2_000))).toBe(1);
    expect((await repo.getBakeJob(job.id)).status).toBe("queued");
  });

  it("reports unknown jobs as not_found", async () => {
    const repo = await fixture();
    await expect(repo.getBakeJob("missing")).rejects.toBeInstanceOf(SenifyError);
    await expect(repo.completeBakeJob("missing")).rejects.toMatchObject({ category: "not_found" });
    await expect(
      repo.failBakeJob({ id: "missing", error: "x", backoffMs: 0 }),
    ).rejects.toMatchObject({ category: "not_found" });
  });
});
