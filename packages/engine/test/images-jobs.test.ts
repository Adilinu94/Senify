import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  ImageProviderError,
  buildImagePrompt,
  runImageJobOnce,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ImageProvider,
  type ImageJob,
  type ImageWorkerContext,
} from "@senify/engine";
import { bootEngine, createTestSite, type BootEnv } from "./helpers.ts";

// Prüfstelle 1: image jobs S2 — the durable job, the provider chain (with
// cooldowns), crash resume and the HTTP routes. Providers are stubs, so no
// test talks to a real ComfyUI or a subscription.

async function pngBytes(width = 512, height = 512): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 30, b: 30, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

type StubBehavior = () => Promise<ImageGenerationResult>;

class StubProvider implements ImageProvider {
  readonly name: string;
  readonly generateCalls: ImageGenerationRequest[] = [];
  readonly resumeCalls: string[] = [];
  #behavior: StubBehavior;
  #resumeBehavior: ((providerJobId: string) => Promise<ImageGenerationResult>) | undefined;

  constructor(
    name: string,
    behavior: StubBehavior,
    resumeBehavior?: (providerJobId: string) => Promise<ImageGenerationResult>,
  ) {
    this.name = name;
    this.#behavior = behavior;
    this.#resumeBehavior = resumeBehavior;
  }

  async health(): Promise<{ ok: boolean; built: boolean }> {
    return { ok: true, built: true };
  }

  async generate(
    req: ImageGenerationRequest,
    opts: { timeoutMs: number; onJobId?: (id: string) => void | Promise<void> },
  ): Promise<ImageGenerationResult> {
    this.generateCalls.push(req);
    await opts.onJobId?.(`${this.name}-lauf-1`);
    return this.#behavior();
  }

  async resume(providerJobId: string): Promise<ImageGenerationResult> {
    this.resumeCalls.push(providerJobId);
    if (this.#resumeBehavior === undefined) {
      throw new ImageProviderError(this.name, "generation", "kein Resume möglich");
    }
    return this.#resumeBehavior(providerJobId);
  }
}

function okProvider(name: string, bytes: Buffer, width = 512, height = 512): StubProvider {
  return new StubProvider(name, async () => ({
    bytes,
    mime: "image/png" as const,
    width,
    height,
    seed: 7,
  }));
}

function failingProvider(name: string, kind: ImageProviderError["kind"], message: string): StubProvider {
  return new StubProvider(name, async () => {
    throw new ImageProviderError(name, kind, message);
  });
}

function workerContext(
  env: BootEnv,
  providers: Partial<Record<"image-use" | "comfyui", ImageProvider>>,
): ImageWorkerContext {
  return {
    store: env.engine.store,
    dataDir: env.engine.dataDir,
    maxUploadBytes: env.engine.maxUploadBytes,
    providers: () => providers,
  };
}

async function withEngine(run: (env: BootEnv) => Promise<void>): Promise<void> {
  const env = await bootEngine();
  try {
    await run(env);
  } finally {
    await env.close();
  }
}

async function createJob(
  env: BootEnv,
  siteId: string,
  body: Record<string, unknown> = {},
): Promise<{ jobId: string; status: string; provider: string }> {
  const response = await env.api.request<{ jobId: string; status: string; provider: string }>({
    method: "POST",
    path: `/api/sites/${siteId}/images/jobs`,
    body: { prompt: "a teapot", width: 512, height: 512, steps: 5, ...body },
  });
  expect(response.status).toBe(202);
  return response.body;
}

