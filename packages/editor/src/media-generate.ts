// The "Erzeugen" area of the media window (image generation ticket 04): the
// headless model the shell renders. Form defaults, validation, the job card
// texts and the health hint live here; the HTTP calls and the polling stay in
// the shell (the same seam as every other explorer tab).

export type ImageGenerateForm = {
  prompt: string;
  width: number;
  height: number;
  // Empty string = no reference (the prompt comes from the form).
  referenceId: string;
  altText: string;
  // Comma separated, like the asset metadata field.
  tags: string;
  // Empty string = the site root folder.
  folderId: string;
};

export const DEFAULT_IMAGE_GENERATE_FORM: ImageGenerateForm = {
  prompt: "",
  width: 1024,
  height: 1024,
  referenceId: "",
  altText: "",
  tags: "",
  folderId: "",
};

// The size presets (multiples of 32; the engine validates again).
export const IMAGE_SIZE_PRESETS: readonly {
  label: string;
  width: number;
  height: number;
}[] = [
  { label: "1024 × 1024 (quadratisch)", width: 1024, height: 1024 },
  { label: "1344 × 768 (breit)", width: 1344, height: 768 },
  { label: "768 × 1344 (hoch)", width: 768, height: 1344 },
  { label: "512 × 512 (klein, schneller)", width: 512, height: 512 },
];

export const IMAGE_JOB_POLL_MS = 3_000;

export type ImageJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type ImageJobAttemptView = {
  provider: string;
  kind: string;
  message: string;
  suggestion?: string;
};

export type ImageJobView = {
  id: string;
  status: ImageJobStatus;
  providerUsed: string | null;
  assetId: string | null;
  error: readonly ImageJobAttemptView[];
};

export type ImageHealthView = {
  provider: string;
  fallbackProvider: string;
  providers: Record<
    string,
    { ok: boolean; built: boolean; detail?: string } | null | undefined
  >;
};

export function parseImageTags(value: string): string[] {
  const tags: string[] = [];
  for (const entry of value.split(",")) {
    const tag = entry.trim();
    if (tag !== "" && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

// Null when the form can be sent; otherwise the readable reason.
export function validateImageGenerateForm(form: ImageGenerateForm): string | null {
  if (form.prompt.trim() === "" && form.referenceId === "") {
    return "Prompt fehlt – oder eine Referenz mit Bildrezept wählen.";
  }
  for (const [label, value] of [
    ["Breite", form.width],
    ["Höhe", form.height],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) {
      return `${label} muss eine positive ganze Zahl sein.`;
    }
    if (value % 32 !== 0) {
      return `${label} muss ein Vielfaches von 32 sein.`;
    }
  }
  return null;
}

export function imageJobStatusLabel(job: ImageJobView): string {
  switch (job.status) {
    case "queued":
      return "Wartet";
    case "running":
      return job.providerUsed === null ? "Läuft" : `Läuft · ${job.providerUsed}`;
    case "succeeded":
      return job.providerUsed === null ? "Fertig" : `Fertig · ${job.providerUsed}`;
    case "failed":
      return "Fehlgeschlagen";
    case "canceled":
      return "Abgebrochen";
  }
}

// The readable failure of a failed job: the last attempt plus its suggestion.
// Local-run memory errors get the actionable resolution hint.
export function imageJobErrorText(job: ImageJobView): string | null {
  if (job.status !== "failed") return null;
  const last = job.error[job.error.length - 1];
  if (last === undefined) return "Der Lauf ist fehlgeschlagen – Details fehlen.";
  const base = `${last.provider}: ${last.message}`;
  if (/memory|oom|out of memory|speicher/i.test(last.message)) {
    return `${base} – kleinere Auflösung wählen.`;
  }
  return last.suggestion === undefined ? base : `${base} – ${last.suggestion}`;
}

// A hint when the chain cannot start: disabled, or the primary provider is not
// ready. Null when the chain looks fine (or the health is unknown).
export function imageHealthHint(health: ImageHealthView | null | undefined): string | null {
  if (health === null || health === undefined) return null;
  if (health.provider === "off") {
    return "Bildgenerierung ist deaktiviert – in den Einstellungen einen Provider wählen.";
  }
  const primary = health.providers[health.provider];
  if (primary !== undefined && primary !== null && !primary.ok) {
    const detail = primary.detail === undefined ? "" : ` – ${primary.detail}`;
    return `Provider ${health.provider} ist nicht bereit${detail}`;
  }
  return null;
}

export function imageJobActive(job: ImageJobView | null | undefined): boolean {
  return job !== null && job !== undefined && (job.status === "queued" || job.status === "running");
}

// What the editor hands to the shell when the operator submits the form.
export type ImageGenerateRequest = {
  prompt?: string;
  width: number;
  height: number;
  referenceId?: string;
  altText?: string;
  tags: string[];
  folderId?: string;
};

// The seam to the program shell: it owns the HTTP calls and the polling, the
// editor only renders the form, the job card and the health hint.
export type ImageGenerationBridge = {
  // Current chain health (shell-fetched); null/undefined = unknown.
  health?: () => ImageHealthView | null | undefined;
  // The job the shell is currently polling, if any.
  job?: () => ImageJobView | null | undefined;
  // The references offered for the recipe picker.
  references?: () => readonly { id: string; name: string }[];
  // Starts the job; the shell begins polling right away.
  start: (request: ImageGenerateRequest) => Promise<void>;
  // Cancels a queued job.
  cancel?: (jobId: string) => Promise<void>;
};

// The form turned into the request body: empty optional fields drop out, the
// tags split and trim.
export function imageGenerateRequest(form: ImageGenerateForm): ImageGenerateRequest {
  const prompt = form.prompt.trim();
  const altText = form.altText.trim();
  return {
    ...(prompt === "" ? {} : { prompt }),
    width: form.width,
    height: form.height,
    ...(form.referenceId === "" ? {} : { referenceId: form.referenceId }),
    ...(altText === "" ? {} : { altText }),
    tags: parseImageTags(form.tags),
    ...(form.folderId === "" ? {} : { folderId: form.folderId }),
  };
}
