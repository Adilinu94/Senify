import {
  createPlaywrightCaptureDriver,
  ReferenceCaptureError,
  type ReferenceCaptureDriver,
  type ReferenceCaptureFailure,
} from "./references-lifecycle.ts";

// Fetch fallback chain (E12): the capture tries its providers in order and
// records every attempt. Playwright is the full capture (runtime samples,
// screenshots, motion video); Firecrawl is a hosted renderer (markup only,
// reduced profile); the plain HTTP fetch is the last resort (page source,
// reduced profile). A provider without a health check is skipped instead of
// attempted — an unconfigured Firecrawl key must not cost a request.

export type CaptureProviderName = "playwright" | "firecrawl" | "http";

export type CaptureProvider = {
  name: CaptureProviderName;
  driver: ReferenceCaptureDriver;
  // Health check: when it returns false the provider is skipped, never tried.
  available?: () => boolean;
  unavailableReason?: string;
};

export type CaptureAttempt = {
  provider: CaptureProviderName;
  ok: boolean;
  // Why a provider was skipped without a request (health check).
  skipped?: string;
  reason?: ReferenceCaptureFailure["reason"];
  message?: string;
  retryable?: boolean;
};

export type FallbackCaptureOptions = {
  providers: readonly CaptureProvider[];
  // Observability hook: every attempt (including skips) is reported.
  onAttempt?: (attempt: CaptureAttempt) => void;
};

function toFailure(error: unknown): ReferenceCaptureFailure {
  if (error instanceof ReferenceCaptureError) return error.failure;
  return {
    reason: "internal",
    message: error instanceof Error ? error.message : "Unbekannter Capture-Fehler",
    suggestion: "Engine-Log prüfen und den Job erneut anstoßen (references tick).",
    retryable: false,
  };
}

function chainFailure(attempts: readonly CaptureAttempt[]): ReferenceCaptureFailure {
  const failures = attempts.filter((attempt) => !attempt.ok && attempt.skipped === undefined);
  const first = failures[0];
  const summary = attempts
    .map((attempt) =>
      attempt.skipped !== undefined
        ? `${attempt.provider} (übersprungen: ${attempt.skipped})`
        : attempt.ok
          ? `${attempt.provider} (ok)`
          : `${attempt.provider} (${attempt.reason ?? "internal"}: ${attempt.message ?? ""})`,
    )
    .join("; ");
  return {
    reason: first?.reason ?? "unavailable",
    message: `Kein Capture-Anbieter war erfolgreich: ${summary}`,
    suggestion:
      first?.message !== undefined
        ? "Firecrawl-Schlüssel prüfen (FIRECRAWL_API_KEY) oder einen HTML-/Screenshot-Snapshot hochladen."
        : "Firecrawl konfigurieren oder einen HTML-/Screenshot-Snapshot hochladen.",
    // The job retry should fire when any provider failure was transient.
    retryable: failures.some((attempt) => attempt.retryable === true),
  };
}

export function createFallbackCaptureDriver(
  options: FallbackCaptureOptions,
): ReferenceCaptureDriver {
  return async (input) => {
    if (options.providers.length === 0) {
      throw new ReferenceCaptureError({
        reason: "unavailable",
        message: "Kein Capture-Anbieter ist konfiguriert",
        suggestion: "Playwright installieren oder FIRECRAWL_API_KEY setzen.",
        retryable: false,
      });
    }
    const attempts: CaptureAttempt[] = [];
    const report = (attempt: CaptureAttempt): void => {
      attempts.push(attempt);
      options.onAttempt?.(attempt);
    };
    for (const provider of options.providers) {
      if (provider.available !== undefined && !provider.available()) {
        report({
          provider: provider.name,
          ok: false,
          skipped: provider.unavailableReason ?? "nicht verfügbar",
        });
        continue;
      }
      try {
        const result = await provider.driver(input);
        report({ provider: provider.name, ok: true });
        return { ...result, provider: provider.name };
      } catch (error) {
        const failure = toFailure(error);
        report({
          provider: provider.name,
          ok: false,
          reason: failure.reason,
          message: failure.message,
          retryable: failure.retryable,
        });
      }
    }
    throw new ReferenceCaptureError(chainFailure(attempts));
  };
}

// -------------------------------------------------------------- firecrawl

