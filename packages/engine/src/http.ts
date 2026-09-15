import {
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { SenifyError } from "@senify/core";
import type { Registry } from "@senify/section-sdk";
import { newEntityId } from "./ids.ts";
import { PageLocks } from "./locks.ts";
import { applyMutations } from "./mutations/apply.ts";
import {
  CreatePageBodySchema,
  CreateSiteBodySchema,
  parseApplyMutationsBody,
  parseBody,
  type ApplyMutationsBody,
  type CreatePageBody,
  type CreateSiteBody,
} from "./mutations/contract.ts";
import { draftConflictError } from "./paths.ts";
import { Store } from "./store.ts";

const BODY_LIMIT_BYTES = 1024 * 1024;

export type EngineContext = {
  store: Store;
  registry: Registry;
  locks: PageLocks;
};

type RouteResult = {
  status: number;
  body?: unknown;
};

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

function sendJson(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res: ServerResponse, error: unknown): void {
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
  handler: (
    context: EngineContext,
    params: RouteParams,
    req: IncomingMessage,
    url: URL,
  ) => Promise<RouteResult>;
};

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
    handler: async () => ({ status: 200, body: { ok: true, version: "0.1.0" } }),
  },
  {
    method: "POST",
    segments: ["api", "sites"],
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
    handler: async (context) => ({
      status: 200,
      body: { sites: await context.store.listSites() },
    }),
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId"],
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return { status: 200, body: await context.store.getSite(siteId) };
    },
  },
  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId"],
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
    handler: async (context, params) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      return { status: 200, body: { pages: await context.store.listPages(siteId) } };
    },
  },
  {
    method: "GET",
    segments: ["api", "pages", ":pageId"],
    handler: async (context, params) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      return { status: 200, body: await context.store.getPage(pageId) };
    },
  },
  {
    method: "DELETE",
    segments: ["api", "pages", ":pageId"],
    handler: async (context, params) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      await context.store.deletePage(pageId);
      return { status: 204 };
    },
  },
  {
    method: "POST",
    segments: ["api", "pages", ":pageId", "mutations"],
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
];

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
  for (const route of ROUTES) {
    const params = matchRoute(route, method, segments);
    if (params) {
      const result = await route.handler(context, params, req, url);
      sendJson(res, result.status, result.body);
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
