import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  createImageCustomProvider,
  nearestAspectRatio,
  type ImageProviderFailureKind,
} from "@senify/engine";

// Prüfstelle: the custom endpoint (third path) — MiniMax and OpenAI wire
// formats. fetch is injected, so no test ever talks to a real API.

const BASE = "https://api.minimax.io/v1";
const KEY = "sk-test-key";

async function jpegBytes(width = 32, height = 32): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 60, b: 30 },
    },
  })
    .jpeg()
    .toBuffer();
}

type FetchCall = { url: string; init: RequestInit | undefined };

function fakeFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const impl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetch: impl as typeof fetch, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function provider(
  overrides: Partial<{
    format: "minimax" | "openai";
    resolveApiKey: () => Promise<string | null>;
    fetch: typeof fetch;
  }> = {},
) {
  return createImageCustomProvider(
    {
      baseUrl: BASE,
      model: "image-01",
      format: overrides.format ?? "minimax",
      maxPixels: 1_048_576,
    },
    {
      resolveApiKey: overrides.resolveApiKey ?? (async () => KEY),
      ...(overrides.fetch === undefined ? {} : { fetch: overrides.fetch }),
    },
  );
}

const request = { prompt: "a red teapot", width: 512, height: 512, steps: 40 };

async function failureOf(promise: Promise<unknown>): Promise<{
  kind: ImageProviderFailureKind;
  message: string;
}> {
  try {
    await promise;
  } catch (error) {
    const providerError = error as { kind?: ImageProviderFailureKind; message: string };
    return { kind: providerError.kind ?? "generation", message: providerError.message };
  }
  throw new Error("expected the call to fail");
}

describe("custom image provider", () => {
  it("snaps the requested size to the nearest MiniMax aspect ratio", () => {
    expect(nearestAspectRatio(1024, 1024)).toBe("1:1");
    expect(nearestAspectRatio(1920, 1080)).toBe("16:9");
    expect(nearestAspectRatio(1080, 1920)).toBe("9:16");
    expect(nearestAspectRatio(800, 600)).toBe("4:3");
    expect(nearestAspectRatio(600, 800)).toBe("3:4");
  });

  it("reports health as unconfigured without an API key", async () => {
    const health = await provider({ resolveApiKey: async () => null }).health();
    expect(health.ok).toBe(false);
    expect(health.built).toBe(true);
    expect(health.detail).toContain("kein API-Key");
  });

  it("reports health as configured with a stored key", async () => {
    const health = await provider().health();
    expect(health).toMatchObject({ ok: true, built: true });
    expect(health.detail).toContain("minimax");
  });

  it("runs the MiniMax wire format and re-encodes the JPEG as PNG", async () => {
    const jpeg = await jpegBytes(64, 64);
    const { fetch: mock, calls } = fakeFetch((url) => {
      if (url.includes("/image_generation")) {
        return jsonResponse({
          id: "task-1",
          data: { image_urls: ["https://cdn.example/img.jpg"] },
          base_resp: { status_code: 0, status_msg: "success" },
        });
      }
      return new Response(jpeg, { status: 200 });
    });
    const result = await provider({ fetch: mock }).generate(request, {
      timeoutMs: 30_000,
    });
    expect(result.mime).toBe("image/png");
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(result.bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(calls[0]?.url).toBe(`${BASE}/image_generation`);
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "image-01",
      aspect_ratio: "1:1",
      response_format: "url",
    });
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    expect(calls[1]?.url).toBe("https://cdn.example/img.jpg");
  });

  it("runs the OpenAI wire format with b64_json", async () => {
    const jpeg = await jpegBytes(48, 48);
    const { fetch: mock, calls } = fakeFetch(() =>
      jsonResponse({ data: [{ b64_json: jpeg.toString("base64") }] }),
    );
    const result = await provider({ format: "openai", fetch: mock }).generate(
      { ...request, width: 512, height: 512 },
      { timeoutMs: 30_000 },
    );
    expect(result.mime).toBe("image/png");
    expect(result.width).toBe(48);
    expect(calls[0]?.url).toBe(`${BASE}/images/generations`);
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ size: "512x512", response_format: "b64_json" });
  });

  it("classifies HTTP 429 as quota and 401 as unavailable", async () => {
    const quota = fakeFetch(() => jsonResponse({ error: "rate limit" }, 429));
    const quotaError = await failureOf(
      provider({ fetch: quota.fetch }).generate(request, { timeoutMs: 5_000 }),
    );
    expect(quotaError.kind).toBe("quota");

    const auth = fakeFetch(() => jsonResponse({ error: "bad key" }, 401));
    const authError = await failureOf(
      provider({ fetch: auth.fetch }).generate(request, { timeoutMs: 5_000 }),
    );
    expect(authError.kind).toBe("unavailable");
  });

  it("maps the MiniMax base_resp codes onto the chain categories", async () => {
    const rate = fakeFetch(() =>
      jsonResponse({ base_resp: { status_code: 1002, status_msg: "rate limit" } }),
    );
    const rateError = await failureOf(
      provider({ fetch: rate.fetch }).generate(request, { timeoutMs: 5_000 }),
    );
    expect(rateError.kind).toBe("quota");

    const denied = fakeFetch(() =>
      jsonResponse({ base_resp: { status_code: 1004, status_msg: "invalid api key" } }),
    );
    const deniedError = await failureOf(
      provider({ fetch: denied.fetch }).generate(request, { timeoutMs: 5_000 }),
    );
    expect(deniedError.kind).toBe("unavailable");

    // The code MiniMax answered when the operator's key was revoked.
    const revoked = fakeFetch(() =>
      jsonResponse({ base_resp: { status_code: 2049, status_msg: "invalid api key" } }),
    );
    const revokedError = await failureOf(
      provider({ fetch: revoked.fetch }).generate(request, { timeoutMs: 5_000 }),
    );
    expect(revokedError.kind).toBe("unavailable");

    // The code MiniMax answered when the plan ran out (observed live).
    const exhausted = fakeFetch(() =>
      jsonResponse({
        base_resp: {
          status_code: 2067,
          status_msg:
            "The Token Plan usage limit has been reached. To avoid interruption, please upgrade your plan or buy credits and turn on auto consumption.",
        },
      }),
    );
    const exhaustedError = await failureOf(
      provider({ fetch: exhausted.fetch }).generate(request, { timeoutMs: 5_000 }),
    );
    expect(exhaustedError.kind).toBe("quota");
  });

  it("fails as unavailable when no API key is stored", async () => {
    const error = await failureOf(
      provider({ resolveApiKey: async () => null }).generate(request, {
        timeoutMs: 5_000,
      }),
    );
    expect(error.kind).toBe("unavailable");
    expect(error.message).toContain("Kein API-Key");
  });
});
