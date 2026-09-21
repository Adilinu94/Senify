// Image generation worker (S2, ADR-0008): the durable job behind
// `generate_image`. One claim-and-run cycle resolves the provider chain
// (image-use default → ComfyUI fallback), classifies failures, honours the
// provider cooldowns and commits the result through the media pipeline.
//
// - claim: `claimImageJob` marks the job running, increments `attempts` and
//   sets the lease; the lease is at least the job timeout, so a slow local run
//   is never taken over by mistake,
// - crash recovery: an expired lease returns the job to the queue
//   (`expireImageLeases`); a `provider_job_id` resumes the external run
//   instead of submitting a second one,
// - chain: exactly one provider per attempt; the next provider takes over when
//   the failure is a fallback category (quota, unavailable, refusal, timeout
//   after one retry, a failed run). Invalid input fails the job right away,
// - cooldown: a quota failure pauses the provider for `cooldownMinutes`, an
//   availability failure for a short window; the chain then starts at the
//   fallback,
// - success: `createUploadTicket` + `commitUpload` turn the bytes into a
//   normal asset (dedupe, variants, metadata from the request).

import {
  ImageProviderError,
  type ImageGenerationResult,
  type ImageProvider,
} from "./image-provider.ts";
import { createComfyImageProvider } from "./image-comfy.ts";
import { createImageUseProvider } from "./image-use-provider.ts";
import { commitUpload, createUploadTicket, type MediaContext } from "./media.ts";
import type { Store } from "./store.ts";
import type {
  Asset,
  ImageJob,
  ImageJobAttempt,
  ImageProviderName,
  ImageSettings,
} from "./types.ts";

export type ImageWorkerContext = {
  store: Store;
  dataDir: string;
  maxUploadBytes: number;
  // Providers are built from the current settings on every run, so a settings
  // change (or a test double) takes effect without a restart.
  providers: (
    settings: ImageSettings,
  ) => Partial<Record<ImageProviderName, ImageProvider>>;
};

export type ImageWorkerOptions = {
  context: ImageWorkerContext;
  // Overrides the lease derived from the job timeout (tests use a short one).
  leaseMs?: number;
  now?: () => Date;
};

// Availability failures pause only briefly: the operator may have started
// Chrome/ComfyUI a minute later.
export const SHORT_COOLDOWN_MINUTES = 5;

// The providers the engine builds from the settings: image-use (ChatGPT
// subscription) is the default, ComfyUI + Qwen the local fallback.
export function defaultImageProviders(
  settings: ImageSettings,
): Partial<Record<ImageProviderName, ImageProvider>> {
  return {
    "image-use": createImageUseProvider(settings),
    comfyui: createComfyImageProvider(settings),
  };
}

