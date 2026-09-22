import { randomInt } from "node:crypto";
import sharp from "sharp";
import {
  ImageProviderError,
  validateImageRequest,
  type ImageGenerateOptions,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ImageProvider,
  type ImageProviderHealth,
} from "./image-provider.ts";
import type { ImageCustomFormat } from "./types.ts";

// The custom endpoint (the third path of the chain): any HTTP image API the
// operator configures with base URL, model and API key. Two wire formats:
//
// - minimax: POST {base}/image_generation with aspect_ratio; the answer carries
//   data.image_urls[0] (a JPEG download URL).
// - openai:  POST {base}/images/generations with size; the answer carries
//   data[0].b64_json or data[0].url.
//
// The media pipeline expects PNG, so the downloaded bytes are re-encoded.

export type CustomImageConfig = {
  baseUrl: string;
  model: string;
  format: ImageCustomFormat;
  maxPixels: number;
};

export type CustomImageProviderDeps = {
  // Resolves the stored API key; null when the operator never stored one.
  resolveApiKey: () => Promise<string | null>;
  // Test seam; defaults to the global fetch.
  fetch?: typeof fetch;
};

// The aspect ratios MiniMax accepts; a requested size snaps to the nearest.
const MINIMAX_ASPECTS: { label: string; ratio: number }[] = [
  { label: "1:1", ratio: 1 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "2:3", ratio: 2 / 3 },
  { label: "21:9", ratio: 21 / 9 },
];

export function nearestAspectRatio(width: number, height: number): string {
  const target = width / height;
  let best = MINIMAX_ASPECTS[0]!;
  let bestDelta = Math.abs(Math.log(target / best.ratio));
  for (const entry of MINIMAX_ASPECTS.slice(1)) {
    const delta = Math.abs(Math.log(target / entry.ratio));
    if (delta < bestDelta) {
      best = entry;
      bestDelta = delta;
    }
  }
  return best.label;
}

