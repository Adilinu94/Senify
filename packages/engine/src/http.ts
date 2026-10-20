import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { SenifyError } from "@senify/core";
import {
  BUILD_ROOT_FILES,
  buildRootFile,
  servePreviewFile,
  serveReleaseFile,
} from "./http-build-files.ts";
import {
  CONTENT_TYPES,
  sendError,
  sendFile,
  sendJson,
  sendRedirect,
  sendText,
} from "./http-response.ts";
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
import { renderEntryPreview } from "./bake.ts";
import {
  parseApplyMutationsBody,
  parseBody,
  type ApplyMutationsBody,
} from "./mutations/contract.ts";
import { parseApplyEditorMutationsBody } from "./mutations/editor-contract.ts";
import { parseUndoBatchBody, undoBatches } from "./undo-batch.ts";
import { motionVendorFiles } from "@senify/renderer";
import {
  approveReview,
  discardReview,
  requestChanges,
  restoreRevisionAsDraft,
} from "./lifecycle.ts";
import {
  RestoreRevisionBodySchema,
  ReviewActionBodySchema,
  type RestoreRevisionBody,
  type ReviewActionBody,
} from "./lifecycle-contract.ts";
import {
  type EngineSettingsPatch,
  type ImageSettingsPatch,
  type SmtpSettingsPatch,
} from "./store.ts";
import { backupStatus, createBackup, listBackups, restoreBackup } from "./backup.ts";
import { reviewVisualFileNames } from "./review-visuals.ts";
import { sendTestMail, smtpMailSender } from "./mailer.ts";
import { createComfyImageProvider } from "./image-comfy.ts";
import { createImageCustomProvider } from "./image-custom.ts";
import { createImageUseProvider } from "./image-use-provider.ts";
import {
  encryptImageApiKey,
  encryptSmtpPassword,
  referenceSettingsPatch,
  resolveCustomApiKey,
  resolveSmtpConfig,
} from "./settings.ts";
import {
  TestMailBodySchema,
  UpdateSettingsBodySchema,
  type TestMailBody,
  type UpdateSettingsBody,
} from "./settings-contract.ts";
import {
  buildSubmissionsCsv,
  confirmNewsletter,
  FormRejection,
  listSubmissions,
  submitForm,
  tickNotifications,
  unsubscribeNewsletter,
} from "./forms.ts";
import {
  FormTickBodySchema,
  type FormTickBody,
} from "./forms-contract.ts";
import {
  publishEntry,
  purgeEntry,
  restoreEntryFromTrash,
  restoreEntryVersionAsDraft,
  tickScheduledEntries,
  trashEntry,
  unpublishEntry,
  updateCollection,
  updateEntry,
} from "./content.ts";
import {
  EntryActionBodySchema,
  EntryPreviewBodySchema,
  EntryTickBodySchema,
  PublishEntryBodySchema,
  UpdateCollectionBodySchema,
  UpdateEntryBodySchema,
  type EntryActionBody,
  type EntryPreviewBody,
  type EntryTickBody,
  type PublishEntryBody,
  type UpdateCollectionBody,
  type UpdateEntryBody,
} from "./content-contract.ts";
import {
  PutPageTemplateBodySchema,
  type PutPageTemplateBody,
} from "./templates-contract.ts";
import { putPageTemplate } from "./templates.ts";
import {
  analyzeReference,
  deleteReference,
  editReferenceProfile,
  runDueReferenceJobs,
} from "./references-lifecycle.ts";
import {
  AnalyzeReferenceBodySchema,
  CreateReferenceCollectionBodySchema,
  EditReferenceProfileBodySchema,
  MANUAL_REFERENCE_BODY_LIMIT_BYTES,
  ManualReferenceBodySchema,
  mergeReferenceDocuments,
  parseReferenceListFilters,
  ReferenceBriefBodySchema,
  ReferenceTickBodySchema,
  referenceFooterText,
  UpdateReferenceBodySchema,
  UpdateReferenceCollectionBodySchema,
  VisualDiffBodySchema,
  type AnalyzeReferenceBody,
  type CreateReferenceCollectionBody,
  type EditReferenceProfileBody,
  type ManualReferenceBody,
  type ReferenceBriefBody,
  type ReferenceTickBody,
  type UpdateReferenceBody,
  type UpdateReferenceCollectionBody,
  type VisualDiffBody,
} from "./references-contract.ts";
import { diffReferenceAgainstDraft } from "./reference-visual-diff.ts";
import {
  ConfirmRedesignProposalBodySchema,
  CreateRedesignProposalBodySchema,
  ResolveMediaNeedsBodySchema,
  type ConfirmRedesignProposalBody,
  type CreateRedesignProposalBody,
  type ResolveMediaNeedsBody,
} from "./redesign-proposal-contract.ts";
import {
  confirmRedesignProposal,
  createRedesignProposal,
  getRedesignProposalView,
  listRedesignProposals,
  proposalCardScreenshot,
  resolveRedesignMediaNeeds,
} from "./redesign-proposals.ts";
import {
  CreateLibraryComponentBodySchema,
  UpdateLibraryComponentBodySchema,
  type CreateLibraryComponentBody,
  type UpdateLibraryComponentBody,
} from "./library-contract.ts";
import {
  createManualReference,
  referenceStyleCatalogInfo,
  seedReferenceStyles,
} from "./references-library.ts";
import { buildRedesignPackage } from "./redesign-package.ts";
import { buildDesignSystemImport } from "./design-system-import.ts";
import {
  buildCollectionBrief,
  buildImagePrompt,
  buildReferenceBrief,
} from "./references-brief.ts";
import { commitUpload } from "./media.ts";
import { resolveStoredFile, storedFileName } from "./storage.ts";
import type {
  RedesignProposalStatus,
  TokenScope,
} from "./types.ts";
import { REDESIGN_PROPOSAL_STATUSES } from "./types.ts";
import { isRedesignProposalStatus } from "./redesign-proposal-contract.ts";
import { PAGE_STARTERS } from "./page-starters.ts";
import { existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import type { AuthInfo, EngineContext, Route, RouteParams } from "./http-contract.ts";
import {
  referenceContext,
  redesignProposalContext,
  lifecycleContext,
  mediaContext,
  settingsView,
  resolveAuthor,
  withIdempotency,
  readJsonBody,
  readRawBody,
  clientIpOf,
  originOf,
  refererPath,
  requestHostOf,
  publicBaseUrlOf,
  wantsJson,
  readSubmitBody,
  applyMutationsToPage,
  applyEditorMutationsToPage,
  filterReferences,
  requireParam,
  limitParam,
} from "./http-route-support.ts";
import { siteRoutes } from "./http-routes-sites.ts";
export { clientIpOf } from "./http-route-support.ts";
export type { EngineContext } from "./http-contract.ts";

// The settings view the app reads: SMTP without the password, the defaults, the
// backup target (T12), the reference preferences (T14) and the image generation
// (S1).
// The audited author is always the token, never the request body (ticket 18):
// a direct API call cannot claim a foreign identity or a different kind. The
// body's `author` stays a suggestion that the server overrides here.
// Deterministic JSON for the idempotency fingerprint: object keys are sorted
// recursively, so two requests that differ only in key order are the same.
// Idempotent create (ticket 18, slice 2): the request claims a slot keyed by
// (token, route, key) before it runs. A retry replays the stored response, a
// concurrent duplicate is rejected as in-flight, and a failed attempt releases
// the slot so the same key may be retried (with a corrected body if needed).
// Upload bodies are raw bytes, not JSON: they get their own cap instead of the
// 1 MB JSON limit.
// The address the rate limit counts. `X-Forwarded-For` is believed only from a
// proxy on this machine or network: a client that reaches the engine directly
// could write anything there and never hit the limit. A proxy appends the
// address it saw, so the last entry is the one it vouches for; everything in
// front of it came from the client.
// Absolute base of the request: the briefs print the snapshot of a reference,
// and an assistant outside the program can only open that image with the host
// it was served from (`/api/...` alone says nothing about the machine). Behind
// the dashboard the proxy forwards the origin the browser asked on, and that is
// the address worth printing: it injects the operator token, the engine port
// would answer 401 in a browser window.
// The JS path asks for JSON; the plain browser POST does not.
// One endpoint, two encodings: the browser posts urlencoded, the JS island
// posts the same FormData (also urlencoded) and agents may post JSON.
// The canvas persists its v2 editor ops through the same write path: they are
// translated into the section vocabulary and handed to `applyMutationsToPage`,
// so the conflict check, the hard guardrails, the version bump, the audit log
// and the optimistic locking are all shared with the section mutations route.
// The node ids a batch touched, for the live highlight in the editor. Every
// mutation names its target under a different key; missing ids are fine.
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
  if (route.operatorOnly === true && record.kind !== "human") {
    throw new AuthError(403, "This route requires a human operator", {
      suggestion:
        "Nur das lokale Programm (oder ein Human-Token) darf das — Agenten planen und lesen, der Mensch entscheidet.",
    });
  }
  const required: TokenScope = route.scope ?? "read";
  if (!record.scopes.includes(required)) {
    const suggested = [...new Set([...record.scopes, required])].join(",");
    throw new AuthError(403, `Missing scope "${required}"`, {
      suggestion: `Create a token with the "${required}" scope: senify tokens create --name "<client>" --scopes ${suggested}`,
    });
  }
  if (route.rateLimit !== false) {
    context.rateLimiter.check(record.id, route.destructive === true);
  }
  await context.store.touchToken(record.id);
  return {
    tokenId: record.id,
    tokenName: record.name,
    kind: record.kind,
    scopes: record.scopes,
  };
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
    maintenanceExempt: true,
    handler: async (context) => ({
      status: 200,
      body: {
        ok: true,
        version: "0.1.0",
        maintenance: context.maintenance.active,
      },
    }),
  },
  {
    // Live events (ticket 05): the SSE channel the program and the editor
    // follow. `?site=` narrows the stream; an unknown site is a 404 instead of
    // a silent empty stream.
    method: "GET",
    segments: ["api", "events"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const siteId = url.searchParams.get("site") ?? "";
      if (siteId !== "") await context.store.getSite(siteId);
      return {
        status: 200,
        stream: {
          contentType: "text/event-stream; charset=utf-8",
          open: (res) => context.events.openStream(res, siteId),
        },
      };
    },
  },
  ...siteRoutes,
  {
    // The start templates the dashboard offers for a new page.
    method: "GET",
    segments: ["api", "page-starters"],
    scope: "read",
    handler: async () => ({
      status: 200,
      body: {
        starters: PAGE_STARTERS.map((starter) => ({
          id: starter.id,
          label: starter.label,
          description: starter.description,
          defaultTitle: starter.defaultTitle,
          sections: starter.sections.map((section) => section.type),
        })),
      },
    }),
  },
  // The self-hosted motion runtime for the editor's play preview (ticket 19,
  // M4): the same files the bake copies into a release. The local program
  // proxies `/api/` with its operator token, so the editor frame can load
  // them without a token of its own.
  {
    method: "GET",
    segments: ["api", "motion-vendor", ":name"],
    scope: "read",
    handler: async (_context, params) => {
      const name = requireParam(params, "name");
      const file = motionVendorFiles().find((entry) => entry.name === name);
      if (file === undefined) {
        throw new SenifyError("not_found", `Unknown motion vendor file "${name}"`, {
          field: "name",
          suggestion: "Use gsap.min.js, ScrollTrigger.min.js, SplitText.min.js or lenis.min.js.",
        });
      }
      return {
        status: 200,
        file: { path: file.from, contentType: "text/javascript; charset=utf-8" },
      };
    },
  },
  // Style rules (Phase 2): site-wide, so they hang off the site like the theme
