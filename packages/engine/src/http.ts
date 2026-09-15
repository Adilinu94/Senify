import {
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { SenifyError } from "@senify/core";
import type { Registry } from "@senify/section-sdk";
import {
  AuthError,
  CreateTokenBodySchema,
  hashToken,
  McpAuditBodySchema,
  parseBearer,
  parseExpires,
  redactArgs,
  type CreateTokenBody,
  type McpAuditBody,
} from "./auth.ts";
import { newEntityId } from "./ids.ts";
import { PageLocks } from "./locks.ts";
import { applyMutations } from "./mutations/apply.ts";
import {
  CreatePageBodySchema,
  CreateSiteBodySchema,
  parseApplyMutationsBody,
  parseBody,
  UpdateThemeBodySchema,
  type ApplyMutationsBody,
  type CreatePageBody,
  type CreateSiteBody,
  type UpdateThemeBody,
} from "./mutations/contract.ts";
import { draftConflictError } from "./paths.ts";
import { RateLimiter, RateLimitError } from "./rate-limit.ts";
import { hardGuardrailsForTree } from "./guardrails.ts";
import {
  DuplicateSiteBodySchema,
  RenameSiteBodySchema,
  SiteEventBodySchema,
  type DuplicateSiteBody,
  type RenameSiteBody,
  type SiteEventBody,
} from "./site-contract.ts";
import {
  approveReview,
  createPreview,
  discardReview,
  expirePreviews,
  publishRelease,
  requestChanges,
  resolvePreviewFile,
  restoreRevisionAsDraft,
  submitReview,
  type LifecycleContext,
} from "./lifecycle.ts";
import {
  CreatePreviewBodySchema,
  PublishReleaseBodySchema,
  RestoreRevisionBodySchema,
  ReviewActionBodySchema,
  SubmitReviewBodySchema,
  type CreatePreviewBody,
  type PublishReleaseBody,
  type RestoreRevisionBody,
  type ReviewActionBody,
  type SubmitReviewBody,
} from "./lifecycle-contract.ts";
import { Store } from "./store.ts";
import {
  createCollection,
  createCollectionFromFields,
  createEntry,
  listEntries,
  publishEntry,
  purgeEntry,
  resolveEntryPath,
  restoreEntryFromTrash,
  restoreEntryVersionAsDraft,
  searchEntries,
  tickScheduledEntries,
  trashEntry,
  unpublishEntry,
  updateCollection,
  updateEntry,
} from "./content.ts";
import {
  CreateCollectionBodySchema,
  CreateEntryBodySchema,
  EntryActionBodySchema,
  EntryTickBodySchema,
  FromFieldsBodySchema,
  PublishEntryBodySchema,
  SearchEntriesBodySchema,
  UpdateCollectionBodySchema,
  UpdateEntryBodySchema,
  parseEntryListFilters,
  type CreateCollectionBody,
  type CreateEntryBody,
  type EntryActionBody,
  type EntryTickBody,
  type PublishEntryBody,
  type SearchEntriesBody,
  type UpdateCollectionBody,
  type UpdateEntryBody,
} from "./content-contract.ts";
import {
  PutPageTemplateBodySchema,
  type PutPageTemplateBody,
} from "./templates-contract.ts";
import { putPageTemplate } from "./templates.ts";
import {
  applyAssetPatch,
  bulkAssets,
  commitUpload,
  createAssetFolder,
  createUploadTicket,
  parseAssetListFilters,
  purgeAsset,
  queryAssets,
  restoreAssetHistory,
  AssetPatchBodySchema,
  BulkAssetsBodySchema,
  CreateAssetFolderBodySchema,
  UploadUrlBodySchema,
  type AssetPatchBody,
  type BulkAssetsBody,
  type CreateAssetFolderBody,
  type MediaContext,
  type UploadSigner,
  type UploadUrlBody,
} from "./media.ts";
import { resolveStoredFile, storedFileName } from "./storage.ts";
import { buildThemeReport } from "./theme-report.ts";
import type { ReviewStatus, TokenScope } from "./types.ts";
import { REVIEW_STATUSES } from "./types.ts";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname } from "node:path";

const BODY_LIMIT_BYTES = 1024 * 1024;

export type EngineContext = {
  store: Store;
  registry: Registry;
  locks: PageLocks;
  rateLimiter: RateLimiter;
  dataDir: string;
  maxUploadBytes: number;
  uploadSigner: UploadSigner;
};

function lifecycleContext(context: EngineContext): LifecycleContext {
  return { store: context.store, dataDir: context.dataDir };
}

function mediaContext(context: EngineContext): MediaContext {
  return {
    store: context.store,
    dataDir: context.dataDir,
    maxUploadBytes: context.maxUploadBytes,
  };
}

type AuthInfo = {
  tokenId: string;
  tokenName: string;
  scopes: TokenScope[];
};

type RouteResult = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  file?: {
    path: string;
    contentType?: string;
    headers?: Record<string, string>;
  };
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function sendFile(
  res: ServerResponse,
  file: {
    path: string;
    contentType?: string;
    headers?: Record<string, string>;
  },
): void {
  if (!existsSync(file.path) || !statSync(file.path).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const contentType =
    file.contentType ??
    CONTENT_TYPES[extname(file.path).toLowerCase()] ??
    "application/octet-stream";
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": statSync(file.path).size,
    ...(file.headers ?? {}),
  });
  createReadStream(file.path).pipe(res);
}

