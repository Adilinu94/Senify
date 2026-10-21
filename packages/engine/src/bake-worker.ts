// Re-bake worker (E12, slice 1): the durable job instead of the trigger stub.
//
// Content changes enqueue a job (`store.enqueueBakeJob`); this worker claims
// the oldest due job per site (lease + concurrency key), re-bakes the active
// release's build and records the outcome:
//
// - claim: `claimBakeJob` marks the job running, increments `attempts` and sets
//   the lease; a second worker racing for the same job gets no row,
// - crash recovery: an expired lease returns the job to the queue
//   (`expireBakeLeases`), so a killed engine does not lose the re-bake,
// - retry: a failed bake goes back to the queue with exponential backoff until
//   `maxAttempts` is reached — then the job stays `failed` with its error,
// - status: the job list is readable via `GET /api/sites/:siteId/bake-jobs`.
//
// The worker is deliberately small and testable: `runBakeJobOnce` does one
// claim-and-run cycle, `startBakeWorker` is the interval wrapper the engine
// boots with.

import { BAKE_BUILD_TIMEOUT_MS } from "@senify/renderer";
import type { EngineEvents } from "./events.ts";
import type { LifecycleContext } from "./lifecycle.ts";
import { rebakeActiveRelease } from "./lifecycle.ts";
import type { BakeJob } from "./types.ts";

export type BakeWorkerOptions = {
  context: LifecycleContext;
  // Live events (ticket 05): the worker announces the outcome so the program
  // and the editor can show it without polling.
  events?: EngineEvents;
  // How long a claimed job may run before another worker may take it over.
  leaseMs?: number;
  // First retry delay; doubles per attempt (1 s, 2 s, 4 s, …).
  baseBackoffMs?: number;
  now?: () => Date;
};

// The lease of a claimed job: how long another worker has to wait before it
// may take the job over. It exists so that a CRASHED process does not lose
// its work - which means it has to outlive the work itself. The build has a
// hard deadline of three minutes (BAKE_BUILD_TIMEOUT_MS); a lease of one
// minute expired while the build was still running, and a second engine
// could claim the same job (Fachanalyse 3, B3). Five minutes of margin, like
// the image worker.
export const DEFAULT_BAKE_LEASE_MS = BAKE_BUILD_TIMEOUT_MS + 5 * 60_000;
export const DEFAULT_BAKE_BACKOFF_MS = 1_000;

// One claim-and-run cycle. Returns the job it ran (done or failed/queued for a
// retry), or `null` when nothing was due.
export async function runBakeJobOnce(options: BakeWorkerOptions): Promise<BakeJob | null> {
  const now = (options.now?.() ?? new Date()).toISOString();
  await options.context.store.expireBakeLeases(now);
  const job = await options.context.store.claimBakeJob({
    now,
    leaseMs: options.leaseMs ?? DEFAULT_BAKE_LEASE_MS,
  });
  if (job === null) return null;
  try {
    await rebakeActiveRelease(options.context, job.siteId);
    const done = await options.context.store.completeBakeJob(job.id);
    options.events?.publish({
      kind: "bake.done",
      siteId: job.siteId,
      action: job.reason,
    });
    return done;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const backoff =
      (options.baseBackoffMs ?? DEFAULT_BAKE_BACKOFF_MS) *
      2 ** Math.max(0, job.attempts - 1);
    const failed = await options.context.store.failBakeJob({
      id: job.id,
      error: message,
      backoffMs: backoff,
    });
    // A retry stays silent (it is queued again); only the terminal failure is
    // announced.
    if (failed.status === "failed") {
      options.events?.publish({
        kind: "bake.failed",
        siteId: job.siteId,
        action: job.reason,
      });
    }
    return failed;
  }
}

export type BakeWorker = {
  // Runs one cycle immediately (the interval keeps running).
  tick(): Promise<void>;
  stop(): void;
};

// The interval wrapper the engine boots with. It drains a small number of jobs
// per tick and never overlaps with itself.
export function startBakeWorker(options: BakeWorkerOptions & { intervalMs?: number }): BakeWorker {
  let stopped = false;
  let running = false;
  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      for (let index = 0; index < 5; index += 1) {
        const job = await runBakeJobOnce(options);
        if (job === null) break;
      }
    } catch (error) {
      console.error("[engine] bake worker failed", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, options.intervalMs ?? 2_000);
  timer.unref?.();
  void tick();
  return {
    tick,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