function customError(
  kind: ImageProviderError["kind"],
  message: string,
  suggestion?: string,
): ImageProviderError {
  return new ImageProviderError(
    "custom",
    kind,
    message,
    suggestion === undefined ? {} : { suggestion },
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

type ImagePayload = { kind: "url" | "base64"; value: string };

function minimaxImage(payload: unknown): ImagePayload {
  const data = (payload as { data?: { image_urls?: unknown } } | null)?.data;
  const urls = data?.image_urls;
  const first = Array.isArray(urls) ? urls[0] : undefined;
  if (typeof first !== "string" || first === "") {
    throw customError("generation", "MiniMax lieferte keine Bild-URL in der Antwort");
  }
  return { kind: "url", value: first };
}

function openaiImage(payload: unknown): ImagePayload {
  const data = (payload as { data?: unknown } | null)?.data;
  const first = Array.isArray(data) ? data[0] : undefined;
  const b64 = (first as { b64_json?: unknown } | undefined)?.b64_json;
  if (typeof b64 === "string" && b64 !== "") {
    // Some gateways wrap the payload into a data URL.
    const value = b64.startsWith("data:") ? (b64.split(",", 2)[1] ?? "") : b64;
    return { kind: "base64", value };
  }
  const url = (first as { url?: unknown } | undefined)?.url;
  if (typeof url === "string" && url !== "") {
    return { kind: "url", value: url };
  }
  throw customError("generation", "Der Custom-Endpoint lieferte kein Bild in der Antwort");
}

// MiniMax answers HTTP 200 with `base_resp.status_code != 0`; the known codes
// map onto the chain categories, everything else stays a generation failure.
// 1004/2049 are the observed auth codes ("invalid api key"), 2067 is the
// exhausted plan ("The Token Plan usage limit has been reached").
function assertMinimaxOk(payload: unknown): void {
  const resp = (
    payload as { base_resp?: { status_code?: unknown; status_msg?: unknown } } | null
  )?.base_resp;
  const code = typeof resp?.status_code === "number" ? resp.status_code : 0;
  if (code === 0) return;
  const message =
    typeof resp?.status_msg === "string" && resp.status_msg !== ""
      ? resp.status_msg
      : `Statuscode ${code}`;
  if (
    code === 1002 ||
    code === 1008 ||
    code === 2067 ||
    /usage limit|rate limit|quota|credits|balance/i.test(message)
  ) {
    throw customError(
      "quota",
      `MiniMax meldet Kontingent/Rate-Limit (${code}): ${message}`,
      "Kontingent prüfen oder später erneut versuchen.",
    );
  }
  if (code === 1004 || code === 2049 || /api.?key/i.test(message)) {
    throw customError(
      "unavailable",
      `MiniMax lehnte den API-Key ab (${code}): ${message}`,
      "API-Key in den Einstellungen prüfen.",
    );
  }
  if (/sensitive|moderat|policy|risk/i.test(message)) {
    throw customError("refusal", `MiniMax lehnte den Prompt ab (${code}): ${message}`);
  }
  throw customError("generation", `MiniMax meldete einen Fehler (${code}): ${message}`);
}

export function createImageCustomProvider(
  config: CustomImageConfig,
  deps: CustomImageProviderDeps,
): ImageProvider {
  const doFetch = deps.fetch ?? fetch;

  async function requestJson(
    url: string,
    apiKey: string,
    body: Record<string, unknown>,
    opts: ImageGenerateOptions,
  ): Promise<unknown> {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const response = await doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const detail = text.trim().slice(0, 200);
        const suffix = detail === "" ? "" : `: ${detail}`;
        if (response.status === 401 || response.status === 403) {
          throw customError(
            "unavailable",
            `Custom-Endpoint lehnte den API-Key ab (HTTP ${response.status})${suffix}`,
            "API-Key in den Einstellungen prüfen.",
          );
        }
        if (response.status === 402 || response.status === 429) {
          throw customError(
            "quota",
            `Custom-Endpoint meldet Kontingent/Rate-Limit (HTTP ${response.status})${suffix}`,
            "Kontingent prüfen oder später erneut versuchen.",
          );
        }
        if (response.status >= 500) {
          throw customError(
            "unavailable",
            `Custom-Endpoint nicht verfügbar (HTTP ${response.status})${suffix}`,
          );
        }
        throw customError(
          "generation",
          `Custom-Endpoint lehnte die Anfrage ab (HTTP ${response.status})${suffix}`,
        );
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof ImageProviderError) throw error;
      if (controller.signal.aborted) {
        if (opts.signal?.aborted === true) {
          throw customError("aborted", "Custom-Lauf wurde abgebrochen");
        }
        throw customError(
          "timeout",
          `Custom-Endpoint antwortete nicht innerhalb von ${opts.timeoutMs} ms`,
          "image.timeoutMinutes erhöhen oder erneut versuchen.",
        );
      }
      throw customError(
        "unavailable",
        `Custom-Endpoint nicht erreichbar: ${messageOf(error)}`,
        "Base-URL und Internetverbindung prüfen.",
      );
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }

  async function downloadImage(
    url: string,
    opts: ImageGenerateOptions,
  ): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const response = await doFetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw customError(
          "generation",
          `Bild-Download fehlgeschlagen (HTTP ${response.status})`,
        );
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof ImageProviderError) throw error;
      if (controller.signal.aborted) {
        throw customError("timeout", "Bild-Download lief in das Zeitlimit");
      }
      throw customError("generation", `Bild-Download fehlgeschlagen: ${messageOf(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function toPng(
    bytes: Buffer,
  ): Promise<{ bytes: Buffer; width: number; height: number }> {
    try {
      const image = sharp(bytes, { failOn: "none" });
      const meta = await image.metadata();
      const png = await image.png().toBuffer();
      return { bytes: png, width: meta.width ?? 0, height: meta.height ?? 0 };
    } catch (error) {
      throw customError(
        "generation",
        `Antwort war kein lesbares Bild: ${messageOf(error)}`,
      );
    }
  }

  return {
    async health(): Promise<ImageProviderHealth> {
      if (config.baseUrl.trim() === "") {
        return {
          ok: false,
          built: true,
          detail:
            "Custom-Endpoint: keine Base-URL gesetzt - image.customBaseUrl in den " +
            "Einstellungen speichern.",
        };
      }
      if (config.model.trim() === "") {
        return {
          ok: false,
          built: true,
          detail:
            "Custom-Endpoint: kein Modell gesetzt - image.customModel in den " +
            "Einstellungen speichern.",
        };
      }
      const key = await deps.resolveApiKey().catch(() => null);
      if (key === null || key.trim() === "") {
        return {
          ok: false,
          built: true,
          detail:
            "Custom-Endpoint: kein API-Key hinterlegt - image.customApiKey in den " +
            "Einstellungen speichern.",
        };
      }
      // Configuration only; reachability is classified by the first run.
      return {
        ok: true,
        built: true,
        detail: `Custom-Endpoint konfiguriert (${config.format}, ${config.model}).`,
      };
    },

    async generate(
      req: ImageGenerationRequest,
      opts: ImageGenerateOptions,
    ): Promise<ImageGenerationResult> {
      validateImageRequest("custom", req, config.maxPixels);
      const apiKey = await deps.resolveApiKey();
      if (apiKey === null || apiKey.trim() === "") {
        throw customError(
          "unavailable",
          "Kein API-Key für den Custom-Endpoint hinterlegt",
          "In den Einstellungen unter Bildgenerierung den API-Key speichern.",
        );
      }
      const base = trimSlash(config.baseUrl);
      const minimax = config.format === "minimax";
      const url = minimax ? `${base}/image_generation` : `${base}/images/generations`;
      const body: Record<string, unknown> = minimax
        ? {
            model: config.model,
            prompt: req.prompt,
            aspect_ratio: nearestAspectRatio(req.width, req.height),
            response_format: "url",
            n: 1,
          }
        : {
            model: config.model,
            prompt: req.prompt,
            size: `${req.width}x${req.height}`,
            n: 1,
            response_format: "b64_json",
          };
      const payload = await requestJson(url, apiKey, body, opts);
      if (minimax) assertMinimaxOk(payload);
      const image = minimax ? minimaxImage(payload) : openaiImage(payload);
      const raw =
        image.kind === "base64"
          ? Buffer.from(image.value, "base64")
          : await downloadImage(image.value, opts);
      const png = await toPng(raw);
      return {
        bytes: png.bytes,
        mime: "image/png",
        width: png.width,
        height: png.height,
        // Neither wire format carries a seed reliably; the result reports the
        // requested or a fresh one for the job bookkeeping.
        seed: req.seed ?? randomInt(1, 2 ** 31 - 1),
      };
    },
  };
}
