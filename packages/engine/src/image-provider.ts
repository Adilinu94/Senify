import { SenifyError } from "@senify/core";

// Image generation as a provider chain (ADR-0008): a custom HTTP endpoint
// (operator's own API key), image-use (ChatGPT subscription) and ComfyUI +
// Qwen-Image-2.1 (the local last resort) - configurable in the settings. Every
// provider answers the same two calls, so the worker (S2) walks the chain
// without knowing the transport.

export type ImageGenerationRequest = {
  prompt: string;
  // Multiples of 32 (Qwen-Image-2.1 requirement).
  width: number;
  height: number;
  steps: number;
  seed?: number;
};

export type ImageGenerationResult = {
  bytes: Buffer;
  mime: "image/png";
  width: number;
  height: number;
  seed: number;
};

export type ImageProviderHealth = {
  ok: boolean;
  // false while a provider is not implemented yet (image-use until S6): the
  // tool stays visible, the failure stays a clean state, never a crash.
  built: boolean;
  detail?: string;
  models?: {
    diffusionModel: string;
    textEncoder: string;
    vae: string;
    // Best effort: whether ComfyUI lists the configured files. Absent when
    // the object_info probe was not possible.
    present?: Record<"diffusionModel" | "textEncoder" | "vae", boolean>;
  };
};

export type ImageGenerateOptions = {
  timeoutMs: number;
  signal?: AbortSignal;
  // Called with the provider's own job id right after a successful submit, so
  // the worker can persist it and resume after a crash instead of submitting a
  // second run.
  onJobId?: (providerJobId: string) => void | Promise<void>;
};

export type ImageProvider = {
  health(): Promise<ImageProviderHealth>;
  generate(
    req: ImageGenerationRequest,
    opts: ImageGenerateOptions,
  ): Promise<ImageGenerationResult>;
  // Optional: pick up an externally running job (crash recovery). The provider
  // returns the finished result; without this method the worker starts over.
  resume?(
    providerJobId: string,
    opts: ImageGenerateOptions,
  ): Promise<ImageGenerationResult>;
};

// Why an attempt failed. The worker (S2) maps these kinds onto the fallback
// rules: quota/unavailable/refusal/timeout fall back, invalid input fails the
// job without a second provider.
export type ImageProviderFailureKind =
  | "quota"
  | "unavailable"
  | "refusal"
  | "timeout"
  | "aborted"
  | "generation"
  | "invalid_input";

export class ImageProviderError extends SenifyError {
  readonly kind: ImageProviderFailureKind;
  readonly provider: string;

  constructor(
    provider: string,
    kind: ImageProviderFailureKind,
    message: string,
    options: { suggestion?: string } = {},
  ) {
    super("validation", message, {
      field: `image.${provider}`,
      ...(options.suggestion === undefined
        ? {}
        : { suggestion: options.suggestion }),
    });
    this.name = "ImageProviderError";
    this.provider = provider;
    this.kind = kind;
  }
}

// Provider-neutral input check: an invalid request must never burn a provider
// attempt (and never trigger the fallback).
export function validateImageRequest(
  provider: string,
  req: ImageGenerationRequest,
  maxPixels: number,
): void {
  if (req.prompt.trim() === "") {
    throw new ImageProviderError(provider, "invalid_input", "Prompt must not be empty", {
      suggestion: "Send a non-empty prompt (or a referenceId with a stored recipe).",
    });
  }
  if (req.width <= 0 || req.height <= 0) {
    throw new ImageProviderError(provider, "invalid_input", "Width and height must be positive", {
      suggestion: "Use positive multiples of 32.",
    });
  }
  if (req.width % 32 !== 0 || req.height % 32 !== 0) {
    throw new ImageProviderError(
      provider,
      "invalid_input",
      `Width and height must be multiples of 32 (got ${req.width}x${req.height})`,
      { suggestion: "Round the size to the nearest multiple of 32." },
    );
  }
  if (req.width * req.height > maxPixels) {
    throw new ImageProviderError(
      provider,
      "invalid_input",
      `Image size ${req.width}x${req.height} exceeds the pixel cap of ${maxPixels}`,
      {
        suggestion:
          "Shrink the size or raise image.maxPixels in the settings (the local fallback is slow at large sizes).",
      },
    );
  }
  if (req.steps <= 0) {
    throw new ImageProviderError(provider, "invalid_input", "Steps must be positive", {
      suggestion: "Use the configured defaultSteps.",
    });
  }
}
