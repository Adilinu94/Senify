import { randomInt, randomUUID } from "node:crypto";
import {
  ImageProviderError,
  validateImageRequest,
  type ImageGenerateOptions,
  type ImageGenerationRequest,
  type ImageGenerationResult,
  type ImageProvider,
  type ImageProviderHealth,
} from "./image-provider.ts";
import { imageDimensions } from "./media.ts";

// ComfyUI + Qwen-Image-2.1 (GGUF, low VRAM): the local fallback provider.
// The graph mirrors the verified API workflows of the installation
// (07-small-512 / 06-low-vram): GGUF unet loader, Qwen-VL text encoder on CPU,
// tiled VAE decode for 8 GB VRAM, Euler/simple/CFG 1.

export type ComfyImageConfig = {
  baseUrl: string;
  diffusionModel: string;
  textEncoder: string;
  vae: string;
  defaultSteps: number;
  maxPixels: number;
  timeoutMinutes: number;
};

type GraphNode = { class_type: string; inputs: Record<string, unknown> };
export type QwenImageGraph = Record<string, GraphNode>;

// The encoder's internal base resolution (fixed in the verified workflows,
// independent of the requested image size).
const ENCODER_RESOLUTION = 1024;
const HEALTH_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 3_000;
const SUBMIT_TIMEOUT_MS = 30_000;
const POLL_REQUEST_TIMEOUT_MS = 10_000;

export function buildQwenGraph(
  config: Pick<ComfyImageConfig, "diffusionModel" | "textEncoder" | "vae">,
  req: { prompt: string; width: number; height: number; steps: number; seed: number },
): QwenImageGraph {
  return {
    "1": {
      class_type: "UnetLoaderGGUF",
      inputs: { unet_name: config.diffusionModel },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: config.textEncoder, type: "qwen_image", device: "cpu" },
    },
    "3": { class_type: "VAELoader", inputs: { vae_name: config.vae } },
    "4": {
      class_type: "TextEncodeQwenImage21",
      inputs: {
        clip: ["2", 0],
        prompt: req.prompt,
        negative_prompt: "",
        resolution: ENCODER_RESOLUTION,
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: req.width, height: req.height, batch_size: 1 },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["4", 0],
        negative: ["4", 1],
        latent_image: ["5", 0],
        seed: req.seed,
        steps: req.steps,
        cfg: 1.0,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1.0,
      },
    },
    "7": {
      class_type: "VAEDecodeTiled",
      inputs: {
        samples: ["6", 0],
        vae: ["3", 0],
        tile_size: 256,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 8,
      },
    },
    "8": {
      class_type: "SaveImage",
      inputs: { images: ["7", 0], filename_prefix: "Senify/qwen" },
    },
  };
}

type ComfyImageRef = { filename: string; subfolder: string; type: string };

type ComfyHistoryEntry = {
  status?: { status_str?: string; messages?: unknown[] };
  outputs?: Record<string, { images?: ComfyImageRef[] } | undefined>;
  // [number, promptId, graph, extraData, outputs] — the graph carries the seed.
  prompt?: unknown[];
};

function firstImageOf(entry: ComfyHistoryEntry): ComfyImageRef {
  for (const output of Object.values(entry.outputs ?? {})) {
    const first = output?.images?.[0];
    if (first !== undefined) return first;
  }
  throw comfyError("generation", "ComfyUI lieferte kein Bild in der Antwort");
}

// The seed of a resumed run: read back from the stored graph when present.
function seedOfHistory(entry: ComfyHistoryEntry): number {
  const graph = entry.prompt?.[2] as
    | Record<string, { inputs?: { seed?: unknown } }>
    | undefined;
  const seed = graph?.["6"]?.inputs?.seed;
  return typeof seed === "number" ? seed : 0;
}