describe("image jobs: lifecycle", () => {
  it("runs a job through a stub provider and commits the asset", async () => {
    await withEngine(async (env) => {
      const site = await createTestSite(env.api);
      const created = await createJob(env, site.id, {
        altText: "Rote Teekanne",
        tags: ["hero"],
      });
      expect(created.status).toBe("queued");
      expect(created.provider).toBe("image-use");

      const provider = okProvider("image-use", await pngBytes());
      const job = await runImageJobOnce({ context: workerContext(env, { "image-use": provider }) });
      expect(job?.status).toBe("succeeded");
      expect(job?.providerUsed).toBe("image-use");
      expect(job?.assetId).toBeTruthy();
      expect(provider.generateCalls).toHaveLength(1);
      expect(provider.generateCalls[0]?.width).toBe(512);

      const assets = await env.api.request<{ assets: { id: string; altText: string | null; tags: string[] }[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/assets`,
      });
      const asset = assets.body.assets.find((entry) => entry.id === job?.assetId);
      expect(asset?.altText).toBe("Rote Teekanne");
      expect(asset?.tags).toContain("hero");

      const status = await env.api.request<ImageJob>({
        method: "GET",
        path: `/api/images/jobs/${created.jobId}`,
      });
      expect(status.body.status).toBe("succeeded");
      expect(status.body.assetId).toBe(job?.assetId);
    });
  });

  it("lists jobs with a status filter and cancels only queued ones", async () => {
    await withEngine(async (env) => {
      const site = await createTestSite(env.api);
      const first = await createJob(env, site.id);
      await createJob(env, site.id, { prompt: "zweites Motiv" });

      const queued = await env.api.request<{ jobs: ImageJob[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/images/jobs?status=queued`,
      });
      expect(queued.body.jobs).toHaveLength(2);

      const canceled = await env.api.request<ImageJob>({
        method: "DELETE",
        path: `/api/images/jobs/${first.jobId}`,
      });
      expect(canceled.body.status).toBe("canceled");

      // A running job cannot be canceled through this route.
      const claimed = await env.engine.store.claimImageJob({
        now: new Date().toISOString(),
        leaseMs: 60_000,
      });
      expect(claimed?.id).toBeTruthy();
      const conflict = await env.api.request({
        method: "DELETE",
        path: `/api/images/jobs/${claimed?.id ?? ""}`,
      });
      expect(conflict.status).toBe(409);

      const unknown = await env.api.request({
        method: "GET",
        path: "/api/images/jobs/gibt-es-nicht",
      });
      expect(unknown.status).toBe(404);
    });
  });

  it("rejects a job when the provider is off", async () => {
    await withEngine(async (env) => {
      const site = await createTestSite(env.api);
      await env.api.request({
        method: "PUT",
        path: "/api/settings",
        body: { image: { provider: "off" } },
      });
      const response = await env.api.request({
        method: "POST",
        path: `/api/sites/${site.id}/images/jobs`,
        body: { prompt: "a teapot" },
      });
      expect(response.status).toBe(400);
    });
  });

  it("takes the prompt from the reference recipe (I10)", async () => {
    await withEngine(async (env) => {
      const site = await createTestSite(env.api);
      const reference = await env.engine.store.createReference({
        name: "Teekannen-Referenz",
        sourceUrl: "https://example.com/teekanne",
        method: "manual",
        provenance: {
          url: "https://example.com/teekanne",
          capturedAt: new Date().toISOString(),
          hash: "test-hash-recipe",
          method: "manual",
          note: null,
        },
        status: "ready",
        imageRecipe:
          "editorial photograph of a red ceramic teapot on a worn wooden table, soft morning light",
        heroUsage: "centered hero image with generous whitespace",
      });

      // No prompt at all: the route builds it from the stored recipe.
      const response = await env.api.request<{
        jobId: string;
        status: string;
        provider: string;
      }>({
        method: "POST",
        path: `/api/sites/${site.id}/images/jobs`,
        body: { referenceId: reference.id },
      });
      expect(response.status).toBe(202);
      expect(response.body.status).toBe("queued");

      const provider = okProvider("image-use", await pngBytes());
      const job = await runImageJobOnce({
        context: workerContext(env, { "image-use": provider }),
      });
      expect(job?.status).toBe("succeeded");

      const sent = provider.generateCalls[0]?.prompt ?? "";
      const stored = await env.engine.store.getReference(reference.id);
      expect(sent).toBe(buildImagePrompt(stored));
      expect(sent).toContain("editorial photograph of a red ceramic teapot");
      expect(sent).toContain("centered hero image with generous whitespace");
    });
  });

  it("rejects a reference without a stored recipe", async () => {
    await withEngine(async (env) => {
      const site = await createTestSite(env.api);
      const reference = await env.engine.store.createReference({
        name: "Ohne Rezept",
        sourceUrl: "https://example.com/ohne-rezept",
        method: "manual",
        provenance: {
          url: "https://example.com/ohne-rezept",
          capturedAt: new Date().toISOString(),
          hash: "test-hash-no-recipe",
          method: "manual",
          note: null,
        },
        status: "ready",
      });
      const response = await env.api.request({
        method: "POST",
        path: `/api/sites/${site.id}/images/jobs`,
        body: { referenceId: reference.id },
      });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("Bildrezept");
    });
  });
});

