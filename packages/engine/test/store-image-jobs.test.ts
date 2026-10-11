import { afterEach, describe, expect, it } from "vitest";
import { ensureSchema } from "@senify/engine";
import { ImageJobsRepository } from "../src/store-image-jobs.ts";
import type { ImageJobRequest } from "../src/types.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the image generation queue lives in `ImageJobsRepository`; `Store` only delegates.

const NOW = "2026-10-11T10:00:00.000Z";
const later = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();

const REQUEST: ImageJobRequest = {
  prompt: "a red fox",
  width: 512,
  height: 512,
  steps: 4,
  filename: "fox.png",
  altText: null,
  decorative: true,
  folderId: null,
  tags: [],
  provider: "custom",
};

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return new ImageJobsRepository(database.db);
}

describe("ImageJobsRepository", () => {
  it("claims one job per site and records the provider handle", async () => {
    const repo = await fixture();
    const job = await repo.enqueueImageJob({ siteId: "s1", request: REQUEST, now: NOW });
    await repo.enqueueImageJob({ siteId: "s1", request: REQUEST, now: later(1) });
    const claimed = await repo.claimImageJob({ now: NOW, leaseMs: 60_000 });
    expect(claimed).toMatchObject({ id: job.id, status: "running", attempts: 1 });
    expect(await repo.claimImageJob({ now: NOW, leaseMs: 60_000 })).toBeNull();
    const withProvider = await repo.setImageJobProvider({ id: job.id, providerUsed: "custom", providerJobId: "p-1", now: NOW });
    expect(withProvider).toMatchObject({ providerUsed: "custom", providerJobId: "p-1" });
    const done = await repo.completeImageJob(job.id, { assetId: "a-1", providerUsed: "custom", error: [] }, NOW);
    expect(done).toMatchObject({ status: "succeeded", assetId: "a-1", providerJobId: null });
  });

  it("cancels only queued jobs", async () => {
    const repo = await fixture();
    const queued = await repo.enqueueImageJob({ siteId: "s1", request: REQUEST, now: NOW });
    expect((await repo.cancelImageJob(queued.id, NOW)).status).toBe("canceled");
    const running = await repo.enqueueImageJob({ siteId: "s2", request: REQUEST, now: NOW });
    await repo.claimImageJob({ now: NOW, leaseMs: 60_000 });
    await expect(repo.cancelImageJob(running.id, NOW)).rejects.toMatchObject({ category: "conflict" });
  });

  it("requeues an expired lease and fails it once the attempts are used up", async () => {
    const repo = await fixture();
    const job = await repo.enqueueImageJob({ siteId: "s1", request: REQUEST, maxAttempts: 2, now: NOW });
    await repo.claimImageJob({ now: NOW, leaseMs: 1_000 });
    expect(await repo.expireImageLeases(later(2_000))).toBe(1);
    expect((await repo.getImageJob(job.id)).status).toBe("queued");
    await repo.claimImageJob({ now: later(2_000), leaseMs: 1_000 });
    expect(await repo.expireImageLeases(later(4_000))).toBe(1);
    expect((await repo.getImageJob(job.id)).status).toBe("failed");
  });

  it("keeps the provider history on failure and filters by status", async () => {
    const repo = await fixture();
    const job = await repo.enqueueImageJob({ siteId: "s1", request: REQUEST, now: NOW });
    const attempt = { provider: "custom", kind: "timeout", message: "slow", at: NOW };
    const failed = await repo.failImageJob({ id: job.id, error: [attempt], now: NOW });
    expect(failed).toMatchObject({ status: "failed", error: [attempt] });
    await repo.enqueueImageJob({ siteId: "s1", request: REQUEST, now: NOW });
    expect((await repo.listImageJobs("s1", { status: "failed" })).map((j) => j.id)).toEqual([job.id]);
    expect(await repo.listImageJobs("s1")).toHaveLength(2);
  });

  it("lists only active provider cooldowns and overwrites per provider", async () => {
    const repo = await fixture();
    await repo.setProviderCooldown({ provider: "custom", until: later(1_000), reason: "429", now: NOW });
    await repo.setProviderCooldown({ provider: "custom", until: later(60_000), reason: "503", now: NOW });
    await repo.setProviderCooldown({ provider: "other", until: later(1_000), reason: "429", now: NOW });
    expect(await repo.listProviderCooldowns(later(2_000))).toEqual([
      { provider: "custom", until: later(60_000), reason: "503" },
    ]);
  });

  it("reports unknown jobs as not_found", async () => {
    const repo = await fixture();
    await expect(repo.getImageJob("missing")).rejects.toMatchObject({ category: "not_found" });
    await expect(repo.setImageJobProvider({ id: "missing", providerUsed: "x" })).rejects.toMatchObject({ category: "not_found" });
    await expect(repo.failImageJob({ id: "missing", error: [] })).rejects.toMatchObject({ category: "not_found" });
  });
});