function comfyError(
  kind: ImageProviderError["kind"],
  message: string,
  suggestion?: string,
): ImageProviderError {
  return new ImageProviderError(
    "comfyui",
    kind,
    message,
    suggestion === undefined ? {} : { suggestion },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(comfyError("aborted", "Lauf abgebrochen"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(comfyError("aborted", "Lauf abgebrochen"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// The model lists of the loader nodes, so a wrong file name in the settings is
// a health finding instead of a failed run.
function listsFile(
  body: unknown,
  node: string,
  input: string,
  file: string,
): boolean {
  const info = (body as Record<string, { input?: { required?: Record<string, unknown[]> } }>)[
    node
  ];
  const spec = info?.input?.required?.[input];
  const options = Array.isArray(spec) ? spec[0] : undefined;
  return Array.isArray(options) && options.includes(file);
}

function statusDetail(entry: ComfyHistoryEntry): string {
  const messages = entry.status?.messages;
  if (!Array.isArray(messages)) return "unbekannter Fehler";
  const text = messages
    .map((message) => {
      if (!Array.isArray(message) || message.length < 2) return "";
      const payload = message[1] as
        | { message?: unknown; exception_message?: unknown }
        | undefined;
      const detail = payload?.exception_message ?? payload?.message;
      return typeof detail === "string" ? detail : "";
    })
    .filter((part) => part !== "")
    .join("; ");
  return text === "" ? "unbekannter Fehler" : text.slice(0, 400);
}

export function createComfyImageProvider(
  config: ComfyImageConfig,
  fetchImpl: typeof fetch = fetch,
): ImageProvider {
  const base = config.baseUrl.replace(/\/+$/, "");

  // One request with a per-call timeout and the job signal, so an aborted job
  // never leaves a hanging connection behind.
  async function request(
    path: string,
    init: RequestInit | undefined,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    signal?.addEventListener("abort", onOuterAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${base}${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (signal?.aborted) throw comfyError("aborted", "Lauf abgebrochen");
      // The request's own timer fired: the server is reachable but too slow,
      // which is a timeout (retry, then fallback), not an availability failure.
      if (controller.signal.aborted) {
        throw comfyError(
          "timeout",
          `ComfyUI antwortete nicht innerhalb von ${timeoutMs} ms auf ${path}`,
          "ComfyUI-Last prüfen; image.timeoutMinutes erhöhen.",
        );
      }
      throw comfyError(
        "unavailable",
        `ComfyUI nicht erreichbar (${base}): ${errorMessage(error)}`,
        "ComfyUI starten und image.baseUrl prüfen.",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
  }

  async function json(
    path: string,
    init: RequestInit | undefined,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const response = await request(path, init, timeoutMs, signal);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw comfyError(
        "generation",
        `ComfyUI antwortete ${response.status} auf ${path}${text === "" ? "" : `: ${text.slice(0, 300)}`}`,
      );
    }
    return response.json();
  }

  async function probeModels(): Promise<
    Record<"diffusionModel" | "textEncoder" | "vae", boolean> | undefined
  > {
    try {
      const [unet, clip, vae] = await Promise.all([
        json("/object_info/UnetLoaderGGUF", undefined, HEALTH_TIMEOUT_MS),
        json("/object_info/CLIPLoader", undefined, HEALTH_TIMEOUT_MS),
        json("/object_info/VAELoader", undefined, HEALTH_TIMEOUT_MS),
      ]);
      return {
        diffusionModel: listsFile(unet, "UnetLoaderGGUF", "unet_name", config.diffusionModel),
        textEncoder: listsFile(clip, "CLIPLoader", "clip_name", config.textEncoder),
        vae: listsFile(vae, "VAELoader", "vae_name", config.vae),
      };
    } catch {
      return undefined;
    }
  }

  async function waitForHistory(
    promptId: string,
    opts: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<ComfyHistoryEntry> {
    const deadline = Date.now() + opts.timeoutMs;
    for (;;) {
      if (opts.signal?.aborted) throw comfyError("aborted", "Lauf abgebrochen");
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw comfyError(
          "timeout",
          `ComfyUI-Lauf dauerte länger als ${Math.round(opts.timeoutMs / 60_000)} Minuten`,
          "Weniger Steps oder kleinere Auflösung wählen; image.timeoutMinutes erhöhen.",
        );
      }
      const body = (await json(
        `/history/${promptId}`,
        undefined,
        Math.min(POLL_REQUEST_TIMEOUT_MS, remaining),
        opts.signal,
      )) as Record<string, ComfyHistoryEntry | undefined>;
      const entry = body[promptId];
      if (entry !== undefined) {
        if (entry.status?.status_str === "error") {
          throw comfyError(
            "generation",
            `ComfyUI-Lauf fehlgeschlagen: ${statusDetail(entry)}`,
            "Bei Speicherfehlern eine kleinere Auflösung wählen.",
          );
        }
        return entry;
      }
      await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())), opts.signal);
    }
  }

  async function viewImage(image: ComfyImageRef, signal?: AbortSignal): Promise<Buffer> {
    const query = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder,
      type: image.type,
    });
    const response = await request(
      `/view?${query.toString()}`,
      undefined,
      POLL_REQUEST_TIMEOUT_MS,
      signal,
    );
    if (!response.ok) {
      throw comfyError("generation", `ComfyUI lieferte das Bild nicht (HTTP ${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  return {
    async health(): Promise<ImageProviderHealth> {
      const models = {
        diffusionModel: config.diffusionModel,
        textEncoder: config.textEncoder,
        vae: config.vae,
      };
      try {
        const stats = (await json("/system_stats", undefined, HEALTH_TIMEOUT_MS)) as {
          system?: { comfyui_version?: string };
        };
        const version = stats.system?.comfyui_version;
        const present = await probeModels();
        const missing = present
          ? (Object.entries(present) as [keyof typeof present, boolean][])
              .filter(([, found]) => !found)
              .map(([key]) => key)
          : [];
        if (missing.length > 0) {
          return {
            ok: false,
            built: true,
            detail: `ComfyUI erreichbar, aber Modelle fehlen: ${missing.join(", ")} — Dateinamen in den Einstellungen prüfen.`,
            models: { ...models, ...(present ? { present } : {}) },
          };
        }
        return {
          ok: true,
          built: true,
          detail: version === undefined ? "ComfyUI erreichbar" : `ComfyUI ${version} erreichbar`,
          models: { ...models, ...(present ? { present } : {}) },
        };
      } catch (error) {
        return {
          ok: false,
          built: true,
          detail: errorMessage(error),
          models,
        };
      }
    },

    async generate(
      req: ImageGenerationRequest,
      opts: ImageGenerateOptions,
    ): Promise<ImageGenerationResult> {
      validateImageRequest("comfyui", req, config.maxPixels);
      const seed = req.seed ?? randomInt(0, 2 ** 32);
      const graph = buildQwenGraph(config, {
        prompt: req.prompt,
        width: req.width,
        height: req.height,
        steps: req.steps,
        seed,
      });
      const submitted = (await json(
        "/prompt",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: graph, client_id: randomUUID() }),
        },
        Math.min(SUBMIT_TIMEOUT_MS, Math.max(1_000, opts.timeoutMs)),
        opts.signal,
      )) as { prompt_id?: string; node_errors?: Record<string, unknown> };
      const nodeErrors = submitted.node_errors ?? {};
      if (Object.keys(nodeErrors).length > 0) {
        throw comfyError(
          "generation",
          `ComfyUI lehnte den Graph ab: ${JSON.stringify(nodeErrors).slice(0, 300)}`,
        );
      }
      const promptId = submitted.prompt_id;
      if (typeof promptId !== "string" || promptId === "") {
        throw comfyError("generation", "ComfyUI lieferte keine prompt_id");
      }
      // Persisted by the worker right after the submit: a crash resumes this
      // run instead of queueing a second one.
      await opts.onJobId?.(promptId);
      const entry = await waitForHistory(promptId, opts);
      const bytes = await viewImage(firstImageOf(entry), opts.signal);
      return { bytes, mime: "image/png", width: req.width, height: req.height, seed };
    },

    async resume(
      providerJobId: string,
      opts: ImageGenerateOptions,
    ): Promise<ImageGenerationResult> {
      const entry = await waitForHistory(providerJobId, opts);
      const bytes = await viewImage(firstImageOf(entry), opts.signal);
      // The requested size is not part of a resumed run: read it back from the
      // PNG header (the media pipeline does the same when committing).
      const dimensions = imageDimensions(bytes, "image/png");
      return {
        bytes,
        mime: "image/png",
        width: dimensions?.width ?? 0,
        height: dimensions?.height ?? 0,
        seed: seedOfHistory(entry),
      };
    },
  };
}
