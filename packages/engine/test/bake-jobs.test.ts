import { describe, expect, it } from "vitest";
import { runBakeJobOnce } from "@senify/engine";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  type BootEnv,
  type PageResponse,
} from "./helpers.ts";

// E12 slice 1: the re-bake is a durable job, not a stub. These tests pin the
// outbox semantics (dedup, lease, backoff, crash recovery) and one real worker
// run that refreshes the active release's build.

const NOW = "2026-09-20T10:00:00.000Z";

async function withEngine(run: (env: BootEnv) => Promise<void>): Promise<void> {
  const env = await bootEngine();
  try {
    await run(env);
  } finally {
    await env.close();
  }
}

async function loadPage(env: BootEnv, pageId: string): Promise<PageResponse> {
  const response = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${pageId}`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

describe("bake job outbox (store)", () => {
  it("enqueues a queued job with the affected paths", async () => {
    await withEngine(async (env) => {
      const job = await env.engine.store.enqueueBakeJob({
        siteId: "site-1",
        reason: "entry.published:e1",
        paths: ["/blog/a", "/blog"],
      });
      expect(job.status).toBe("queued");
      expect(job.attempts).toBe(0);
      expect(job.paths).toEqual(["/blog", "/blog/a"]);
      expect(job.lastError).toBeNull();
    });
  });

  it("dedupes a second request into the queued job (paths merged, reason appended)", async () => {
    await withEngine(async (env) => {
      const first = await env.engine.store.enqueueBakeJob({
        siteId: "site-1",
        reason: "entry.published:e1",
        paths: ["/blog/a"],
      });
      const second = await env.engine.store.enqueueBakeJob({
        siteId: "site-1",
        reason: "entry.published:e2",
        paths: ["/blog/b", "/blog/a"],
      });
      expect(second.id).toBe(first.id);
      expect(second.paths).toEqual(["/blog/a", "/blog/b"]);
      expect(second.reason).toContain("entry.published:e1");
      expect(second.reason).toContain("entry.published:e2");
      const jobs = await env.engine.store.listBakeJobs("site-1");
      expect(jobs).toHaveLength(1);
    });
  });

  it("claims the due job with a lease and keeps other sites apart", async () => {
    await withEngine(async (env) => {
      // Half a second apart: with identical due times the tie-break is the
      // random job id, and the test would not be deterministic.
      await env.engine.store.enqueueBakeJob({ siteId: "site-1", reason: "a", paths: [], now: NOW });
      await env.engine.store.enqueueBakeJob({
        siteId: "site-2",
        reason: "b",
        paths: [],
        now: "2026-09-20T10:00:00.500Z",
      });
      const claimed = await env.engine.store.claimBakeJob({ now: NOW, leaseMs: 60_000 });
      expect(claimed?.siteId).toBe("site-1");
      expect(claimed?.status).toBe("running");
      expect(claimed?.attempts).toBe(1);
      expect(claimed?.leaseUntil).not.toBeNull();
      // The same site is busy: the second site's job is the only candidate.
      const second = await env.engine.store.claimBakeJob({
        now: "2026-09-20T10:00:00.600Z",
        leaseMs: 60_000,
      });
      expect(second?.siteId).toBe("site-2");
      const third = await env.engine.store.claimBakeJob({
        now: "2026-09-20T10:00:00.700Z",
        leaseMs: 60_000,
      });
      expect(third).toBeNull();
    });
  });

  it("completes a job and records the finish", async () => {
    await withEngine(async (env) => {
      const job = await env.engine.store.enqueueBakeJob({
        siteId: "site-1",
        reason: "a",
        paths: [],
        now: NOW,
      });
      const claimed = await env.engine.store.claimBakeJob({ now: NOW, leaseMs: 60_000 });
      expect(claimed?.id).toBe(job.id);
      const done = await env.engine.store.completeBakeJob(job.id);
      expect(done.status).toBe("done");
      expect(done.finishedAt).not.toBeNull();
      expect(done.leaseUntil).toBeNull();
    });
  });

  it("retries a failed attempt with backoff and ends failed when exhausted", async () => {
    await withEngine(async (env) => {
      const job = await env.engine.store.enqueueBakeJob({
        siteId: "site-1",
        reason: "a",
        paths: [],
        maxAttempts: 2,
        now: NOW,
      });
      await env.engine.store.claimBakeJob({ now: NOW, leaseMs: 60_000 });
      const retried = await env.engine.store.failBakeJob({
        id: job.id,
        error: "bake exploded",
        backoffMs: 5_000,
        now: NOW,
      });
      expect(retried.status).toBe("queued");
      expect(retried.attempts).toBe(1);
      expect(retried.lastError).toBe("bake exploded");
      // Not due before the backoff elapsed.
      const tooEarly = await env.engine.store.claimBakeJob({
        now: "2026-09-20T10:00:01.000Z",
        leaseMs: 60_000,
      });
      expect(tooEarly).toBeNull();
      // Due after it.
      const claimed = await env.engine.store.claimBakeJob({
        now: "2026-09-20T10:00:06.000Z",
        leaseMs: 60_000,
      });
      expect(claimed?.attempts).toBe(2);
      const failed = await env.engine.store.failBakeJob({
        id: job.id,
        error: "still broken",
        backoffMs: 5_000,
        now: "2026-09-20T10:00:06.000Z",
      });
      expect(failed.status).toBe("failed");
      expect(failed.finishedAt).not.toBeNull();
      expect(failed.attempts).toBe(2);
    });
  });

  it("returns an expired lease to the queue (crash recovery)", async () => {
    await withEngine(async (env) => {
      const job = await env.engine.store.enqueueBakeJob({
        siteId: "site-1",
        reason: "a",
        paths: [],
        now: NOW,
      });
      await env.engine.store.claimBakeJob({ now: NOW, leaseMs: 1_000 });
      const recovered = await env.engine.store.expireBakeLeases(
        "2026-09-20T10:00:02.000Z",
      );
      expect(recovered).toBe(1);
      const again = await env.engine.store.claimBakeJob({
        now: "2026-09-20T10:00:03.000Z",
        leaseMs: 1_000,
      });
      expect(again?.id).toBe(job.id);
      expect(again?.attempts).toBe(2);
    });
  });

  it("lists the newest job first", async () => {
    await withEngine(async (env) => {
      const first = await env.engine.store.enqueueBakeJob({
        siteId: "site-1",
        reason: "first",
        paths: [],
      });
      await env.engine.store.completeBakeJob(first.id);
      const second = await env.engine.store.enqueueBakeJob({
        siteId: "site-1",
        reason: "second",
        paths: [],
      });
      const jobs = await env.engine.store.listBakeJobs("site-1");
      expect(jobs.map((job) => job.id)).toContain(first.id);
      expect(jobs.map((job) => job.id)).toContain(second.id);
    });
  });
});

describe("bake worker (integration)", () => {
  it("refreshes the active release's build and marks the job done", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Rebake-Site");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      const inserted = await applyMutationsRequest(env.api, await loadPage(env, page.id), [
        {
          op: "insertNode",
          parent: { nodeId: page.draft.rootNodeId },
          node: { id: "hero-1", type: "hero", props: { headline: "Erste Fassung" } },
        },
      ]);
      expect(inserted.status).toBe(200);
      const published = await env.api.request<{ release: { id: string; buildRef: string } }>({
        method: "POST",
        path: `/api/sites/${site.id}/releases`,
        body: { author: { kind: "human", id: "tester", label: "Tester" } },
      });
      expect(published.status).toBe(201);
      const releaseId = published.body.release.id;
      const first = await (
        await fetch(`${env.server.origin}/api/releases/${releaseId}/files/index.html`)
      ).text();
      expect(first).toContain("Erste Fassung");

      // Change the draft after the release: the published page is stale.
      const updated = await applyMutationsRequest(env.api, await loadPage(env, page.id), [
        { op: "updateNodeProps", id: "hero-1", patch: { headline: "Zweite Fassung" } },
      ]);
      expect(updated.status).toBe(200);
      const job = await env.engine.store.enqueueBakeJob({
        siteId: site.id,
        reason: "entry.published:demo",
        paths: ["/"],
      });
      const ran = await runBakeJobOnce({
        context: {
          store: env.engine.store,
          dataDir: env.engine.dataDir,
          formSigner: env.engine.formSigner,
        },
      });
      expect(ran?.id).toBe(job.id);
      expect(ran?.status).toBe("done");
      const refreshed = await (
        await fetch(`${env.server.origin}/api/releases/${releaseId}/files/index.html`)
      ).text();
      expect(refreshed).toContain("Zweite Fassung");

      // The job is visible with its status through the route.
      const listed = await env.api.request<{ jobs: { id: string; status: string }[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/bake-jobs`,
      });
      expect(listed.status).toBe(200);
      expect(listed.body.jobs[0]?.id).toBe(job.id);
      expect(listed.body.jobs[0]?.status).toBe("done");
    } finally {
      await env.close();
    }
  }, 120000);
});
