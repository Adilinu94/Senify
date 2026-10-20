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
import {
  parseBody,
} from "./mutations/contract.ts";
import { motionVendorFiles } from "@senify/renderer";
import {
  approveReview,
  discardReview,
  requestChanges,
} from "./lifecycle.ts";
import {
  ReviewActionBodySchema,
  type ReviewActionBody,
} from "./lifecycle-contract.ts";
import type {
  EngineSettingsPatch,
  ImageSettingsPatch,
  SmtpSettingsPatch,
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
  updateCollection,
} from "./content.ts";
import {
  UpdateCollectionBodySchema,
  type UpdateCollectionBody,
} from "./content-contract.ts";
import {
  ConfirmRedesignProposalBodySchema,
  ResolveMediaNeedsBodySchema,
  type ConfirmRedesignProposalBody,
  type ResolveMediaNeedsBody,
} from "./redesign-proposal-contract.ts";
import {
  confirmRedesignProposal,
  getRedesignProposalView,
  proposalCardScreenshot,
  resolveRedesignMediaNeeds,
} from "./redesign-proposals.ts";
import {
  CreateLibraryComponentBodySchema,
  UpdateLibraryComponentBodySchema,
  type CreateLibraryComponentBody,
  type UpdateLibraryComponentBody,
} from "./library-contract.ts";
import { commitUpload } from "./media.ts";
import { resolveStoredFile, storedFileName } from "./storage.ts";
import type {
  TokenScope,
} from "./types.ts";
import { existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import {
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
  wantsJson,
  readSubmitBody,
  requireParam,
  limitParam,
} from "./http-route-support.ts";
import { siteRoutes } from "./http-routes-sites.ts";
import type { AuthInfo, EngineContext, Route, RouteParams } from "./http-contract.ts";
import { referenceRoutes } from "./http-routes-references.ts";
import { pageRoutes } from "./http-routes-pages.ts";
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
  ...referenceRoutes,
  ...pageRoutes,
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
  // ----------------------------------------------- redesign proposals (ADR-0012)
  // The human direction step. The agent proposes and reads; only a human
  // operator confirms, and the confirm is one command (decision + apply).
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