export type FirecrawlCaptureOptions = {
  apiKey?: string;
  // Overridable for self-hosted gateways and tests.
  endpoint?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export const FIRECRAWL_DEFAULT_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";

function httpFailure(status: number, provider: string): ReferenceCaptureFailure {
  if (status === 401 || status === 402 || status === 403) {
    return provider === "Firecrawl"
      ? {
          reason: "unavailable",
          message: `${provider} hat die Anfrage abgelehnt (HTTP ${status})`,
          suggestion:
            "FIRECRAWL_API_KEY prüfen (Guthaben und Schlüssel) oder Snapshot hochladen.",
          retryable: false,
        }
      : {
          reason: "blocked",
          message: `${provider} hat den Abruf verweigert (HTTP ${status})`,
          suggestion: "Screenshot-/HTML-Snapshot hochladen (reduziertes Profil).",
          retryable: false,
        };
  }
  if (status === 429) {
    return {
      reason: "blocked",
      message: `${provider} drosselt die Anfragen (HTTP 429)`,
      suggestion: "Kurz warten und den Job erneut anstoßen.",
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      reason: "unavailable",
      message: `${provider} ist nicht erreichbar (HTTP ${status})`,
      suggestion: "Dienst-Status prüfen und den Job erneut anstoßen.",
      retryable: true,
    };
  }
  return {
    reason: "blocked",
    message: `${provider} konnte die Seite nicht laden (HTTP ${status})`,
    suggestion: "Snapshot hochladen (reduziertes Profil).",
    retryable: false,
  };
}

function requestFailure(error: unknown, provider: string): ReferenceCaptureFailure {
  const aborted =
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError");
  if (aborted) {
    return {
      reason: "timeout",
      message: `${provider} hat nicht rechtzeitig geantwortet`,
      suggestion: "Erneut versuchen oder Snapshot hochladen.",
      retryable: true,
    };
  }
  return {
    reason: "unavailable",
    message: `${provider} ist nicht erreichbar: ${
      error instanceof Error ? error.message : "unbekannter Fehler"
    }`,
    suggestion: "Netzwerk prüfen und den Job erneut anstoßen.",
    retryable: true,
  };
}

export function createFirecrawlCaptureDriver(
  options: FirecrawlCaptureOptions = {},
): ReferenceCaptureDriver {
  const doFetch = options.fetch ?? fetch;
  const endpoint = options.endpoint ?? FIRECRAWL_DEFAULT_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? 60_000;
  return async (input) => {
    const apiKey = options.apiKey?.trim();
    if (apiKey === undefined || apiKey === "") {
      throw new ReferenceCaptureError({
        reason: "unavailable",
        message: "Firecrawl ist nicht konfiguriert (FIRECRAWL_API_KEY fehlt)",
        suggestion: "FIRECRAWL_API_KEY setzen oder einen Snapshot hochladen.",
        retryable: false,
      });
    }
    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: input.url, formats: ["html"], onlyMainContent: false }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ReferenceCaptureError(requestFailure(error, "Firecrawl"));
    }
    if (!response.ok) {
      throw new ReferenceCaptureError(httpFailure(response.status, "Firecrawl"));
    }
    let payload: { success?: boolean; data?: { html?: string }; error?: string };
    try {
      payload = (await response.json()) as typeof payload;
    } catch (error) {
      throw new ReferenceCaptureError(requestFailure(error, "Firecrawl"));
    }
    const html = payload.data?.html;
    if (payload.success === false || typeof html !== "string" || html.trim() === "") {
      throw new ReferenceCaptureError({
        reason: "unavailable",
        message: `Firecrawl lieferte kein HTML${
          payload.error === undefined ? "" : `: ${payload.error}`
        }`,
        suggestion: "URL prüfen oder einen Snapshot hochladen.",
        retryable: false,
      });
    }
    return {
      markup: html,
      provider: "firecrawl",
      note: "Firecrawl-Fallback: gehostetes Rendering, Analyse aus HTML (reduziertes Profil)",
    };
  };
}

// -------------------------------------------------------------- http source

export type HttpSnapshotOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
};

// The last resort: the page source over plain HTTP, no runtime values. The
// extractor marks the profile as reduced, exactly like the manual snapshot.
export function createHttpSnapshotCaptureDriver(
  options: HttpSnapshotOptions = {},
): ReferenceCaptureDriver {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const userAgent =
    options.userAgent ??
    "Mozilla/5.0 (compatible; SenifyReferenceBot/1.0; +https://senify.local)";
  return async (input) => {
    let response: Response;
    try {
      response = await doFetch(input.url, {
        redirect: "follow",
        headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml,*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ReferenceCaptureError(requestFailure(error, "HTTP-Snapshot"));
    }
    if (!response.ok) {
      throw new ReferenceCaptureError(httpFailure(response.status, "HTTP-Snapshot"));
    }
    const html = await response.text();
    if (html.trim() === "") {
      throw new ReferenceCaptureError({
        reason: "unavailable",
        message: "HTTP-Snapshot lieferte leeren Inhalt",
        suggestion: "URL prüfen oder einen Snapshot hochladen.",
        retryable: false,
      });
    }
    return {
      markup: html,
      provider: "http",
      note: "HTTP-Snapshot-Fallback: Analyse aus Seitenquelltext (reduziertes Profil)",
    };
  };
}

// -------------------------------------------------------------- default chain

export type DefaultCaptureOptions = {
  // Injected for tests: replaces the Playwright driver of the chain.
  playwright?: ReferenceCaptureDriver;
  fetch?: typeof fetch;
};

// Playwright → Firecrawl (only with a key) → HTTP source. The health check of
// the Firecrawl provider keeps a keyless engine from spending a request on it.
export function defaultCaptureProviders(
  env: NodeJS.ProcessEnv,
  options: DefaultCaptureOptions = {},
): CaptureProvider[] {
  const firecrawlKey = env.FIRECRAWL_API_KEY?.trim();
  const providers: CaptureProvider[] = [
    {
      name: "playwright",
      driver: options.playwright ?? createPlaywrightCaptureDriver(),
    },
  ];
  if (firecrawlKey !== undefined && firecrawlKey !== "") {
    providers.push({
      name: "firecrawl",
      driver: createFirecrawlCaptureDriver({
        apiKey: firecrawlKey,
        ...(env.FIRECRAWL_API_URL === undefined || env.FIRECRAWL_API_URL === ""
          ? {}
          : { endpoint: env.FIRECRAWL_API_URL }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      }),
    });
  }
  providers.push({
    name: "http",
    driver: createHttpSnapshotCaptureDriver(
      options.fetch === undefined ? {} : { fetch: options.fetch },
    ),
  });
  return providers;
}

export function createDefaultCaptureDriver(
  env: NodeJS.ProcessEnv,
  options: DefaultCaptureOptions = {},
): ReferenceCaptureDriver {
  return createFallbackCaptureDriver({
    providers: defaultCaptureProviders(env, options),
  });
}
