import { describe, expect, it } from "vitest";
import {
  createFallbackCaptureDriver,
  createFirecrawlCaptureDriver,
  createHttpSnapshotCaptureDriver,
  defaultCaptureProviders,
  FIRECRAWL_DEFAULT_ENDPOINT,
  ReferenceCaptureError,
  type CaptureAttempt,
  type CaptureResult,
} from "@senify/engine";

// Fetch fallback chain (E12): every provider is a driver; the tests drive the
// chain with fakes and a mocked fetch. No browser, no network.

const input = { url: "https://example.test", breakpoints: [1440] };

function ok(markup: string): CaptureResult {
  return { markup };
}

function blocked(): never {
  throw new ReferenceCaptureError({
    reason: "blocked",
    message: "Die Seite hat die Analyse blockiert (HTTP 403)",
    suggestion: "Snapshot hochladen.",
    retryable: false,
  });
}

describe("capture fallback chain (E12)", () => {
  it("uses the first healthy provider and records the attempt", async () => {
    const attempts: CaptureAttempt[] = [];
    const driver = createFallbackCaptureDriver({
      providers: [
        { name: "playwright", driver: async () => ok("<h1>live</h1>") },
        {
          name: "http",
          driver: async () => {
            throw new Error("never called");
          },
        },
      ],
      onAttempt: (attempt) => attempts.push(attempt),
    });
    const result = await driver(input);
    expect(result.markup).toContain("live");
    expect(result.provider).toBe("playwright");
    expect(attempts).toEqual([{ provider: "playwright", ok: true }]);
  });

  it("falls back to the next provider after a block", async () => {
    const attempts: CaptureAttempt[] = [];
    const driver = createFallbackCaptureDriver({
      providers: [
        { name: "playwright", driver: async () => blocked() },
        {
          name: "firecrawl",
          driver: async () => ({
            ...ok("<h1>fc</h1>"),
            provider: "firecrawl" as const,
            note: "Firecrawl-Fallback",
          }),
        },
      ],
      onAttempt: (attempt) => attempts.push(attempt),
    });
    const result = await driver(input);
    expect(result.provider).toBe("firecrawl");
    expect(result.note).toBe("Firecrawl-Fallback");
    expect(attempts.map((attempt) => attempt.provider)).toEqual([
      "playwright",
      "firecrawl",
    ]);
    expect(attempts[0]?.reason).toBe("blocked");
  });

  it("skips a provider whose health check fails", async () => {
    const attempts: CaptureAttempt[] = [];
    const driver = createFallbackCaptureDriver({
      providers: [
        {
          name: "firecrawl",
          driver: async () => ok("never"),
          available: () => false,
          unavailableReason: "FIRECRAWL_API_KEY fehlt",
        },
        { name: "http", driver: async () => ok("<h1>source</h1>") },
      ],
      onAttempt: (attempt) => attempts.push(attempt),
    });
    const result = await driver(input);
    expect(result.provider).toBe("http");
    expect(attempts[0]).toEqual({
      provider: "firecrawl",
      ok: false,
      skipped: "FIRECRAWL_API_KEY fehlt",
    });
  });

  it("reports every attempt when all providers fail", async () => {
    const driver = createFallbackCaptureDriver({
      providers: [
        { name: "playwright", driver: async () => blocked() },
        {
          name: "http",
          driver: async () => {
            throw new ReferenceCaptureError({
              reason: "timeout",
              message: "Keine Antwort",
              suggestion: "Erneut versuchen.",
              retryable: true,
            });
          },
        },
      ],
    });
    await expect(driver(input)).rejects.toMatchObject({
      name: "ReferenceCaptureError",
      failure: { reason: "blocked", retryable: true },
    });
    const error = await driver(input).catch((caught: unknown) => caught);
    expect((error as ReferenceCaptureError).failure.message).toContain(
      "playwright (blocked",
    );
    expect((error as ReferenceCaptureError).failure.message).toContain(
      "http (timeout",
    );
  });

  it("reads firecrawl markup through the scrape endpoint", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ success: true, data: { html: "<h1>fire</h1>" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const driver = createFirecrawlCaptureDriver({
      apiKey: "fc-test",
      fetch: fakeFetch,
    });
    const result = await driver(input);
    expect(result.markup).toBe("<h1>fire</h1>");
    expect(result.provider).toBe("firecrawl");
    expect(result.note).toContain("reduziertes Profil");
    expect(calls[0]?.url).toBe(FIRECRAWL_DEFAULT_ENDPOINT);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer fc-test");
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      url: string;
      formats: string[];
    };
    expect(body.url).toBe(input.url);
    expect(body.formats).toContain("html");
  });

  it("maps a firecrawl refusal to a non-retryable failure", async () => {
    const driver = createFirecrawlCaptureDriver({
      apiKey: "fc",
      fetch: async () => new Response("no credits", { status: 402 }),
    });
    await expect(driver(input)).rejects.toMatchObject({
      failure: { reason: "unavailable", retryable: false },
    });
  });

  it("refuses firecrawl without a key", async () => {
    const driver = createFirecrawlCaptureDriver({});
    await expect(driver(input)).rejects.toMatchObject({
      failure: { reason: "unavailable", retryable: false },
    });
  });

  it("fetches the page source over plain http as the last resort", async () => {
    const driver = createHttpSnapshotCaptureDriver({
      fetch: async () => new Response("<html><h1>Quelle</h1></html>", { status: 200 }),
    });
    const result = await driver(input);
    expect(result.markup).toContain("Quelle");
    expect(result.provider).toBe("http");
    expect(result.note).toContain("reduziertes Profil");
  });

  it("maps a blocked http response", async () => {
    const driver = createHttpSnapshotCaptureDriver({
      fetch: async () => new Response("nope", { status: 403 }),
    });
    await expect(driver(input)).rejects.toMatchObject({
      failure: { reason: "blocked", retryable: false },
    });
  });
});

describe("default capture providers (E12)", () => {
  it("keeps firecrawl out without a key and in with one", () => {
    expect(defaultCaptureProviders({}).map((provider) => provider.name)).toEqual([
      "playwright",
      "http",
    ]);
    expect(
      defaultCaptureProviders({ FIRECRAWL_API_KEY: "fc-1" }).map(
        (provider) => provider.name,
      ),
    ).toEqual(["playwright", "firecrawl", "http"]);
    expect(
      defaultCaptureProviders({ FIRECRAWL_API_KEY: "   " }).map(
        (provider) => provider.name,
      ),
    ).toEqual(["playwright", "http"]);
  });
});
