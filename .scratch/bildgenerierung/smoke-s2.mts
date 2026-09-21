import { createApiHarness, createTestDb } from "@senify/core/testing";
import {
  createEngine,
  defaultImageProviders,
  runImageJobOnce,
} from "../../packages/engine/src/index.ts";
import { createRegistry } from "../../packages/registry/src/index.ts";

// One-off end-to-end smoke test for S2 (Ticket 02): job over HTTP → worker →
// real ComfyUI → asset. Documented in the ticket.

const memory = createTestDb();
const { Pool } = memory.adapters.createPg();
const pool = new Pool();
const db = {
  query: async (text: string, params?: readonly unknown[]) => {
    const result = await pool.query(text, params as unknown[] | undefined);
    return { rows: result.rows as Record<string, unknown>[] };
  },
  withTransaction: async <T>(task: (client: unknown) => Promise<T>): Promise<T> =>
    task(db),
};

const engine = await createEngine({
  db: db as never,
  registry: createRegistry(),
  dataDir: "G:/ai-studio/temp/senify-s2-data",
  rateLimits: { perMinute: 10_000, burst: 10_000, destructivePerMinute: 10_000 },
});
const server = await engine.listen({ port: 0 });
const anon = createApiHarness(server.origin);
const created = await anon.request<{ secret: string }>({
  method: "POST",
  path: "/api/tokens",
  body: { name: "smoke", scopes: ["read", "write", "publish"] },
});
const api = createApiHarness(server.origin, { token: created.body.secret });
const site = await api.request<{ id: string }>({
  method: "POST",
  path: "/api/sites",
  body: { name: "S2 Smoke" },
});

// image-use follows with S6: this run goes straight over the ComfyUI fallback.
await api.request({
  method: "PUT",
  path: "/api/settings",
  body: { image: { provider: "comfyui", timeoutMinutes: 30 } },
});

const job = await api.request<{ jobId: string; status: string; provider: string }>({
  method: "POST",
  path: `/api/sites/${site.body.id}/images/jobs`,
  body: {
    prompt:
      "A small red ceramic teapot beside a green plant on a worn wooden kitchen table. Soft morning light through a window, realistic ceramic glaze and wood grain, quiet documentary photograph.",
    width: 512,
    height: 512,
    steps: 40,
    seed: 44,
    altText: "S2 Smoke: rote Teekanne",
    tags: ["smoke"],
  },
});
console.log("POST job:", job.status, JSON.stringify(job.body));

const started = Date.now();
const run = await runImageJobOnce({
  context: {
    store: engine.store,
    dataDir: engine.dataDir,
    maxUploadBytes: engine.maxUploadBytes,
    providers: defaultImageProviders,
  },
});
const seconds = Math.round((Date.now() - started) / 1000);
console.log(
  `worker: status=${run?.status} provider=${run?.providerUsed} asset=${run?.assetId} in ${seconds}s`,
);
if (run?.error.length) console.log("history:", JSON.stringify(run.error, null, 2));

const status = await api.request<Record<string, unknown>>({
  method: "GET",
  path: `/api/images/jobs/${job.body.jobId}`,
});
console.log(
  "GET job:",
  JSON.stringify({
    status: status.body.status,
    providerUsed: status.body.providerUsed,
    assetId: status.body.assetId,
  }),
);

const assets = await api.request<{ assets: { id: string; filename: string; width: number | null; height: number | null; altText: string | null; tags: string[] }[] }>({
  method: "GET",
  path: `/api/sites/${site.body.id}/assets`,
});
console.log(
  "assets:",
  JSON.stringify(
    assets.body.assets.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      size: `${asset.width}x${asset.height}`,
      altText: asset.altText,
      tags: asset.tags,
    })),
  ),
);

await server.close();
await pool.end();