// does. Reads are open to any token, writes need `write`, deletion needs
// `publish` (same ladder the other destructive site resources use).
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
    handler: async (context, params, req, _url, auth) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      const body = await readJsonBody(req);
      const input: ApplyMutationsBody = parseApplyMutationsBody(body);
      const result = await applyMutationsToPage(context, pageId, input, auth);
      return { status: 200, body: result };
    },
  },
  {
    // The canvas (rebuild Phase 0) persists its v2 editor ops here. Additive to
    // the section mutations route above: same envelope, same write path, only
    // the op vocabulary differs. The draft stays a section NodeTree.
    method: "POST",
    segments: ["api", "pages", ":pageId", "editor-mutations"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      const body = await readJsonBody(req);
      const input = parseApplyEditorMutationsBody(body);
      const result = await applyEditorMutationsToPage(context, pageId, input, auth);
      return { status: 200, body: result };
    },
  },
  {
    // Agent undo (E17): the server-side Cmd+Z. Walks the page's audit log
    // backwards (newest batches first), runs the inverse patches through the
    // same integrity check as a forward batch and writes the result as a
    // fresh, audited batch. A stale baseDraftVersion is a conflict.
    method: "POST",
    segments: ["api", "pages", ":pageId", "undo-batch"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const pageId = params.pageId;
      if (!pageId) throw new SenifyError("validation", "Missing page id", { field: "pageId" });
      const body = await readJsonBody(req);
      const request = parseUndoBatchBody(body);
      const author = resolveAuthor(auth);
      return {
        status: 200,
        body: await undoBatches(context, pageId, request, author),
      };
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
    method: "POST",
    segments: ["api", "tokens"],
    operatorOnly: true,
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateTokenBody>(
        CreateTokenBodySchema,
        body,
        "token",
      );
      const created = await context.store.createToken({
        name: input.name,
        kind: input.kind,
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
    operatorOnly: true,
    scope: "read",
    handler: async (context) => ({
      status: 200,
      body: { tokens: await context.store.listTokens() },
    }),
  },
  {
    method: "DELETE",
    segments: ["api", "tokens", ":tokenId"],
    operatorOnly: true,
    scope: "publish",
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
          kind: token.kind,
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
    handler: async (context, params, req, _url, auth) => {
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
          author: resolveAuthor(auth),
        }),
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
    // Screenshot, diff or motion file of a review (T07). The filename is
    // whitelisted against the item's own visuals, so traversal never resolves.
    method: "GET",
    segments: ["api", "reviews", ":reviewId", "visuals", ":filename"],
    scope: "read",
    handler: async (context, params) => {
      const review = await context.store.getReviewItem(
        requireParam(params, "reviewId"),
      );
      const filename = requireParam(params, "filename");
      if (!reviewVisualFileNames(review.visuals).includes(filename)) {
        throw new SenifyError("not_found", `Visual "${filename}" does not exist`, {
          field: "filename",
        });
      }
      const file = resolveStoredFile(
        context.dataDir,
        ["reviews", review.id, "visuals", filename].join("/"),
      );
      if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
        throw new SenifyError("not_found", `Visual file "${filename}" is missing`, {
          field: "filename",
        });
      }
      return {
        status: 200,
        file: {
          path: file,
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "reviews", ":reviewId", "approve"],
    scope: "publish",
    handler: async (context, params, req, _url, auth) => {
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
          author: resolveAuthor(auth),
          note: input.note,
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "reviews", ":reviewId", "request-changes"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
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
          author: resolveAuthor(auth),
          note: input.note ?? "",
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "reviews", ":reviewId", "discard"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
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
          author: resolveAuthor(auth),
          note: input.note,
        }),
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
      const upload = await commitUpload(mediaContext(context), { ticket, data });
      context.events.publish({
        kind: "asset.uploaded",
        siteId: upload.asset.siteId,
        action: "uploadAsset",
      });
      return { status: 201, body: upload };
    },
  },
  {
    method: "GET",
    segments: ["api", "library-components"],
    scope: "read",
    handler: async (context) => ({ status: 200, body: { components: await context.store.listLibraryComponents() } }),
  },
  {
    method: "POST",
    segments: ["api", "library-components"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = parseBody<CreateLibraryComponentBody>(CreateLibraryComponentBodySchema, (await readJsonBody(req)) ?? {}, "library component");
      return {
        status: 201,
        body: await context.store.createLibraryComponent({
          id: newEntityId(),
          name: body.name,
          kind: body.kind ?? "component",
          definition: body.definition,
          fingerprint: body.fingerprint,
          tags: body.tags ?? [],
          provenance: body.provenance === undefined ? { kind: "hand", sourceUrl: null, pagePath: null, irHash: null } : { kind: body.provenance.kind, sourceUrl: body.provenance.sourceUrl ?? null, pagePath: body.provenance.pagePath ?? null, irHash: body.provenance.irHash ?? null },
          license: body.license === undefined ? { id: "unknown", note: null, status: "unknown" } : { id: body.license.id, note: body.license.note ?? null, status: body.license.status ?? "unknown" },
          notes: body.notes ?? "",
          author: body.author,
        }),
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "library-components", "audit"],
    scope: "read",
    handler: async (context) => ({ status: 200, body: { entries: await context.store.listLibraryAudit() } }),
  },
  {
    method: "GET",
    segments: ["api", "library-components", ":componentId"],
    scope: "read",
    handler: async (context, params) => ({ status: 200, body: await context.store.getLibraryComponent(requireParam(params, "componentId")) }),
  },
  {
    method: "PATCH",
    segments: ["api", "library-components", ":componentId"],
    scope: "write",
    handler: async (context, params, req) => {
      const body = parseBody<UpdateLibraryComponentBody>(UpdateLibraryComponentBodySchema, (await readJsonBody(req)) ?? {}, "library component update");
      return { status: 200, body: await context.store.updateLibraryComponent({ id: requireParam(params, "componentId"), ...body, license: body.license === undefined ? undefined : { id: body.license.id, note: body.license.note ?? null, status: body.license.status ?? "unknown" } }) };
    },
  },
  {
    method: "DELETE",
    segments: ["api", "library-components", ":componentId"],
    scope: "write",
    destructive: true,
    handler: async (context, params) => ({ status: 200, body: await context.store.deleteLibraryComponent(requireParam(params, "componentId")) }),
  },
  // Imported foreign code (ADR-0010): a payload is a site's code package with
  // its provenance. Writing one is an audited write (MCP needs the write
  // scope); reading the metadata is enough for the report and the editor.
  {
    method: "GET",
    segments: ["api", "code-payloads", ":payloadId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getCodePayload(requireParam(params, "payloadId")),
    }),
  },
  {
    method: "DELETE",
    segments: ["api", "code-payloads", ":payloadId"],
    scope: "write",
    destructive: true,
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.deleteCodePayload(requireParam(params, "payloadId")),
    }),
  },
  {
    // Root files of a bake: the baked pages link `/assets/theme.css`,
    // `/assets/sections.css`, `/assets/islands.js` … next to the asset store's
    // own `/assets/<id>/<file>` (one segment less, so no collision). Served for
    // the published release and, while nothing is published, for the newest
    // preview — `?release=`/`?preview=` pick a build explicitly.
    method: "GET",
    segments: ["assets", ":filename"],
    public: true,
    handler: async (context, params, _req, url) => {
      const filename = requireParam(params, "filename");
      if (!BUILD_ROOT_FILES.has(filename)) {
        throw new SenifyError("not_found", `File "${filename}" does not exist`, {
          field: "filename",
        });
      }
      return buildRootFile(context, url, `assets/${filename}`);
    },
  },
  {
    // Astro's hashed bundle output (`/_astro/<name>.css`) lives in the build
    // root as well; the document links it with an absolute path.
    method: "GET",
    segments: ["_astro", ":filename"],
    public: true,
    handler: async (context, params, _req, url) => {
      const filename = requireParam(params, "filename");
      if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
        throw new SenifyError("validation", `Invalid file name "${filename}"`, {
          field: "filename",
        });
      }
      return buildRootFile(context, url, `_astro/${filename}`);
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
    // Live preview of the Entry-Editor (artifacts/23 §5): the same bake path as
    // the build, rendered into a throw-away directory and returned as HTML.
    method: "GET",
    segments: ["api", "entries", ":entryId", "preview"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await renderEntryPreview({
        store: context.store,
        dataDir: context.dataDir,
        entryId: requireParam(params, "entryId"),
        formSigner: context.formSigner,
      }),
    }),
  },
  {
    // Preview with unsaved form values (T10): the editor posts its cells, the
    // engine overlays them on the stored row without writing anything.
    method: "POST",
    segments: ["api", "entries", ":entryId", "preview"],
    scope: "read",
    handler: async (context, params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<EntryPreviewBody>(
        EntryPreviewBodySchema,
        body,
        "entry preview",
      );
      return {
        status: 200,
        body: await renderEntryPreview({
          store: context.store,
          dataDir: context.dataDir,
          entryId: requireParam(params, "entryId"),
          formSigner: context.formSigner,
          ...(input.cells === undefined ? {} : { cells: input.cells }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
        }),
      };
    },
  },
  {
    method: "PUT",
    segments: ["api", "entries", ":entryId"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateEntryBody>(
        UpdateEntryBodySchema,
        body,
        "entry update",
      );
      return {
        status: 200,
        body: await updateEntry(context.store, {
          entryId,
          body: { ...input, author: resolveAuthor(auth) },
        }),
      };
    },
  },
  {
    method: "DELETE",
    segments: ["api", "entries", ":entryId"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<EntryActionBody>(EntryActionBodySchema, body, "entry action");
      return {
        status: 200,
        body: await trashEntry(context.store, {
          entryId,
          author: resolveAuthor(auth),
        }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "entries", ":entryId", "restore"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<EntryActionBody>(EntryActionBodySchema, body, "entry restore");
      return {
        status: 200,
        body: await restoreEntryFromTrash(context.store, {
          entryId,
          author: resolveAuthor(auth),
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
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<EntryActionBody>(EntryActionBodySchema, body, "entry purge");
      return {
        status: 200,
        body: await purgeEntry(context.store, { entryId, author: resolveAuthor(auth) }),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "entries", ":entryId", "publish"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
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
          author: resolveAuthor(auth),
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
    handler: async (context, params, req, _url, auth) => {
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
          author: resolveAuthor(auth),
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
    handler: async (context, params, req, _url, auth) => {
      const entryId = requireParam(params, "entryId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<EntryActionBody>(
        EntryActionBodySchema,
        body,
        "entry version restore",
      );
      return {
        status: 200,
        body: await restoreEntryVersionAsDraft(context.store, {
          entryId,
          versionId: requireParam(params, "versionId"),
          author: resolveAuthor(auth),
        }),
      };
    },
  },
  // ------------------------------------------------------- forms (T11)
  {
    // Public, no bearer: the signed token in the page is the authorization.
    method: "POST",
    segments: ["api", "forms", ":formId", "submit"],
    public: true,
    handler: async (context, params, req) => {
      const formId = requireParam(params, "formId");
      const parsed = await readSubmitBody(req);
      if (parsed.token === "") {
        throw new FormRejection("token", "Formular-Token fehlt", {
          field: "form_token",
        });
      }
      const json = wantsJson(req);
      try {
        const result = await submitForm({
          store: context.store,
          signer: context.formSigner,
          rateLimiter: context.formRateLimiter,
          formId,
          token: parsed.token,
          values: parsed.values,
          consent: parsed.consent,
          honeypot: parsed.honeypot,
          origin: originOf(req),
          requestHost: requestHostOf(req),
          clientIp: clientIpOf(req),
        });
        if (json) return { status: 200, body: { ...result } };
        return {
          status: 303,
          redirect: result.redirectUrl ?? `${result.pagePath}?gesendet=1`,
        };
      } catch (error) {
        // No-JS: back to the form with a visible error reason instead of JSON.
        if (!json && error instanceof FormRejection) {
          const back = refererPath(req);
          if (back !== undefined) {
            return {
              status: 303,
              redirect: `${back}?form_fehler=${encodeURIComponent(error.reason)}`,
            };
          }
        }
        throw error;
      }
    },
  },
  {
    method: "GET",
    segments: ["api", "forms", ":formId", "submissions"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const formId = requireParam(params, "formId");
      const view = await listSubmissions(context.store, {
        formId,
        limit: limitParam(url, 200),
      });
      return {
        status: 200,
        body: { source: view.source, columns: view.columns, rows: view.rows },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "forms", ":formId", "submissions.csv"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const formId = requireParam(params, "formId");
      const view = await listSubmissions(context.store, {
        formId,
        limit: limitParam(url, 500),
      });
      return {
        status: 200,
        text: {
          contentType: "text/csv; charset=utf-8",
          body: buildSubmissionsCsv({ columns: view.columns, rows: view.rows }),
        },
        headers: {
          "content-disposition": `attachment; filename="submissions-${formId}.csv"`,
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "newsletter", "confirm"],
    public: true,
    handler: async (context, _params, req, url) => {
      const token = url.searchParams.get("token") ?? "";
      const result = await confirmNewsletter(context.store, { token });
      if (!wantsJson(req) && result.redirectUrl !== null) {
        return { status: 303, redirect: result.redirectUrl };
      }
      return { status: 200, body: result };
    },
  },
  {
    method: "GET",
    segments: ["api", "newsletter", "unsubscribe"],
    public: true,
    handler: async (context, _params, req, url) => {
      const token = url.searchParams.get("token") ?? "";
      const result = await unsubscribeNewsletter(context.store, { token });
      if (!wantsJson(req) && result.redirectUrl !== null) {
        return { status: 303, redirect: result.redirectUrl };
      }
      return { status: 200, body: result };
    },
  },
  {
    // Job tick for the notification outbox (retry/backoff, §5.4).
    method: "POST",
    segments: ["api", "notifications", "tick"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<FormTickBody>(
        FormTickBodySchema,
        body,
        "notification tick",
      );
      return {
        status: 200,
        body: await tickNotifications({
          store: context.store,
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        }),
      };
    },
  },
  {
    // analyze_reference: URL → analysis job → profile (artifacts/28 §1).
    method: "POST",
    segments: ["api", "references"],
    scope: "write",
    handler: async (context, _params, req, _url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<AnalyzeReferenceBody>(
        AnalyzeReferenceBodySchema,
        body,
        "reference analysis",
      );
      const result = await analyzeReference(referenceContext(context), {
        url: input.url,
        author: resolveAuthor(auth),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.snapshot === undefined ? {} : { snapshot: input.snapshot }),
        ...(input.wait === undefined ? {} : { wait: input.wait }),
      });
      return { status: 201, body: result };
    },
  },
  {
    // FTS over the library (E24, L42): the search hits with weight ranking —
    // the haystack includes the verbatim documents (design.md & Co.), so
    // "vault first: search before capturing" works over the whole corpus.
    method: "GET",
    segments: ["api", "references", "search"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const query = (url.searchParams.get("q") ?? "").trim();
      if (query === "") {
        throw new SenifyError("validation", "Missing search query", {
          field: "q",
          suggestion: "Pass a query, e.g. ?q=swiss+grid.",
        });
      }
      const hits = await context.store.searchReferences(query.split(/\s+/));
      return {
        status: 200,
        body: {
          query,
          count: hits.length,
          hits: hits.map((hit) => ({
            reference: hit.reference,
            weight: hit.weight,
          })),
        },
      };
    },
  },
  {
    // Dedupe candidates (E24, L42): near-duplicates of the library (same
    // source url or same normalised name). Read-only — deleting stays manual
    // (delete_reference) so a fork with a different url is never lost.
    method: "GET",
    segments: ["api", "references", "duplicates"],
    scope: "read",
    handler: async (context) => {
      const duplicates = await context.store.findDuplicateReferences();
      return {
        status: 200,
        body: {
          count: duplicates.length,
          duplicates,
        },
      };
    },
  },
  {
    // The library list: collection filter, search over title/family/note/
    // vocabulary/collection name, sort and the numbers of the footer line.
    method: "GET",
    segments: ["api", "references"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const filters = parseReferenceListFilters(url.searchParams);
      if (filters.collection !== undefined && filters.collection !== "none") {
        // A mistyped collection id is an error, not an empty view.
        await context.store.getReferenceCollection(filters.collection);
      }
      const [all, collections] = await Promise.all([
        context.store.listReferences({ sort: filters.sort }),
        context.store.listReferenceCollections(),
      ]);
      const references = filterReferences(all, filters);
      return {
        status: 200,
        body: {
          references,
          collections,
          counts: {
            references: all.length,
            inView: references.length,
            collections: collections.length,
            styles: collections.filter((collection) => collection.kind === "style").length,
          },
          footer: {
            total: all.length,
            inView: references.length,
            query: filters.query ?? null,
            text: referenceFooterText({
              count: references.length,
              ...(filters.query === undefined ? {} : { query: filters.query }),
            }),
          },
          styleCatalog: referenceStyleCatalogInfo(),
        },
      };
    },
  },
  {
    // Manually stored reference: an uploaded image plus the library fields. It
    // is ready on arrival, carries a snapshot and no analysis profile.
    method: "POST",
    segments: ["api", "references", "manual"],
    scope: "write",
    handler: async (context, _params, req, _url, auth) => {
      const body = (await readJsonBody(req, MANUAL_REFERENCE_BODY_LIMIT_BYTES)) ?? {};
      const input = parseBody<ManualReferenceBody>(
        ManualReferenceBodySchema,
        body,
        "manual reference",
      );
      return {
        status: 201,
        body: {
          reference: await createManualReference(referenceContext(context), {
            ...input,
            author: resolveAuthor(auth),
          }),
        },
      };
    },
  },
  {
    // Combined brief of several references (the comparison dialog). A read, so
    // no write scope is needed.
    method: "POST",
    segments: ["api", "references", "brief"],
    scope: "read",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ReferenceBriefBody>(
        ReferenceBriefBodySchema,
        body,
        "reference brief",
      );
      const ids = [...new Set(input.referenceIds)];
      const references = [];
      for (const id of ids) {
        references.push(await context.store.getReference(id));
      }
      const settings = await context.store.getReferenceSettings();
      return {
        status: 200,
        body: {
          brief: buildReferenceBrief({
            references,
            dna: settings.dna,
            preferences: settings.preferences,
            baseUrl: publicBaseUrlOf(req),
          }),
          imagePrompt:
            references.length === 1
              ? buildImagePrompt(references[0]!, { baseUrl: publicBaseUrlOf(req) })
              : null,
          vocabulary: null,
        },
      };
    },
  },
  {
    // Job tick: due jobs retry with backoff and progress (long captures).
    method: "POST",
    segments: ["api", "references", "tick"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ReferenceTickBody>(
        ReferenceTickBodySchema,
        body,
        "reference tick",
      );
      const result = await runDueReferenceJobs(
        referenceContext(context),
        input.limit === undefined ? {} : { limit: input.limit },
      );
      return { status: 200, body: result };
    },
  },
  {
    method: "GET",
    segments: ["api", "references", ":referenceId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getReference(requireParam(params, "referenceId")),
    }),
  },
  {
    // Library fields of one reference: name, collection, note, vocabulary,
    // recipe, composition and family ("Die Idee zum Mitnehmen" of the detail).
    method: "PATCH",
    segments: ["api", "references", ":referenceId"],
    scope: "write",
    handler: async (context, params, req) => {
      const referenceId = requireParam(params, "referenceId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateReferenceBody>(
        UpdateReferenceBodySchema,
        body,
        "reference",
      );
      const name = input.name?.trim();
      if (input.name !== undefined && (name === undefined || name === "")) {
        throw new SenifyError(
          "validation",
          "Der Name der Referenz darf nicht leer sein",
          {
            field: "name",
            suggestion: "Einen Namen mit mindestens einem sichtbaren Zeichen senden.",
          },
        );
      }
      if (input.collectionId !== undefined && input.collectionId !== null) {
        await context.store.getReferenceCollection(input.collectionId);
      }
      // A single document kind updates in place; the other kinds keep their
      // text (mergeReferenceDocuments), null clears one explicitly.
      const documents =
        input.documents === undefined
          ? undefined
          : mergeReferenceDocuments(
              (await context.store.getReference(referenceId)).documents,
              input.documents,
            );
      return {
        status: 200,
        body: {
          reference: await context.store.updateReference(referenceId, {
            ...(name === undefined ? {} : { name }),
            ...(input.sourceUrl === undefined ? {} : { sourceUrl: input.sourceUrl }),
            ...(input.collectionId === undefined ? {} : { collectionId: input.collectionId }),
            ...(input.note === undefined ? {} : { note: input.note }),
            ...(input.vocabulary === undefined ? {} : { vocabulary: input.vocabulary }),
            ...(input.imageRecipe === undefined ? {} : { imageRecipe: input.imageRecipe }),
            ...(input.heroUsage === undefined ? {} : { heroUsage: input.heroUsage }),
            ...(input.family === undefined ? {} : { family: input.family }),
            ...(documents === undefined ? {} : { documents }),
          }),
        },
      };
    },
  },
  {
    // The redesign package for one page: the content plus one theme patch per
    // reference. A read; nothing is written.
    method: "GET",
    segments: ["api", "pages", ":pageId", "redesign-package"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const referenceIds = (url.searchParams.get("referenceIds") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value !== "");
      return {
        status: 200,
        body: await buildRedesignPackage(context.store, {
          pageId: requireParam(params, "pageId"),
          referenceIds,
        }),
      };
    },
  },
  {
    // design.md → Theme (E27): the documented tokens as a theme patch with the
    // evidence of every value, the gaps of the document and the conflicts
    // against the current theme. A read; the write stays update_theme.
    method: "GET",
    segments: ["api", "references", ":referenceId", "design-system"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = url.searchParams.get("siteId") ?? "";
      if (siteId === "") {
        throw new SenifyError("validation", 'Missing "siteId"', {
          field: "siteId",
          suggestion:
            "Pass the target site (?siteId=…): the patch is derived against its current theme.",
        });
      }
      return {
        status: 200,
        body: await buildDesignSystemImport(context.store, {
          referenceId: requireParam(params, "referenceId"),
          siteId,
        }),
      };
    },
  },
  {
    // Design brief of one reference plus its image prompt.
    method: "GET",
    segments: ["api", "references", ":referenceId", "brief"],
    scope: "read",
    handler: async (context, params, req) => {
      const reference = await context.store.getReference(
        requireParam(params, "referenceId"),
      );
      const settings = await context.store.getReferenceSettings();
      const baseUrl = publicBaseUrlOf(req);
      return {
        status: 200,
        body: {
          brief: buildReferenceBrief({
            references: [reference],
            dna: settings.dna,
            preferences: settings.preferences,
            baseUrl,
          }),
          imagePrompt: buildImagePrompt(reference, { baseUrl }),
          vocabulary: null,
        },
      };
    },
  },
  {
    // Löschen mit Nutzungs-Hinweis: ohne force nur ohne Projekt-Zuordnung.
    method: "DELETE",
    segments: ["api", "references", ":referenceId"],
    scope: "write",
    destructive: true,
    handler: async (context, params, _req, url) => {
      const force = url.searchParams.get("force");
      return {
        status: 200,
        body: await deleteReference(referenceContext(context), {
          referenceId: requireParam(params, "referenceId"),
          force: force === "1" || force === "true",
        }),
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "references", ":referenceId", "revisions"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        revisions: await context.store.listReferenceProfileRevisions(
          requireParam(params, "referenceId"),
        ),
      },
    }),
  },
  {
    // Nachbearbeitung: jede Aenderung erzeugt eine neue Profil-Revision.
    method: "POST",
    segments: ["api", "references", ":referenceId", "revisions"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const referenceId = requireParam(params, "referenceId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<EditReferenceProfileBody>(
        EditReferenceProfileBodySchema,
        body,
        "reference profile edit",
      );
      const revision = await editReferenceProfile(referenceContext(context), {
        referenceId,
        author: resolveAuthor(auth),
        ...(input.vocabulary === undefined ? {} : { vocabulary: input.vocabulary }),
        ...(input.families === undefined ? {} : { families: input.families }),
        ...(input.rules === undefined ? {} : { rules: input.rules }),
        ...(input.note === undefined ? {} : { note: input.note }),
      });
      return { status: 201, body: revision };
    },
  },
  {
    // Gestored snapshot PNG of a reference. The filename is whitelisted against
    // the reference's own snapshots, so traversal and foreign ids never resolve
    // (artifacts/28 §4: snapshots stay internal, they do not enter the media
    // library).
    method: "GET",
    segments: ["api", "references", ":referenceId", "snapshots", ":filename"],
    scope: "read",
    rateLimit: false,
    handler: async (context, params) => {
      const reference = await context.store.getReference(
        requireParam(params, "referenceId"),
      );
      const filename = requireParam(params, "filename");
      const snapshot = reference.snapshots.find(
        (entry) => storedFileName(entry.storageRef) === filename,
      );
      if (snapshot === undefined) {
        throw new SenifyError("not_found", `Snapshot "${filename}" does not exist`, {
          field: "filename",
        });
      }
      const file = resolveStoredFile(context.dataDir, snapshot.storageRef);
      if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
        throw new SenifyError("not_found", `Snapshot file "${filename}" is missing`, {
          field: "filename",
        });
      }
      return {
        status: 200,
        file: {
          path: file,
          // Captures are PNG; a manually stored reference keeps its container.
          contentType:
            CONTENT_TYPES[extname(file).toLowerCase()] ?? "image/png",
          // A re-analysis may overwrite the file under a stable name, so the
          // response revalidates instead of caching hard.
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        },
      };
    },
  },
  {
    // Visual diff reference ↔ result (E26 slice 2): bakes the page drafts to
    // a throwaway directory, captures them at the slot widths of the
    // reference and diffs slot by slot. Read-only in effect — no preview
    // record, no review item; the heatmaps persist under the reference.
    method: "POST",
    segments: ["api", "references", ":referenceId", "visual-diff"],
    scope: "read",
    handler: async (context, params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<VisualDiffBody>(
        VisualDiffBodySchema,
        body,
        "reference visual diff",
      );
      const reference = await context.store.getReference(
        requireParam(params, "referenceId"),
      );
      const result = await diffReferenceAgainstDraft({
        store: context.store,
        siteId: input.siteId,
        ...(input.pageId === undefined ? {} : { pageId: input.pageId }),
        reference,
        dataDir: context.dataDir,
        formSigner: context.formSigner,
        formBaseUrl: context.formBaseUrl,
        ...(context.referenceDiffs === undefined
          ? {}
          : { deps: context.referenceDiffs }),
      });
      return { status: 200, body: result };
    },
  },
  {
    // Stored heatmaps of the reference diff. The filename is validated
    // against its own directory, so traversal never resolves.
    method: "GET",
    segments: ["api", "references", ":referenceId", "visual-diffs", ":filename"],
    scope: "read",
    rateLimit: false,
    handler: async (context, params) => {
      const referenceId = requireParam(params, "referenceId");
      await context.store.getReference(referenceId);
      const filename = requireParam(params, "filename");
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(filename)) {
        throw new SenifyError("not_found", `Visual "${filename}" does not exist`, {
          field: "filename",
        });
      }
      const file = resolveStoredFile(
        context.dataDir,
        ["references", referenceId, "visual-diffs", filename].join("/"),
      );
      if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
        throw new SenifyError("not_found", `Visual file "${filename}" is missing`, {
          field: "filename",
        });
      }
      return {
        status: 200,
        file: {
          path: file,
          contentType: "image/png",
          headers: { "cache-control": "public, max-age=0, must-revalidate" },
        },
      };
    },
  },
  // ----------------------------------------------- redesign proposals (ADR-0012)
  // The human direction step. The agent proposes and reads; only a human
  // operator confirms, and the confirm is one command (decision + apply).
  {
    method: "POST",
    segments: ["api", "pages", ":pageId", "redesign-proposals"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateRedesignProposalBody>(
        CreateRedesignProposalBodySchema,
        body,
        "redesign proposal",
      );
      return withIdempotency(
        context,
        auth,
        req,
        url,
        input.idempotencyKey,
        { ...input },
        async () => ({
          status: 201,
          body: {
            proposal: await createRedesignProposal(redesignProposalContext(context), {
              pageId: requireParam(params, "pageId"),
              referenceIds: input.referenceIds,
              author: resolveAuthor(auth),
            }),
          },
        }),
      );
    },
  },
  {
    method: "GET",
    segments: ["api", "pages", ":pageId", "redesign-proposals"],
    scope: "read",
    handler: async (context, params, req) => {
      // `?status=` narrows the inbox. Without it the list is everything for
      // the page, open and finished alike. The value is checked against the
      // known statuses rather than passed through, so a typo answers 400
      // instead of an empty list that reads like "nothing is open".
      const requested = new URL(req.url ?? "/", "http://localhost").searchParams.get("status");
      let status: RedesignProposalStatus | undefined;
      if (requested !== null && requested !== "") {
        if (!isRedesignProposalStatus(requested)) {
          throw new SenifyError("validation", `Unknown proposal status "${requested}"`, {
            field: "status",
            suggestion: `One of: ${REDESIGN_PROPOSAL_STATUSES.join(", ")}.`,
          });
        }
        // The guard above narrows `requested`; the explicit read keeps that
        // narrowing visible to the type checker across the `let`.
        status = requested as RedesignProposalStatus;
      }
      return {
        status: 200,
        body: {
          proposals: await listRedesignProposals(redesignProposalContext(context), {
            pageId: requireParam(params, "pageId"),
            ...(status === undefined ? {} : { status }),
          }),
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "redesign-proposals", ":proposalId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: {
        proposal: await getRedesignProposalView(
          redesignProposalContext(context),
          requireParam(params, "proposalId"),
        ),
      },
    }),
  },
  {
    // The card image. Resolved only through the proposal's own folder and the
    // file name the stored card carries, so a foreign id or a traversal never
    // resolves (same guard as the reference snapshot route).
    method: "GET",
    segments: ["api", "redesign-proposals", ":proposalId", "cards", ":directionId", "screenshot"],
    scope: "read",
    rateLimit: false,
    handler: async (context, params) => {
      const proposal = await context.store.getRedesignProposal(
        requireParam(params, "proposalId"),
      );
      const found = proposalCardScreenshot(
        context.dataDir,
        proposal,
        requireParam(params, "directionId"),
      );
      if (found === null) {
        throw new SenifyError(
          "not_found",
          `Direction "${params.directionId ?? ""}" has no stored image in this proposal`,
          { field: "directionId" },
        );
      }
      return {
        status: 200,
        file: {
          path: found.path,
          contentType:
            CONTENT_TYPES[extname(found.path).toLowerCase()] ?? "image/png",
          headers: { "cache-control": "no-store" },
        },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "redesign-proposals", ":proposalId", "confirm"],
    operatorOnly: true,
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ConfirmRedesignProposalBody>(
        ConfirmRedesignProposalBodySchema,
        body,
        "redesign confirmation",
      );
      return withIdempotency(
        context,
        auth,
        req,
        url,
        input.idempotencyKey,
        { ...input },
        async () => {
          const author = resolveAuthor(auth);
          const confirmed = await confirmRedesignProposal(
            redesignProposalContext(context),
            {
              proposalId: requireParam(params, "proposalId"),
              directionId: input.directionId,
              // operatorOnly already rejected every agent token above; the
              // narrowing keeps the decision's author honest in the record.
              author: { kind: "human" as const, id: author.id, label: author.label },
              idempotencyKey: input.idempotencyKey,
            },
          );
          return { status: 200, body: confirmed };
        },
      );
    },
  },
  // ------------------------------------------------ redesign media needs (P2-2)
  {
    // Closing the open media needs an apply left. A write, and a normal one: it
    // goes through the draft's optimistic lock and the audit ledger like any
    // other edit, so a need closed here is undoable like any other change.
    method: "POST",
    segments: ["api", "redesign-proposals", ":proposalId", "media-needs"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ResolveMediaNeedsBody>(
        ResolveMediaNeedsBodySchema,
        body,
        "media need resolution",
      );
      return withIdempotency(
        context,
        auth,
        req,
        url,
        input.idempotencyKey,
        { ...input },
        async () => {
          const author = resolveAuthor(auth);
          const resolved = await resolveRedesignMediaNeeds(
            redesignProposalContext(context),
            {
              proposalId: requireParam(params, "proposalId"),
              // The schema already discriminated the union: an entry that
              // validated as `manual` has no `assetId`, and the other three
              // have one. The engine re-checks the need id and the asset
              // ownership, because a shape check cannot know either.
              resolutions: input.resolutions.map((entry) =>
                entry.treatment === "manual"
                  ? { needId: entry.needId, resolution: { treatment: "manual" as const } }
                  : {
                      needId: entry.needId,
                      resolution: { treatment: entry.treatment, assetId: entry.assetId },
                    },
              ),
              author: { kind: "human" as const, id: author.id, label: author.label },
            },
          );
          return {
            status: 200,
            body: {
              proposal: resolved.proposal,
              closed: resolved.closed,
              stillOpen: resolved.stillOpen,
              draftVersion: resolved.draftVersion,
            },
          };
        },
      );
    },
  },
  // ------------------------------------------------------- settings (T12)
  {
    method: "GET",
    segments: ["api", "settings"],
    scope: "read",
    handler: async (context) => ({ status: 200, body: await settingsView(context) }),
  },
  {
    method: "PUT",
    segments: ["api", "settings"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateSettingsBody>(
        UpdateSettingsBodySchema,
        body,
        "settings",
      );
      if (input.email !== undefined) {
        const patch: SmtpSettingsPatch = {};
        if (input.email.host !== undefined) patch.host = input.email.host;
        if (input.email.port !== undefined) patch.port = input.email.port;
        if (input.email.tls !== undefined) patch.tls = input.email.tls;
        if (input.email.user !== undefined) patch.user = input.email.user;
        if (input.email.from !== undefined) patch.from = input.email.from;
        // A new password is encrypted; null clears it; omitting keeps it.
        if (typeof input.email.password === "string" && input.email.password !== "") {
          patch.passwordEncrypted = await encryptSmtpPassword(
            context.store,
            input.email.password,
          );
        } else if (input.email.password === null) {
          patch.passwordEncrypted = null;
        }
        await context.store.updateSmtpSettings(patch);
      }
      if (input.defaults !== undefined) {
        const patch: EngineSettingsPatch = {};
        if (input.defaults.defaultProfile !== undefined) {
          patch.defaultProfile = input.defaults.defaultProfile;
        }
        if (input.defaults.defaultLayout !== undefined) {
          patch.defaultLayout = input.defaults.defaultLayout;
        }
        if (input.defaults.autostart !== undefined) {
          patch.autostart = input.defaults.autostart;
        }
        await context.store.updateEngineSettings(patch);
      }
      if (input.backup?.targetDir !== undefined) {
        await context.store.updateEngineSettings({
          backupDir: input.backup.targetDir,
        });
      }
      // House DNA and the brief preferences of the reference library (T14).
      // Both branches merge into the stored settings: a branch that is left out
      // keeps its value.
      if (input.referenceDna !== undefined || input.referencePreferences !== undefined) {
        const current = await context.store.getReferenceSettings();
        await context.store.updateReferenceSettings(
          referenceSettingsPatch({
            ...(input.referenceDna === undefined
              ? {}
              : {
                  referenceDna: {
                    name: input.referenceDna.name ?? current.dna.name,
                    description: input.referenceDna.description ?? current.dna.description,
                    constants: input.referenceDna.constants ?? current.dna.constants,
                    never: input.referenceDna.never ?? current.dna.never,
                  },
                }),
            ...(input.referencePreferences === undefined
              ? {}
              : { referencePreferences: input.referencePreferences }),
          }),
        );
      }
      // Image generation (S1): a branch that is left out keeps its value.
      if (input.image !== undefined) {
        const patch: ImageSettingsPatch = {};
        if (input.image.provider !== undefined) patch.provider = input.image.provider;
        if (input.image.fallbackProvider !== undefined) {
          patch.fallbackProvider = input.image.fallbackProvider;
        }
        if (input.image.cooldownMinutes !== undefined) {
          patch.cooldownMinutes = input.image.cooldownMinutes;
        }
        if (input.image.cliPath !== undefined) patch.cliPath = input.image.cliPath.trim();
        if (input.image.baseUrl !== undefined) patch.baseUrl = input.image.baseUrl.trim();
        if (input.image.diffusionModel !== undefined) {
          patch.diffusionModel = input.image.diffusionModel.trim();
        }
        if (input.image.textEncoder !== undefined) {
          patch.textEncoder = input.image.textEncoder.trim();
        }
        if (input.image.vae !== undefined) patch.vae = input.image.vae.trim();
        if (input.image.defaultSteps !== undefined) {
          patch.defaultSteps = input.image.defaultSteps;
        }
        if (input.image.maxPixels !== undefined) patch.maxPixels = input.image.maxPixels;
        if (input.image.timeoutMinutes !== undefined) {
          patch.timeoutMinutes = input.image.timeoutMinutes;
        }
        // Custom endpoint (third path). A new API key is encrypted; null
        // clears it; omitting keeps the stored one.
        if (input.image.customBaseUrl !== undefined) {
          patch.customBaseUrl = input.image.customBaseUrl.trim();
        }
        if (input.image.customModel !== undefined) {
          patch.customModel = input.image.customModel.trim();
        }
        if (input.image.customFormat !== undefined) {
          patch.customFormat = input.image.customFormat;
        }
        if (
          typeof input.image.customApiKey === "string" &&
          input.image.customApiKey !== ""
        ) {
          patch.customApiKeyEncrypted = await encryptImageApiKey(
            context.store,
            input.image.customApiKey,
          );
        } else if (input.image.customApiKey === null) {
          patch.customApiKeyEncrypted = null;
        }
        await context.store.updateImageSettings(patch);
      }
      return { status: 200, body: await settingsView(context) };
    },
  },
  {
    // Sends a single test mail with the stored transport; the result is
    // structured so the UI can name the failure (auth/connection/tls).
    method: "POST",
    segments: ["api", "settings", "email", "test"],
    scope: "write",
    handler: async (context, _params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<TestMailBody>(
        TestMailBodySchema,
        body,
        "test mail",
      );
      const config = await resolveSmtpConfig(context.store);
      if (config === undefined) {
        return {
          status: 200,
          body: {
            ok: false,
            to: input.to,
            reason: "unconfigured",
            message:
              "Keine SMTP-Einstellungen hinterlegt — Host und Absenderadresse zuerst speichern.",
          },
        };
      }
      return {
        status: 200,
        body: await sendTestMail({
          config,
          to: input.to,
          send: context.mailSender ?? smtpMailSender,
        }),
      };
    },
  },
  // ------------------------------------------------------- images (S1)
  {
    // Diagnosis of both providers of the chain: the image-use backend (doctor,
    // capped) and ComfyUI reachability plus the configured model files. With
    // `provider: off` the answer stays a clean state, not an error.
    method: "GET",
    segments: ["api", "images", "health"],
    scope: "read",
    handler: async (context) => {
      const settings = await context.store.getImageSettings();
      if (settings.provider === "off") {
        return {
          status: 200,
          body: {
            provider: settings.provider,
            fallbackProvider: settings.fallbackProvider,
            detail:
              "Bildgenerierung ist in den Einstellungen deaktiviert (provider: off).",
            providers: { "image-use": null, comfyui: null, custom: null },
          },
        };
      }
      const [imageUse, comfyui, custom] = await Promise.all([
        createImageUseProvider(settings).health(),
        createComfyImageProvider(settings).health(),
        createImageCustomProvider(
          {
            baseUrl: settings.customBaseUrl,
            model: settings.customModel,
            format: settings.customFormat,
            maxPixels: settings.maxPixels,
          },
          { resolveApiKey: () => resolveCustomApiKey(context.store) },
        ).health(),
      ]);
      return {
        status: 200,
        body: {
          provider: settings.provider,
          fallbackProvider: settings.fallbackProvider,
          providers: { "image-use": imageUse, comfyui, custom },
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "images", "jobs", ":jobId"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.getImageJob(requireParam(params, "jobId")),
    }),
  },
  {
    method: "DELETE",
    segments: ["api", "images", "jobs", ":jobId"],
    scope: "write",
    handler: async (context, params) => ({
      status: 200,
      body: await context.store.cancelImageJob(requireParam(params, "jobId")),
    }),
  },
  // ------------------------------------- reference collections (T14)
  {
    method: "GET",
    segments: ["api", "reference-collections"],
    scope: "read",
    handler: async (context, _params, _req, url) => {
      const kind = url.searchParams.get("kind");
      if (kind !== null && kind !== "collection" && kind !== "style") {
        throw new SenifyError("validation", `Unknown collection kind "${kind}"`, {
          field: "kind",
          suggestion: 'Use kind=collection or kind=style.',
        });
      }
      return {
        status: 200,
        body: {
          collections: await context.store.listReferenceCollections(
            kind === null ? {} : { kind },
          ),
          styleCatalog: referenceStyleCatalogInfo(),
        },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "reference-collections"],
    scope: "write",
    handler: async (context, _params, req, url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateReferenceCollectionBody>(
        CreateReferenceCollectionBodySchema,
        body,
        "reference collection",
      );
      const { idempotencyKey, ...collectionInput } = input;
      return withIdempotency(context, auth, req, url, idempotencyKey, input, async () => ({
        status: 201,
        body: { collection: await context.store.createReferenceCollection(collectionInput) },
      }));
    },
  },
  {
    // Seed of the style families ("Style guide"). Idempotent: existing families
    // are never overwritten.
    method: "POST",
    segments: ["api", "reference-collections", "styles"],
    scope: "write",
    handler: async (context) => ({
      status: 201,
      body: {
        seed: await seedReferenceStyles(context.store),
        styleCatalog: referenceStyleCatalogInfo(),
      },
    }),
  },
  {
    method: "PATCH",
    segments: ["api", "reference-collections", ":collectionId"],
    scope: "write",
    handler: async (context, params, req) => {
      const collectionId = requireParam(params, "collectionId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UpdateReferenceCollectionBody>(
        UpdateReferenceCollectionBodySchema,
        body,
        "reference collection",
      );
      const name = input.name?.trim();
      if (input.name !== undefined && (name === undefined || name === "")) {
        throw new SenifyError("validation", "Der Name der Sammlung darf nicht leer sein", {
          field: "name",
          suggestion: "Einen Namen mit mindestens einem sichtbaren Zeichen senden.",
        });
      }
      return {
        status: 200,
        body: {
          collection: await context.store.updateReferenceCollection(collectionId, {
            ...(name === undefined ? {} : { name }),
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(input.deployFor === undefined ? {} : { deployFor: input.deployFor }),
            ...(input.vocabulary === undefined ? {} : { vocabulary: input.vocabulary }),
            ...(input.risk === undefined ? {} : { risk: input.risk }),
            ...(input.accent === undefined ? {} : { accent: input.accent }),
            ...(input.imageStyle === undefined ? {} : { imageStyle: input.imageStyle }),
            ...(input.recognize === undefined ? {} : { recognize: input.recognize }),
            ...(input.examples === undefined ? {} : { examples: input.examples }),
            ...(input.warning === undefined ? {} : { warning: input.warning }),
            ...(input.position === undefined ? {} : { position: input.position }),
          }),
        },
      };
    },
  },
  {
    // Deleting a collection keeps its references: they fall back to "without
    // collection" and the count of affected references is reported.
    method: "DELETE",
    segments: ["api", "reference-collections", ":collectionId"],
    scope: "write",
    destructive: true,
    handler: async (context, params) => {
      const collectionId = requireParam(params, "collectionId");
      return {
        status: 200,
        body: {
          deleted: collectionId,
          affectedReferences: await context.store.deleteReferenceCollection(collectionId),
        },
      };
    },
  },
  {
    // Collection brief (the "About this collection" dialog), with the style
    // families of the style guide as well.
    method: "GET",
    segments: ["api", "reference-collections", ":collectionId", "brief"],
    scope: "read",
    handler: async (context, params, req) => {
      const collection = await context.store.getReferenceCollection(
        requireParam(params, "collectionId"),
      );
      const settings = await context.store.getReferenceSettings();
      // The collection brief carries the entry sections of all its references;
      // a style family has none and briefs from the style guide instead.
      const references =
        collection.kind === "style"
          ? []
          : await Promise.all(
              (await context.store.listReferences())
                .filter((entry) => entry.collectionId === collection.id)
                .map((entry) => context.store.getReference(entry.id)),
            );
      return {
        status: 200,
        body: {
          brief: buildCollectionBrief({
            collection,
            references,
            dna: settings.dna,
            preferences: settings.preferences,
            baseUrl: publicBaseUrlOf(req),
          }),
          imagePrompt: null,
          vocabulary: collection.vocabulary.join(", "),
        },
      };
    },
  },
  {
    method: "GET",
    segments: ["api", "backups"],
    scope: "read",
    handler: async (context) => {
      const status = await backupStatus({
        store: context.store,
        dataDir: context.dataDir,
      });
      return {
        status: 200,
        body: { status, backups: await listBackups(status.targetDir) },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "backups"],
    scope: "write",
    handler: async (context) => {
      const run = await createBackup({
        store: context.store,
        dataDir: context.dataDir,
      });
      return { status: 201, body: { backup: run.summary, manifest: run.manifest } };
    },
  },
  {
    // Playing a backup back overwrites tables and the data directory, so the
    // body has to confirm explicitly; the state before the write is copied
    // into a fresh backup and named in the answer.
    method: "POST",
    segments: ["api", "backups", ":name", "restore"],
    scope: "write",
    destructive: true,
    maintenanceExempt: true,
    handler: async (context, params, req) => {
      const body = (await readJsonBody(req)) ?? {};
      if ((body as { confirm?: unknown }).confirm !== true) {
        throw new SenifyError(
          "validation",
          "Wiederherstellung erfordert confirm: true im Körper",
          {
            field: "confirm",
            suggestion:
              "Erst nach ausdrücklicher Bestätigung senden; die Sicherung ersetzt den aktuellen Stand.",
          },
        );
      }
      const name = requireParam(params, "name");
      // The maintenance gate drains running requests and locks out new ones
      // for the time the tables and the data directory are swapped.
      return {
        status: 200,
        body: await context.maintenance.runExclusive(() =>
          restoreBackup({
            store: context.store,
            dataDir: context.dataDir,
            name,
          }),
        ),
      };
    },
  },
  // Framer import (plan S3.3): the job protocol plus the run. The job row is
  // created first (so a crashed run leaves its record), then the import runs
  // inline — local sources are fast, the durable job keeps the report for
  // clients that poll instead of re-running.
  // The job list of a site (the editor's import history).
  {
    // The poll answer: the job record plus its report when the run finished.
    method: "GET",
    segments: ["api", "imports", ":jobId"],
    scope: "read",
    handler: async (context, params) => {
      const jobId = requireParam(params, "jobId");
      const job = await context.store.getImportJob(jobId);
      const report = await context.store.getImportJobResult(jobId);
      return {
        status: 200,
        body: { job, ...(report === null ? {} : { report }) },
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
  // Build files are served from a bake directory: the signed preview and the
  // published release share this shape (deeper paths than a route segment).
  const previewFile = url.pathname.match(
    /^\/api\/previews\/([^/]+)\/files(?:\/(.*))?$/,
  );
  const releaseFile = url.pathname.match(
    /^\/api\/releases\/([^/]+)\/files(?:\/(.*))?$/,
  );
  let matchedRoute: Route | undefined;
  let matchedParams: RouteParams | undefined;
  for (const route of ROUTES) {
    const params = matchRoute(route, method, segments);
    if (params !== undefined) {
      matchedRoute = route;
      matchedParams = params;
      break;
    }
  }
  // A maintenance window keeps the door shut for everything except its own
  // routes (health, the restore): those requests get a 503 to retry later.
  const releaseMaintenance =
    matchedRoute?.maintenanceExempt === true ? null : context.maintenance.enter();
  try {
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
    if (method === "GET" && releaseFile) {
      await serveReleaseFile(
        context,
        res,
        decodeURIComponent(releaseFile[1] ?? ""),
        decodeURIComponent(releaseFile[2] ?? ""),
      );
      return;
    }
    if (matchedRoute !== undefined && matchedParams !== undefined) {
      const auth = await authenticate(context, req, matchedRoute);
      const result = await matchedRoute.handler(
        context,
        matchedParams,
        req,
        url,
        auth,
      );
      if (result.redirect !== undefined) {
        sendRedirect(res, result.redirect);
        return;
      }
      if (result.stream !== undefined) {
        res.writeHead(result.status, {
          "content-type": result.stream.contentType,
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          ...(result.headers ?? {}),
        });
        result.stream.open(res);
        return;
      }
      if (result.text !== undefined) {
        sendText(
          res,
          result.status,
          result.text.body,
          result.text.contentType,
          result.headers ?? {},
        );
        return;
      }
      if (result.file) {
        sendFile(res, result.file);
        return;
      }
      sendJson(res, result.status, result.body, result.headers);
      return;
    }
    sendError(
      res,
      new SenifyError("not_found", `Route ${method} ${url.pathname} does not exist`),
    );
  } finally {
    releaseMaintenance?.();
  }
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
