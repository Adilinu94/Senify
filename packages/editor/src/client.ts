import type { AuthorInput, Mutation } from "@senify/engine";
import { emitBatch, type ActionContext } from "./mutations.ts";
import type {
  ApplyMutationsRequest,
  ApplyMutationsResponse,
  EditorAction,
  EditorTransport,
} from "./types.ts";

export const DRAFT_CONFLICT_MESSAGE = "Draft hat sich geändert — neu laden";

export class DraftConflictError extends Error {
  readonly currentVersion: number | undefined;

  constructor(currentVersion?: number) {
    super(DRAFT_CONFLICT_MESSAGE);
    this.name = "DraftConflictError";
    this.currentVersion = currentVersion;
  }
}

export class EditorRequestError extends Error {
  readonly status: number;
  readonly category: string;
  readonly field: string | undefined;
  readonly suggestion: string | undefined;

  constructor(
    message: string,
    options: {
      status: number;
      category?: string;
      field?: string;
      suggestion?: string;
    },
  ) {
    super(message);
    this.name = "EditorRequestError";
    this.status = options.status;
    this.category = options.category ?? "internal";
    this.field = options.field;
    this.suggestion = options.suggestion;
  }
}

export type FetchResponseLike = {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
};

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponseLike>;

export type HttpTransportOptions = {
  pageId: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  // Called on a 409 before the error is rethrown: the shell reloads the draft.
  onConflict?: (error: DraftConflictError) => void;
};

type ErrorEnvelope = {
  error?: {
    category?: string;
    message?: string;
    field?: string;
    suggestion?: string;
  };
};

function readEnvelope(body: unknown): ErrorEnvelope {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return {};
  return body as ErrorEnvelope;
}

function defaultFetch(): FetchLike {
  const global = globalThis as { fetch?: unknown };
  if (typeof global.fetch !== "function") {
    throw new EditorRequestError("No fetch implementation available", {
      status: 0,
      category: "internal",
    });
  }
  const impl = global.fetch as (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => Promise<FetchResponseLike>;
  return (url, init) => impl(url, init);
}

function parseResponse(body: unknown): ApplyMutationsResponse {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new EditorRequestError("Unexpected mutations response", { status: 200 });
  }
  const payload = body as Partial<ApplyMutationsResponse>;
  if (typeof payload.newDraftVersion !== "number") {
    throw new EditorRequestError("Mutations response is missing newDraftVersion", {
      status: 200,
    });
  }
  return {
    newDraftVersion: payload.newDraftVersion,
    undoBatchId:
      typeof payload.undoBatchId === "string" ? payload.undoBatchId : null,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    results: Array.isArray(payload.results) ? payload.results : [],
  };
}

// Thin adapter over the existing `apply_mutations` endpoint
// (POST /api/pages/:pageId/mutations). The editor only ever writes here.
export function createHttpTransport(
  options: HttpTransportOptions,
): EditorTransport {
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));
  return {
    async apply(request: ApplyMutationsRequest): Promise<ApplyMutationsResponse> {
      const url = `${baseUrl}/api/pages/${encodeURIComponent(options.pageId)}/mutations`;
      const attempt = (): Promise<FetchResponseLike> =>
        fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
      let response = await attempt();
      // The local engine rate-limits bursts of edits (a rejected request never
      // reaches the store). Wait out a short window instead of dropping the
      // user's change on the floor.
      for (let tries = 0; response.status === 429 && tries < 3; tries += 1) {
        const header = response.headers?.get?.("retry-after") ?? null;
        const seconds = header === null ? Number.NaN : Number(header);
        const waitMs =
          Number.isFinite(seconds) && seconds > 0
            ? Math.min(seconds * 1000, 3000)
            : 900 * (tries + 1);
        await wait(waitMs);
        response = await attempt();
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (response.status === 409) {
        const conflict = new DraftConflictError();
        options.onConflict?.(conflict);
        throw conflict;
      }
      if (!response.ok) {
        const envelope = readEnvelope(body);
        throw new EditorRequestError(
          envelope.error?.message ?? `Request failed with status ${response.status}`,
          {
            status: response.status,
            category: envelope.error?.category,
            field: envelope.error?.field,
            suggestion: envelope.error?.suggestion,
          },
        );
      }
      return parseResponse(body);
    },
  };
}

export type MutationsSessionOptions = {
  transport: EditorTransport;
  initialVersion: number;
  author: AuthorInput;
  onVersion?: (version: number) => void;
};

// Keeps the optimistic-locking cursor (`baseVersion`) in one place: every
// batch carries the version the editor last saw, and a success moves it on.
export class MutationsSession {
  readonly #transport: EditorTransport;
  #version: number;
  readonly #author: AuthorInput;
  readonly #onVersion: ((version: number) => void) | undefined;

  constructor(options: MutationsSessionOptions) {
    this.#transport = options.transport;
    this.#version = options.initialVersion;
    this.#author = options.author;
    this.#onVersion = options.onVersion;
  }

  get version(): number {
    return this.#version;
  }

  setVersion(version: number): void {
    this.#version = version;
    this.#onVersion?.(version);
  }

  async apply(
    request: Omit<ApplyMutationsRequest, "baseDraftVersion" | "author">,
  ): Promise<ApplyMutationsResponse> {
    const response = await this.#transport.apply({
      ...request,
      author: this.#author,
      baseDraftVersion: this.#version,
    });
    this.setVersion(response.newDraftVersion);
    return response;
  }

  applyMutations(
    mutations: Mutation[],
    options?: { dryRun?: boolean },
  ): Promise<ApplyMutationsResponse> {
    if (mutations.length === 0) {
      return Promise.resolve({
        newDraftVersion: this.#version,
        undoBatchId: null,
        warnings: [],
        results: [],
      });
    }
    return this.apply({
      mutations,
      ...(options?.dryRun === undefined ? {} : { dry_run: options.dryRun }),
    });
  }

  applyActions(
    actions: readonly EditorAction[],
    context: ActionContext,
    options?: { dryRun?: boolean },
  ): Promise<ApplyMutationsResponse> {
    return this.applyMutations(emitBatch(actions, context), options);
  }
}