function statusFor(error: SenifyError): number {
  switch (error.category) {
    case "validation":
      return 400;
    case "guardrail":
      return 422;
    case "conflict":
      return 409;
    case "auth":
      return 403;
    case "not_found":
      return 404;
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): void {
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof RateLimitError) {
    sendJson(
      res,
      429,
      {
        error: {
          category: error.category,
          message: error.message,
          ...(error.suggestion !== undefined
            ? { suggestion: error.suggestion }
            : {}),
        },
      },
      { "retry-after": String(error.retryAfterSeconds) },
    );
    return;
  }
  if (error instanceof AuthError) {
    sendJson(res, error.status, {
      error: {
        category: error.category,
        message: error.message,
        ...(error.field !== undefined ? { field: error.field } : {}),
        ...(error.suggestion !== undefined
          ? { suggestion: error.suggestion }
          : {}),
      },
    });
    return;
  }
  if (error instanceof SenifyError) {
    sendJson(res, statusFor(error), {
      error: {
        category: error.category,
        message: error.message,
        ...(error.opIndex !== undefined ? { opIndex: error.opIndex } : {}),
        ...(error.field !== undefined ? { field: error.field } : {}),
        ...(error.suggestion !== undefined
          ? { suggestion: error.suggestion }
          : {}),
      },
    });
    return;
  }
  console.error("[engine] unexpected error", error);
  sendJson(res, 500, {
    error: {
      category: "internal",
      message: "Internal engine error",
    },
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > BODY_LIMIT_BYTES) {
      throw new SenifyError("validation", "Request body exceeds 1 MB", {
        suggestion: "Split large batches into smaller mutation requests.",
      });
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SenifyError("validation", "Request body must be valid JSON", {
      suggestion: "Send a JSON object with the documented fields.",
    });
  }
}

// Upload bodies are raw bytes, not JSON: they get their own cap instead of the
// 1 MB JSON limit.
async function readRawBody(
  req: IncomingMessage,
  limitBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > limitBytes) {
      throw new SenifyError(
        "validation",
        `File exceeds the upload limit of ${limitBytes} bytes`,
        {
          field: "file",
          suggestion: "Shrink the file or raise the engine limit (maxUploadBytes).",
        },
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function applyMutationsToPage(
  context: EngineContext,
  pageId: string,
  input: ApplyMutationsBody,
): Promise<RouteResult["body"]> {
  return context.locks.run(pageId, async () => {
    const page = await context.store.getPage(pageId);
    if (input.baseDraftVersion !== page.draftVersion) {
      throw draftConflictError(input.baseDraftVersion, page.draftVersion);
    }
    const outcome = applyMutations({
      registry: context.registry,
      tree: page.draft,
      mutations: input.mutations,
      previousTitle: page.title,
      previousPath: page.path,
    });
    // Hard guardrails block the whole batch: nothing is written on a violation.
    const guardrails = hardGuardrailsForTree(outcome.tree);
    if (guardrails.length > 0) {
      const first = guardrails[0];
      if (first) {
        throw new SenifyError("guardrail", first.message, {
          field: first.field,
          suggestion: first.suggestion,
        });
      }
    }
    // No-op batches (every undo patch empty) change nothing: no version
    // bump, no audit — same response contract as dry_run (undoBatchId null).
    const touched = outcome.results.some(
      (result) => result.undoPatch.length > 0,
    );
    if (input.dry_run === true || !touched) {
      if (outcome.page.path !== page.path) {
        try {
          await context.store.assertPathFree(
            page.siteId,
            page.id,
            outcome.page.path,
          );
        } catch (error) {
          if (error instanceof SenifyError) {
            throw withPathOpIndex(error, pathOpIndex(input));
          }
          throw error;
        }
      }
      return {
        newDraftVersion: page.draftVersion,
        undoBatchId: null,
        warnings: outcome.warnings,
        results: outcome.results,
      };
    }
    const batchId = newEntityId();
    let newVersion: number;
    try {
      newVersion = await context.store.persistBatch({
        pageId: page.id,
        expectedVersion: page.draftVersion,
        draft: outcome.tree,
        title: outcome.page.title,
        path: outcome.page.path,
        entries: outcome.results.map((result) => {
          const source = input.mutations[result.opIndex];
          if (!source) {
            throw new Error("Internal error: result without source mutation");
          }
          return {
            siteId: page.siteId,
            pageId: page.id,
            batchId,
            opIndex: result.opIndex,
            mutation: result.op,
            params: { ...source } as Record<string, unknown>,
            author: input.author,
            undoPatch: result.undoPatch,
            draftVersionAfter: 0,
          };
        }),
      });
    } catch (error) {
      if (error instanceof SenifyError) {
        throw withPathOpIndex(error, pathOpIndex(input));
      }
      throw error;
    }
    return {
      newDraftVersion: newVersion,
      undoBatchId: batchId,
      warnings: outcome.warnings,
      results: outcome.results,
    };
  });
}

function pathOpIndex(input: ApplyMutationsBody): number | undefined {
  let found: number | undefined;
  input.mutations.forEach((mutation, index) => {
    if (mutation.op === "updatePageMeta" && mutation.path !== undefined) {
      found = index;
    }
  });
  return found;
}

function withPathOpIndex(
  error: SenifyError,
  opIndex: number | undefined,
): SenifyError {
  if (
    opIndex === undefined ||
    error.opIndex !== undefined ||
    error.field !== "path"
  ) {
    return error;
  }
  return new SenifyError(error.category, error.message, {
    field: `mutations[${opIndex}].path`,
    suggestion: error.suggestion,
    opIndex,
  });
}

type RouteParams = Record<string, string>;

type Route = {
  method: string;
  segments: string[];
  // Local operator routes (token management) work without a bearer token:
  // the CLI runs on the same machine and bootstraps the first token here.
  public?: boolean;
  scope?: TokenScope;
  destructive?: boolean;
  handler: (
    context: EngineContext,
    params: RouteParams,
    req: IncomingMessage,
    url: URL,
    auth: AuthInfo | undefined,
  ) => Promise<RouteResult>;
};

async function authenticate(
  context: EngineContext,
  req: IncomingMessage,
  route: Route,
): Promise<AuthInfo | undefined> {
  if (route.public === true) return undefined;
  const secret = parseBearer(req.headers.authorization);
  if (!secret) {
    throw new AuthError(401, "Missing bearer token", {
      suggestion:
        'Create a token with `senify tokens create --name "<client>" --scopes read,write` and send it as `Authorization: Bearer <token>`.',
    });
  }
  const record = await context.store.findTokenByHash(hashToken(secret));
  if (!record || record.revokedAt !== null) {
    throw new AuthError(401, "Token is unknown or revoked", {
      suggestion:
        "Create a new token (`senify tokens create`) or check `senify tokens list`.",
    });
  }
  if (record.expiresAt !== null && Date.parse(record.expiresAt) <= Date.now()) {
    throw new AuthError(401, `Token "${record.name}" expired on ${record.expiresAt}`, {
      suggestion: "Create a new token with `senify tokens create`.",
    });
  }
  const required: TokenScope = route.scope ?? "read";
  if (!record.scopes.includes(required)) {
    const suggested = [...new Set([...record.scopes, required])].join(",");
    throw new AuthError(403, `Missing scope "${required}"`, {
      suggestion: `Create a token with the "${required}" scope: senify tokens create --name "<client>" --scopes ${suggested}`,
    });
  }
  context.rateLimiter.check(record.id, route.destructive === true);
  await context.store.touchToken(record.id);
  return { tokenId: record.id, tokenName: record.name, scopes: record.scopes };
}

function matchRoute(route: Route, method: string, segments: string[]): RouteParams | undefined {
  if (route.method !== method) return undefined;
  if (route.segments.length !== segments.length) return undefined;
  const params: RouteParams = {};
  for (let index = 0; index < route.segments.length; index += 1) {
    const pattern = route.segments[index];
    const actual = segments[index];
    if (pattern === undefined || actual === undefined) return undefined;
    if (pattern.startsWith(":")) {
      try {
        params[pattern.slice(1)] = decodeURIComponent(actual);
      } catch {
        throw new SenifyError(
          "validation",
          `Invalid URL encoding in path segment "${actual}"`,
          { suggestion: "Use percent-encoded UTF-8 path segments." },
        );
      }
    } else if (pattern !== actual) {
      return undefined;
    }
  }
  return params;
}

const ROUTES: Route[] = [
  {
    method: "GET",
    segments: ["api", "health"],
    public: true,
    handler: async () => ({ status: 200, body: { ok: true, version: "0.1.0" } }),
  },
  {
    method: "POST",
    segments: ["api", "sites"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const siteBody = parseBody<CreateSiteBody>(CreateSiteBodySchema, body, "site");
      const site = await context.store.createSite(siteBody);
      return { status: 201, body: site };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const trash = url.searchParams.get("trash");
      if (trash === "1" || trash === "true") {
        return {
          status: 200,
          body: { sites: await context.store.listTrashedSites() },
        };
      }
      return {
        status: 200,
        body: { sites: await context.store.listSites() },
      };
    },
  },
  {
    method: "PATCH",
    segments: ["api", "sites", ":siteId"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<RenameSiteBody>(
        RenameSiteBodySchema,
        body,
        "site rename",
      );
      const site = await context.store.renameSite(siteId, parsed.name);
      await context.store.recordSiteEvent({
        siteId,
        mutation: "rename_site",
        params: { name: parsed.name },
        author: parsed.author,
      });
      return { status: 200, body: site };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "trash"],
    scope: "publish",
    destructive: true,
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<SiteEventBody>(
        SiteEventBodySchema,
        body,
        "site trash",
      );
      const site = await context.store.trashSite(siteId);
      await context.store.recordSiteEvent({
        siteId,
        mutation: "trash_site",
        params: {},
        author: parsed.author,
      });
      return { status: 200, body: site };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "restore"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<SiteEventBody>(
        SiteEventBodySchema,
        body,
        "site restore",
      );
      const site = await context.store.restoreSite(siteId);
      await context.store.recordSiteEvent({
        siteId,
        mutation: "restore_site",
        params: {},
        author: parsed.author,
      });
      return { status: 200, body: site };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "duplicate"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<DuplicateSiteBody>(
        DuplicateSiteBodySchema,
        body,
        "site duplicate",
      );
      const site = await context.store.duplicateSite(siteId, {
        withContent: parsed.withContent ?? false,
        author: parsed.author,
      });
      return { status: 201, body: site };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return { status: 200, body: await context.store.getSite(siteId) };
    },
  },
  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId"],
    scope: "publish",
    destructive: true,
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      await context.store.deleteSite(siteId);
      return { status: 204 };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "pages"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const body = (await readJsonBody(req)) ?? {};
      const pageBody = parseBody<CreatePageBody>(CreatePageBodySchema, body, "page");
      const page = await context.store.createPage(siteId, pageBody);
      return { status: 201, body: page };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "pages"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return { status: 200, body: { pages: await context.store.listPages(siteId) } };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "theme"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return { status: 200, body: await context.store.getTheme(siteId) };
    },
  },
  {
    method: "PUT",
    segments: ["api", "sites", ":siteId", "theme"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const body = (await readJsonBody(req)) ?? {};
      const themeBody = parseBody<UpdateThemeBody>(UpdateThemeBodySchema, body, "theme update");
      const updated = await context.store.updateTheme(
        siteId,
        themeBody.theme,
        themeBody.author,
      );
      return { status: 200, body: updated };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "theme", "report"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return {
        status: 200,
        body: await buildThemeReport({
          store: context.store,
          registry: context.registry,
          siteId,
        }),
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "pages", ":pageId"],
    scope: "read",
    handler: async (context, params) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      return { status: 200, body: await context.store.getPage(pageId) };
    },
  },
  {
    method: "DELETE",
    segments: ["api", "pages", ":pageId"],
    scope: "publish",
    destructive: true,
    handler: async (context, params) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      await context.store.deletePage(pageId);
      return { status: 204 };
    },
  },
  {
    // Marks a page as layout/collection template or picks its layout
    // (artifacts/23 §1); template pages never get an own route.
    method: "PUT",
    segments: ["api", "pages", ":pageId", "template"],
    scope: "write",
    handler: async (context, params, req) => {
      const pageId = requireParam(params, "pageId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<PutPageTemplateBody>(
        PutPageTemplateBodySchema,
        body,
        "page template",
      );
      return {
        status: 200,
        body: await putPageTemplate(context.store, { pageId, body: input }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "pages", ":pageId", "mutations"],
    scope: "write",
    handler: async (context, params, req) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      const body = await readJsonBody(req);
      const input: ApplyMutationsBody = parseApplyMutationsBody(body);
      const result = await applyMutationsToPage(context, pageId, input);
      return { status: 200, body: result };
    },
  },
  {
    method: "GET",
    segments: ["api", "pages", ":pageId", "audit"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      await context.store.getPage(pageId);
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit)) {
        throw new SenifyError("validation", "Audit limit must be an integer", {
          field: "limit",
        });
      }
      // Out-of-range limits are clamped (1..500) rather than rejected:
      // pagination stays total, the store documents the bounds.
      return {
        status: 200,
        body: { entries: await context.store.listAudit(pageId, limit) },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "audit"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      await context.store.getSite(siteId);
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit)) {
        throw new SenifyError("validation", "Audit limit must be an integer", {
          field: "limit",
        });
      }
      // Site-wide activity log: pages, themes, assets and content writes.
      return {
        status: 200,
        body: { entries: await context.store.listSiteAudit(siteId, limit) },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "tokens"],
    public: true,
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateTokenBody>(
        CreateTokenBodySchema,
        body,
        "token",
      );
      const created = await context.store.createToken({
        name: input.name,
        scopes: input.scopes ?? ["read", "write"],
        expiresAt: parseExpires(input.expires),
      });
      return {
        status: 201,
        body: {
          token: created.token,
          secret: created.secret,
          hint: "Store the secret now — it is shown only once.",
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "tokens"],
    public: true,
    handler: async (context) => ({
      status: 200,
      body: { tokens: await context.store.listTokens() },
    }),
  },
  {
    method: "DELETE",
    segments: ["api", "tokens", ":tokenId"],
    public: true,
    handler: async (context, params) => {
      const tokenId = params.tokenId;
      if (!tokenId) {
        throw new SenifyError("validation", "Missing token id", {
          field: "tokenId",
        });
      }
      await context.store.revokeToken(tokenId);
      return { status: 204 };
    },
  },
  {
    method: "GET",
    segments: ["api", "whoami"],
    scope: "read",
    handler: async (context, _params, _req, _url, auth) => {
      if (!auth) throw new SenifyError("auth", "Missing bearer token");
      const token = await context.store.getToken(auth.tokenId);
      return {
        status: 200,
        body: {
          name: token.name,
          scopes: token.scopes,
          prefix: token.prefix,
          createdAt: token.createdAt,
          expiresAt: token.expiresAt,
          lastUsedAt: token.lastUsedAt,
        },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "mcp", "audit"],
    scope: "read",
    handler: async (context, _params, req, _url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<McpAuditBody>(
        McpAuditBodySchema,
        body,
        "mcp audit entry",
      );
      const entry = await context.store.appendMcpAudit({
        tokenId: auth?.tokenId ?? null,
        client: input.client ?? auth?.tokenName ?? "unknown",
        tool: input.tool,
        args: redactArgs(input.args),
        result: input.result,
        entity: input.entity ?? null,
        durationMs: Math.round(input.durationMs ?? 0),
      });
      return { status: 201, body: entry };
    },
  },
  {
    method: "GET",
    segments: ["api", "mcp", "audit"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number.parseInt(rawLimit, 10);
      if (!Number.isInteger(limit)) {
        throw new SenifyError("validation", "Audit limit must be an integer", {
          field: "limit",
        });
      }
      return {
        status: 200,
        body: { entries: await context.store.listMcpAudit(limit) },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "releases"],
    scope: "publish",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<PublishReleaseBody>(
        PublishReleaseBodySchema,
        body,
        "release",
      );
      const result = await publishRelease(lifecycleContext(context), {
        siteId,
        author: input.author,
        note: input.note ?? null,
        basisReleaseId: input.basisReleaseId ?? null,
      });
      return { status: 201, body: result };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "releases"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: {
          releases: await context.store.listReleases(siteId),
          activeReleaseId: await context.store.getActiveReleaseId(siteId),
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "releases", ":releaseId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getRelease(requireParam(params, "releaseId")),
    }),
  },
  {
    method: "GET",
    segments: ["api", "pages", ":pageId", "revisions"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        revisions: await context.store.listRevisions(
          requireParam(params, "pageId"),
        ),
      },
    }),
  },
  {
    method: "GET",
    segments: ["api", "revisions", ":revisionId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getRevision(requireParam(params, "revisionId")),
    }),
  },
  {
    method: "POST",
    segments: ["api", "pages", ":pageId", "restore"],
    scope: "write",
    handler: async (context, params, req) => {
      const pageId = requireParam(params, "pageId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<RestoreRevisionBody>(
        RestoreRevisionBodySchema,
        body,
        "restore",
      );
      return {
        status: 200,
        body: await restoreRevisionAsDraft(lifecycleContext(context), {
          pageId,
          revisionId: input.revisionId,
          author: input.author,
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "previews"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreatePreviewBody>(
        CreatePreviewBodySchema,
        body,
        "preview",
      );
      const preview = await createPreview(lifecycleContext(context), {
        siteId,
        author: input.author,
        ttlDays: input.ttlDays,
      });
      return {
        status: 201,
        body: {
          preview,
          url: `/api/previews/${preview.id}/files/index.html?token=${preview.token}`,
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "previews"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const expired = await expirePreviews(lifecycleContext(context), siteId);
      return {
        status: 200,
        body: {
          previews: await context.store.listPreviews(siteId),
          expired,
        },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "reviews"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<SubmitReviewBody>(
        SubmitReviewBodySchema,
        body,
        "review",
      );
      const result = await submitReview(lifecycleContext(context), {
        siteId,
        author: input.author,
        note: input.note ?? null,
        pageIds: input.pageIds,
      });
      return {
        status: 201,
        body: {
          review: result.review,
          preview: result.preview,
          checks: result.checks,
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "reviews"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const statusParam = url.searchParams.get("status");
      if (statusParam !== null && !REVIEW_STATUSES.includes(statusParam as ReviewStatus)) {
        throw new SenifyError("validation", `Unknown review status "${statusParam}"`, {
          field: "status",
          suggestion: `Use one of: ${REVIEW_STATUSES.join(", ")}.`,
        });
      }
      return {
        status: 200,
        body: {
          reviews: await context.store.listReviewItems(siteId, {
            ...(statusParam === null
              ? {}
              : { status: statusParam as ReviewStatus }),
          }),
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "reviews", ":reviewId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getReviewItem(requireParam(params, "reviewId")),
    }),
  },
  {
    method: "POST",
    segments: ["api", "reviews", ":reviewId", "approve"],
    scope: "publish",
    handler: async (context, params, req) => {
      const reviewId = requireParam(params, "reviewId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ReviewActionBody>(
        ReviewActionBodySchema,
        body,
        "review action",
      );
      return {
        status: 200,
        body: await approveReview(lifecycleContext(context), {
          reviewId,
          author: input.author,
          note: input.note,
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "reviews", ":reviewId", "request-changes"],
    scope: "write",
    handler: async (context, params, req) => {
      const reviewId = requireParam(params, "reviewId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ReviewActionBody>(
        ReviewActionBodySchema,
        body,
        "review action",
      );
      return {
        status: 200,
        body: await requestChanges(lifecycleContext(context), {
          reviewId,
          author: input.author,
          note: input.note ?? "",
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "reviews", ":reviewId", "discard"],
    scope: "write",
    handler: async (context, params, req) => {
      const reviewId = requireParam(params, "reviewId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ReviewActionBody>(
        ReviewActionBodySchema,
        body,
        "review action",
      );
      return {
        status: 200,
        body: await discardReview(lifecycleContext(context), {
          reviewId,
          author: input.author,
          note: input.note,
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "assets", "upload-url"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UploadUrlBody>(
        UploadUrlBodySchema,
        body,
        "upload request",
      );
      const { uploadId, ticket } = await createUploadTicket(mediaContext(context), {
        siteId,
        body: input,
      });
      const token = context.uploadSigner.sign(ticket);
      return {
        status: 201,
        body: {
          uploadId,
          url: `/api/assets/upload/${uploadId}?token=${encodeURIComponent(token)}`,
          expiresAt: ticket.expiresAt,
        },
      };
    },
  },
  {
    method: "PUT",
    segments: ["api", "assets", "upload", ":uploadId"],
    public: true,
    handler: async (context, params, req, url) => {
      const uploadId = requireParam(params, "uploadId");
      const token = url.searchParams.get("token");
      if (token === null) {
        throw new AuthError(401, "Upload token is missing", {
          suggestion: "Use the signed URL returned by the upload-url endpoint.",
        });
      }
      const ticket = context.uploadSigner.verify(token);
      if (!ticket || ticket.uploadId !== uploadId) {
        throw new AuthError(401, "Upload token is invalid", {
          suggestion: "Request a fresh upload URL and retry.",
        });
      }
      if (Date.parse(ticket.expiresAt) <= Date.now()) {
        throw new SenifyError("validation", "Upload URL is expired", {
          field: "uploadId",
          suggestion: "Request a fresh upload URL.",
        });
      }
      const data = await readRawBody(req, context.maxUploadBytes);
      return {
        status: 201,
        body: await commitUpload(mediaContext(context), { ticket, data }),
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "assets"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: {
          assets: await queryAssets(
            context.store,
            siteId,
            parseAssetListFilters(url.searchParams),
          ),
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "assets", ":assetId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getAsset(requireParam(params, "assetId")),
    }),
  },
  {
    method: "PATCH",
    segments: ["api", "assets", ":assetId"],
    scope: "write",
    handler: async (context, params, req) => {
      const assetId = requireParam(params, "assetId");
      const body = (await readJsonBody(req)) ?? {};
      const patch = parseBody<AssetPatchBody>(
        AssetPatchBodySchema,
        body,
        "asset update",
      );
      return {
        status: 200,
        body: await applyAssetPatch(context.store, assetId, patch),
      };
    },
  },
  {
    method: "DELETE",
    segments: ["api", "assets", ":assetId"],
    scope: "write",
    handler: async (context, params) => {
      const assetId = requireParam(params, "assetId");
      // Soft delete: files stay on disk, the record flips to "trashed".
      return {
        status: 200,
        body: await context.store.updateAsset(assetId, {
          status: "trashed",
          trashedAt: new Date().toISOString(),
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "assets", ":assetId", "restore"],
    scope: "write",
    handler: async (context, params) => {
      const assetId = requireParam(params, "assetId");
      return {
        status: 200,
        body: await context.store.updateAsset(assetId, {
          status: "ready",
          trashedAt: null,
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "assets", ":assetId", "purge"],
    scope: "publish",
    destructive: true,
    handler: async (context, params) => {
      const assetId = requireParam(params, "assetId");
      const asset = await purgeAsset(mediaContext(context), assetId);
      return { status: 200, body: { purged: asset.id } };
    },
  },
  {
    method: "GET",
    segments: ["api", "assets", ":assetId", "history"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        history: await context.store.listAssetHistory(
          requireParam(params, "assetId"),
        ),
      },
    }),
  },
  {
    method: "POST",
    segments: ["api", "assets", ":assetId", "restore-history", ":historyId"],
    scope: "write",
    handler: async (context, params) => ({
      status: 200,
      body: await restoreAssetHistory(mediaContext(context), {
        assetId: requireParam(params, "assetId"),
        historyId: requireParam(params, "historyId"),
      }),
    }),
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "assets", "bulk"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<BulkAssetsBody>(
        BulkAssetsBodySchema,
        body,
        "asset bulk request",
      );
      // Bulk is a write route; permanent deletes still need the publish scope.
      const allowPurge = auth?.scopes.includes("publish") === true;
      return {
        status: 200,
        body: await bulkAssets(mediaContext(context), {
          siteId,
          body: input,
          allowPurge,
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "asset-folders"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateAssetFolderBody>(
        CreateAssetFolderBodySchema,
        body,
        "asset folder",
      );
      return {
        status: 201,
        body: await createAssetFolder(mediaContext(context), {
          siteId,
          name: input.name,
          parentId: input.parentId ?? null,
        }),
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "asset-folders"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        folders: await context.store.listAssetFolders(
          requireParam(params, "siteId"),
        ),
      },
    }),
  },
  {
    method: "DELETE",
    segments: ["api", "asset-folders", ":folderId"],
    scope: "write",
    handler: async (context, params) => {
      await context.store.deleteAssetFolder(requireParam(params, "folderId"));
      return { status: 204 };
    },
  },
  {
    // Public asset delivery under the path the bake writes into the build.
    method: "GET",
    segments: ["assets", ":assetId", ":filename"],
    public: true,
    handler: async (context, params) => {
      const asset = await context.store.getAsset(requireParam(params, "assetId"));
      if (asset.status !== "ready") {
        throw new SenifyError("not_found", `Asset "${asset.id}" is in the trash`, {
          field: "assetId",
        });
      }
      const filename = requireParam(params, "filename");
      if (storedFileName(asset.storageRef) !== filename) {
        throw new SenifyError("not_found", `File "${filename}" does not exist`, {
          field: "filename",
        });
      }
      const file = resolveStoredFile(context.dataDir, asset.storageRef);
      if (file === undefined) {
        throw new SenifyError(
          "not_found",
          `File of asset "${asset.id}" is not resolvable`,
          { field: "assetId" },
        );
      }
      // Revalidate: a replace keeps the URL stable, the content must not be
      // served from a stale cache. The type follows the stored MIME, because a
      // replace may swap the file type under the old name.
      return {
        status: 200,
        file: {
          path: file,
          contentType: asset.mime,
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        },
      };
    },
  },
  {
    // Encoded ladder rungs, served under the same path the bake writes them to.
    method: "GET",
    segments: ["assets", ":assetId", "variants", ":filename"],
    public: true,
    handler: async (context, params) => {
      const asset = await context.store.getAsset(requireParam(params, "assetId"));
      if (asset.status !== "ready") {
        throw new SenifyError("not_found", `Asset "${asset.id}" is in the trash`, {
          field: "assetId",
        });
      }
      const filename = requireParam(params, "filename");
      const variant = asset.variants.find(
        (entry) => `${entry.width}.${entry.format}` === filename,
      );
      if (variant === undefined) {
        throw new SenifyError("not_found", `Variant "${filename}" does not exist`, {
          field: "filename",
        });
      }
      const file = resolveStoredFile(context.dataDir, variant.storageRef);
      if (file === undefined) {
        throw new SenifyError(
          "not_found",
          `Variant file of asset "${asset.id}" is not resolvable`,
          { field: "assetId" },
        );
      }
      return {
        status: 200,
        file: {
          path: file,
          contentType: variant.format === "avif" ? "image/avif" : "image/webp",
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        },
      };
    },
  },
  // ------------------------------------------------------- content core (T09)
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "collections"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateCollectionBody>(
        CreateCollectionBodySchema,
        body,
        "collection",
      );
      return {
        status: 201,
        body: await createCollection(context.store, { siteId, body: input }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "collections", "from-fields"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateCollectionBody>(
        FromFieldsBodySchema,
        body,
        "collection from fields",
      );
      return {
        status: 201,
        body: await createCollectionFromFields(context.store, {
          siteId,
          body: input,
        }),
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "collections"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: {
          collections: await context.store.listCollections(siteId, {
            includeDeprecated: url.searchParams.get("includeDeprecated") === "true",
          }),
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "collections", ":collectionId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getCollection(
        requireParam(params, "collectionId"),
      ),
    }),
  },
  {
    method: "PUT",
    segments: ["api", "collections", ":collectionId"],
    scope: "write",
    handler: async (context, params, req) => {
      const collectionId = requireParam(params, "collectionId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateCollectionBody>(
        UpdateCollectionBodySchema,
        body,
        "collection update",
      );
      return {
        status: 200,
        body: await updateCollection(context.store, {
          collectionId,
          body: input,
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "entries"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateEntryBody>(
        CreateEntryBodySchema,
        body,
        "entry",
      );
      return {
        status: 201,
        body: await createEntry(context.store, { siteId, body: input }),
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "entries"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: {
          entries: await listEntries(context.store, {
            siteId,
            filters: parseEntryListFilters(url.searchParams),
          }),
        },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "entries", "search"],
    scope: "read",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<SearchEntriesBody>(
        SearchEntriesBodySchema,
        body,
        "entry search",
      );
      return {
        status: 200,
        body: await searchEntries(context.store, {
          siteId,
          q: input.q,
          ...(input.collectionId === undefined
            ? {}
            : { collectionId: input.collectionId }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        }),
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "entries", "resolve"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const path = url.searchParams.get("path");
      if (path === null || path.trim() === "") {
        throw new SenifyError("validation", "Query parameter \"path\" is missing", {
          field: "path",
          suggestion: "Resolve a path, e.g. ?path=/blog/mein-beitrag.",
        });
      }
      return {
        status: 200,
        body: await resolveEntryPath(context.store, { siteId, path }),
      };
    },
  },
  {
    // Job tick for scheduled entries; a scheduler may scope it to one site.
    method: "POST",
    segments: ["api", "entries", "tick"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<EntryTickBody>(
        EntryTickBodySchema,
        body,
        "entry tick",
      );
      return {
        status: 200,
        body: await tickScheduledEntries(context.store, {
          ...(input.siteId === undefined ? {} : { siteId: input.siteId }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        }),
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "entries", ":entryId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getEntry(requireParam(params, "entryId")),
    }),
  },
  {
    method: "PUT",
    segments: ["api", "entries", ":entryId"],
    scope: "write",
    handler: async (context, params, req) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateEntryBody>(
        UpdateEntryBodySchema,
        body,
        "entry update",
      );
      return {
        status: 200,
        body: await updateEntry(context.store, { entryId, body: input }),
      };
    },
  },
  {
    method: "DELETE",
    segments: ["api", "entries", ":entryId"],
    scope: "write",
    handler: async (context, params, req) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<EntryActionBody>(
        EntryActionBodySchema,
        body,
        "entry action",
      );
      return {
        status: 200,
        body: await trashEntry(context.store, {
          entryId,
          author: input.author,
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "entries", ":entryId", "restore"],
    scope: "write",
    handler: async (context, params, req) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<EntryActionBody>(
        EntryActionBodySchema,
        body,
        "entry restore",
      );
      return {
        status: 200,
        body: await restoreEntryFromTrash(context.store, {
          entryId,
          author: input.author,
        }),
      };
    },
  },
  {
    // Permanent: only into the trash first, and only with the publish scope.
    method: "POST",
    segments: ["api", "entries", ":entryId", "purge"],
    scope: "publish",
    destructive: true,
    handler: async (context, params, req) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<EntryActionBody>(
        EntryActionBodySchema,
        body,
        "entry purge",
      );
      return {
        status: 200,
        body: await purgeEntry(context.store, { entryId, author: input.author }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "entries", ":entryId", "publish"],
    scope: "write",
    handler: async (context, params, req) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<PublishEntryBody>(
        PublishEntryBodySchema,
        body,
        "entry publish",
      );
      return {
        status: 200,
        body: await publishEntry(context.store, {
          entryId,
          author: input.author,
          ...(input.baseVersion === undefined
            ? {}
            : { baseVersion: input.baseVersion }),
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "entries", ":entryId", "unpublish"],
    scope: "write",
    handler: async (context, params, req) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<PublishEntryBody>(
        PublishEntryBodySchema,
        body,
        "entry unpublish",
      );
      return {
        status: 200,
        body: await unpublishEntry(context.store, {
          entryId,
          author: input.author,
          ...(input.baseVersion === undefined
            ? {}
            : { baseVersion: input.baseVersion }),
        }),
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "entries", ":entryId", "versions"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        versions: await context.store.listEntryVersions(
          requireParam(params, "entryId"),
        ),
      },
    }),
  },
  {
    method: "POST",
    segments: ["api", "entries", ":entryId", "restore-version", ":versionId"],
    scope: "write",
    handler: async (context, params, req) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<EntryActionBody>(
        EntryActionBodySchema,
        body,
        "entry version restore",
      );
      return {
        status: 200,
        body: await restoreEntryVersionAsDraft(context.store, {
          entryId,
          versionId: requireParam(params, "versionId"),
          author: input.author,
        }),
      };
    },
  },
];

function requireParam(params: RouteParams, key: string): string {
  const value = params[key];
  if (!value) {
    throw new SenifyError("validation", `Missing ${key}`, { field: key });
  }
  return value;
}

// Preview files are public-by-token: browsers open the signed URL directly,
// so no bearer token is required — the token travels as a query parameter.
async function servePreviewFile(
  context: EngineContext,
  res: ServerResponse,
  previewId: string,
  relativePath: string,
  url: URL,
): Promise<void> {
  let preview;
  try {
    preview = await context.store.getPreview(previewId);
  } catch (error) {
    sendError(res, error);
    return;
  }
  if (url.searchParams.get("token") !== preview.token) {
    sendError(
      res,
      new AuthError(401, "Preview token is missing or invalid", {
        suggestion: "Use the signed preview URL from the review item.",
      }),
    );
    return;
  }
  if (preview.status !== "ready" || Date.parse(preview.expiresAt) <= Date.now()) {
    if (preview.status === "ready") {
      await context.store.markPreviewExpired(preview.id);
    }
    sendError(
      res,
      new SenifyError("not_found", "Preview is expired", {
        suggestion: "Create a new preview.",
      }),
    );
    return;
  }
  const file = resolvePreviewFile(preview, relativePath);
  if (!file) {
    sendError(
      res,
      new SenifyError("validation", "Invalid preview file path", {
        field: "path",
      }),
    );
    return;
  }
  sendFile(res, { path: file });
}

async function handleRequest(
  context: EngineContext,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method ?? "GET";
  let url: URL;
  try {
    url = new URL(req.url ?? "/", "http://engine.local");
  } catch {
    sendError(
      res,
      new SenifyError("validation", "Malformed request URL", {
        suggestion: "Use percent-encoded UTF-8 path segments.",
      }),
    );
    return;
  }
  const segments = url.pathname.split("/").filter((part) => part.length > 0);
  const previewFile = url.pathname.match(
    /^\/api\/previews\/([^/]+)\/files\/(.+)$/,
  );
  if (method === "GET" && previewFile) {
    await servePreviewFile(
      context,
      res,
      decodeURIComponent(previewFile[1] ?? ""),
      decodeURIComponent(previewFile[2] ?? ""),
      url,
    );
    return;
  }
  for (const route of ROUTES) {
    const params = matchRoute(route, method, segments);
    if (params) {
      const auth = await authenticate(context, req, route);
      const result = await route.handler(context, params, req, url, auth);
      if (result.file) {
        sendFile(res, result.file);
        return;
      }
      sendJson(res, result.status, result.body, result.headers);
      return;
    }
  }
  sendError(
    res,
    new SenifyError("not_found", `Route ${method} ${url.pathname} does not exist`),
  );
}

export function createRequestHandler(
  context: EngineContext,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    handleRequest(context, req, res).catch((error: unknown) => {
      sendError(res, error);
    });
  };
}