describe("image jobs: provider chain", () => {
  it("falls back after a quota failure, records it and sets the cooldown", async () => {
    await withEngine(async (env) => {
      const site = await createTestSite(env.api);
      await createJob(env, site.id);
      const primary = failingProvider("image-use", "quota", "Tageslimit erreicht");
      const fallback = okProvider("comfyui", await pngBytes());

      const job = await runImageJobOnce({
        context: workerContext(env, { "image-use": primary, comfyui: fallback }),
      });
      expect(job?.status).toBe("succeeded");
      expect(job?.providerUsed).toBe("comfyui");
      expect(fallback.generateCalls).toHaveLength(1);
      expect(job?.error.map((entry) => entry.kind)).toContain("quota");
      expect(job?.error.map((entry) => entry.provider)).toContain("image-use");

      const cooldowns = await env.engine.store.listProviderCooldowns(
        new Date().toISOString(),
      );
      const cooldown = cooldowns.find((entry) => entry.provider === "image-use");
      expect(cooldown).toBeDefined();
      expect(cooldown?.reason).toContain("Kontingent");

      // The next job skips the cooled-down provider without calling it.
      const second = await createJob(env, site.id, { prompt: "noch ein Motiv" });
      const primaryAgain = failingProvider("image-use", "quota", "sollte nicht laufen");
      const fallbackAgain = okProvider("comfyui", await pngBytes());
      const run = await runImageJobOnce({
        context: workerContext(env, { "image-use": primaryAgain, comfyui: fallbackAgain }),
      });
      expect(run?.status).toBe("succeeded");
      expect(run?.providerUsed).toBe("comfyui");
      expect(primaryAgain.generateCalls).toHaveLength(0);
      expect(fallbackAgain.generateCalls).toHaveLength(1);
      expect(run?.error.some((entry) => entry.kind === "cooldown")).toBe(true);
      expect(second.status).toBe("queued");
    });
  });

  it("retries a timeout once on the same provider before falling back", async () => {
    await withEngine(async (env) => {
      const site = await createTestSite(env.api);
      await createJob(env, site.id);
      let calls = 0;
      const flaky = new StubProvider("image-use", async () => {
        calls += 1;
        if (calls === 1) {
          throw new ImageProviderError("image-use", "timeout", "zu langsam");
        }
        return { bytes: await pngBytes(), mime: "image/png", width: 512, height: 512, seed: 1 };
      });
      const fallback = okProvider("comfyui", await pngBytes());
      const job = await runImageJobOnce({
        context: workerContext(env, { "image-use": flaky, comfyui: fallback }),
      });
      expect(job?.status).toBe("succeeded");
      expect(job?.providerUsed).toBe("image-use");
      expect(flaky.generateCalls).toHaveLength(2);
      expect(fallback.generateCalls).toHaveLength(0);
    });
  });

  it("fails without a fallback on invalid input", async () => {
    await withEngine(async (env) => {
      const site = await createTestSite(env.api);
      await createJob(env, site.id);
      const invalid = failingProvider("image-use", "invalid_input", "Prompt leer");
      const fallback = okProvider("comfyui", await pngBytes());
      const job = await runImageJobOnce({
        context: workerContext(env, { "image-use": invalid, comfyui: fallback }),
      });
      expect(job?.status).toBe("failed");
      expect(fallback.generateCalls).toHaveLength(0);
      expect(job?.error.at(-1)?.kind).toBe("invalid_input");
    });
  });

  it("fails cleanly when no provider is available", async () => {
    await withEngine(async (env) => {
      const site = await createTestSite(env.api);
      await createJob(env, site.id);
      const primary = failingProvider("image-use", "unavailable", "Relay down");
      const fallback = failingProvider("comfyui", "unavailable", "ComfyUI nicht erreichbar");
      const job = await runImageJobOnce({
        context: workerContext(env, { "image-use": primary, comfyui: fallback }),
      });
      expect(job?.status).toBe("failed");
      expect(job?.assetId).toBeNull();
      expect(job?.error.map((entry) => entry.provider)).toEqual(["image-use", "comfyui"]);

      // Both are paused now: a second job fails with the cooldown entries.
      await createJob(env, site.id, { prompt: "noch ein Motiv" });
      const second = await runImageJobOnce({
        context: workerContext(env, { "image-use": primary, comfyui: fallback }),
      });
      expect(second?.status).toBe("failed");
      expect(second?.error.every((entry) => entry.kind === "cooldown")).toBe(true);
    });
  });

  it("resumes an interrupted run instead of submitting twice", async () => {
    await withEngine(async (env) => {
      const site = await createTestSite(env.api);
      const created = await createJob(env, site.id);
      const store = env.engine.store;
      const claimed = await store.claimImageJob({
        now: "2026-01-01T10:00:00.000Z",
        leaseMs: 1_000,
      });
      expect(claimed?.id).toBe(created.jobId);
      await store.setImageJobProvider({
        id: created.jobId,
        providerUsed: "comfyui",
        providerJobId: "lauf-1",
      });
      // The engine "crashes": the lease expires and the job returns to the queue.
      await store.expireImageLeases("2026-01-01T10:00:05.000Z");

      const resume = new StubProvider(
        "comfyui",
        async () => {
          throw new Error("generate must not run on a resumed job");
        },
        async (providerJobId) => {
          expect(providerJobId).toBe("lauf-1");
          return { bytes: await pngBytes(), mime: "image/png", width: 512, height: 512, seed: 3 };
        },
      );
      const job = await runImageJobOnce({
        context: workerContext(env, { comfyui: resume }),
        now: () => new Date("2026-01-01T10:00:06.000Z"),
      });
      expect(job?.status).toBe("succeeded");
      expect(job?.providerUsed).toBe("comfyui");
      expect(resume.resumeCalls).toEqual(["lauf-1"]);
      expect(resume.generateCalls).toHaveLength(0);
    });
  });
});