// One provider per attempt; the fallback only starts when it differs from the
// chosen provider and is not "none".
export function providerChain(
  settings: ImageSettings,
  override?: ImageProviderName,
): ImageProviderName[] {
  const primary = override ?? settings.provider;
  const chain: ImageProviderName[] = [];
  if (primary !== "off") chain.push(primary);
  const fallback = settings.fallbackProvider;
  if (fallback !== "none" && fallback !== primary) chain.push(fallback);
  return chain;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function attempt(
  provider: string,
  kind: string,
  message: string,
  at: Date,
  suggestion?: string,
): ImageJobAttempt {
  return {
    provider,
    kind,
    message,
    at: at.toISOString(),
    ...(suggestion === undefined ? {} : { suggestion }),
  };
}

function plusMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

async function commitThroughMedia(
  context: ImageWorkerContext,
  job: ImageJob,
  result: ImageGenerationResult,
): Promise<Asset> {
  const media: MediaContext = {
    store: context.store,
    dataDir: context.dataDir,
    maxUploadBytes: context.maxUploadBytes,
  };
  const request = job.request;
  const { ticket } = await createUploadTicket(media, {
    siteId: job.siteId,
    body: {
      filename: request.filename,
      mime: "image/png",
      byteSize: result.bytes.length,
      ...(request.altText === null ? {} : { altText: request.altText }),
      decorative: request.decorative,
      ...(request.folderId === null ? {} : { folderId: request.folderId }),
      ...(request.tags.length === 0 ? {} : { tags: request.tags }),
    },
  });
  const commit = await commitUpload(media, { ticket, data: result.bytes });
  return commit.asset;
}

// One claim-and-run cycle. Returns the job it ran (done or failed), or `null`
// when nothing was due.
export async function runImageJobOnce(
  options: ImageWorkerOptions,
): Promise<ImageJob | null> {
  const nowDate = options.now?.() ?? new Date();
  const now = nowDate.toISOString();
  const settings = await options.context.store.getImageSettings();
  await options.context.store.expireImageLeases(now);
  const job = await options.context.store.claimImageJob({
    now,
    leaseMs: options.leaseMs ?? (settings.timeoutMinutes + 5) * 60_000,
  });
  if (job === null) return null;
  return runImageJob(options, job, settings, nowDate);
}

async function runImageJob(
  options: ImageWorkerOptions,
  job: ImageJob,
  settings: ImageSettings,
  nowDate: Date,
): Promise<ImageJob> {
  const store = options.context.store;
  const providers = options.context.providers(settings);
  const history: ImageJobAttempt[] = [...job.error];
  const timeoutMs = settings.timeoutMinutes * 60_000;
  const chain = providerChain(settings, job.request.provider);

  if (chain.length === 0) {
    history.push(
      attempt(
        "none",
        "invalid_input",
        "Bildgenerierung ist deaktiviert (provider: off).",
        nowDate,
        "Den Provider in den Einstellungen aktivieren (image.provider).",
      ),
    );
    return store.failImageJob({ id: job.id, error: history });
  }

  // Resume first: the job already handed work to a provider before the crash.
  const providerJobId = job.providerJobId;
  const providerUsed = job.providerUsed as ImageProviderName | null;
  if (providerJobId !== null && providerUsed !== null) {
    const provider = providers[providerUsed];
    if (provider?.resume !== undefined) {
      try {
        const result = await provider.resume(providerJobId, { timeoutMs });
        return await finish(
          options,
          job,
          providerUsed,
          result,
          history,
          nowDate,
        );
      } catch (error) {
        history.push(
          attempt(
            providerUsed,
            error instanceof ImageProviderError ? error.kind : "generation",
            `Resume fehlgeschlagen: ${messageOf(error)}`,
            nowDate,
          ),
        );
      }
    }
  }

  for (const providerName of chain) {
    const provider = providers[providerName];
    if (provider === undefined) {
      history.push(
        attempt(
          providerName,
          "unavailable",
          "Provider ist nicht konfiguriert oder nicht gebaut.",
          nowDate,
        ),
      );
      continue;
    }
    const cooldowns = await store.listProviderCooldowns(nowDate.toISOString());
    const cooldown = cooldowns.find((entry) => entry.provider === providerName);
    if (cooldown !== undefined) {
      history.push(
        attempt(
          providerName,
          "cooldown",
          `Provider pausiert bis ${cooldown.until} (${cooldown.reason}).`,
          nowDate,
        ),
      );
      continue;
    }

    // A timeout gets exactly one retry on the same provider; every other
    // fallback category moves on to the next provider.
    for (let tries = 1; tries <= 2; tries += 1) {
      try {
        await store.setImageJobProvider({
          id: job.id,
          providerUsed: providerName,
          providerJobId: null,
          now: nowDate.toISOString(),
        });
        const result = await provider.generate(job.request, {
          timeoutMs,
          onJobId: async (id) => {
            await store.setImageJobProvider({
              id: job.id,
              providerUsed: providerName,
              providerJobId: id,
              now: new Date().toISOString(),
            });
          },
        });
        return await finish(options, job, providerName, result, history, nowDate);
      } catch (error) {
        if (!(error instanceof ImageProviderError)) {
          history.push(
            attempt(
              providerName,
              "internal",
              messageOf(error),
              nowDate,
              "Engine-Protokoll prüfen; der Auftrag wurde nicht gespeichert.",
            ),
          );
          return store.failImageJob({ id: job.id, error: history });
        }
        history.push(
          attempt(
            providerName,
            error.kind,
            error.message,
            nowDate,
            error.suggestion,
          ),
        );
        if (error.kind === "invalid_input") {
          return store.failImageJob({ id: job.id, error: history });
        }
        if (error.kind === "timeout" && tries === 1) continue;
        if (error.kind === "quota") {
          await store.setProviderCooldown({
            provider: providerName,
            until: plusMinutes(nowDate, settings.cooldownMinutes),
            reason: "Kontingent/Rate-Limit",
            now: nowDate.toISOString(),
          });
        } else if (error.kind === "unavailable") {
          await store.setProviderCooldown({
            provider: providerName,
            until: plusMinutes(nowDate, SHORT_COOLDOWN_MINUTES),
            reason: "nicht verfügbar",
            now: nowDate.toISOString(),
          });
        }
        break;
      }
    }
  }

  // Every provider of the chain is used up.
  return store.failImageJob({ id: job.id, error: history });
}

async function finish(
  options: ImageWorkerOptions,
  job: ImageJob,
  providerName: string,
  result: ImageGenerationResult,
  history: ImageJobAttempt[],
  nowDate: Date,
): Promise<ImageJob> {
  try {
    const asset = await commitThroughMedia(options.context, job, result);
    return await options.context.store.completeImageJob(
      job.id,
      { assetId: asset.id, providerUsed: providerName, error: history },
      nowDate.toISOString(),
    );
  } catch (error) {
    history.push(
      attempt(
        providerName,
        "internal",
        `Ergebnis konnte nicht gespeichert werden: ${messageOf(error)}`,
        nowDate,
      ),
    );
    return options.context.store.failImageJob({ id: job.id, error: history });
  }
}

export type ImageWorker = {
  // Runs one cycle immediately (the interval keeps running).
  tick(): Promise<void>;
  stop(): void;
};

// The interval wrapper the engine boots with. The local fallback runs for
// minutes, so the interval only picks up work; it never overlaps with itself.
export function startImageWorker(
  options: ImageWorkerOptions & { intervalMs?: number },
): ImageWorker {
  let stopped = false;
  let running = false;
  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      for (let index = 0; index < 3; index += 1) {
        const job = await runImageJobOnce(options);
        if (job === null) break;
      }
    } catch (error) {
      console.error("[engine] image worker failed", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, options.intervalMs ?? 3_000);
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
