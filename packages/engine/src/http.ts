import {
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash } from "node:crypto";
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
import { renderEntryPreview } from "./bake.ts";
import {
  CreatePageBodySchema,
  CreateSiteBodySchema,
  parseApplyMutationsBody,
  parseBody,
  UpdateThemeBodySchema,
  type ApplyMutationsBody,
  type AuthorInput,
  type CreatePageBody,
  type CreateSiteBody,
  type UpdateThemeBody,
} from "./mutations/contract.ts";
import {
  parseApplyEditorMutationsBody,
  type ApplyEditorMutationsBody,
} from "./mutations/editor-contract.ts";
import { editorMutationsToSection } from "./mutations/editor-bridge.ts";
import { motionVendorFiles } from "@senify/renderer";
import { draftConflictError } from "./paths.ts";
import { RateLimiter, RateLimitError } from "./rate-limit.ts";
import { hardGuardrailsForTree } from "./guardrails.ts";
import {
  CreateStyleRuleBodySchema,
  DuplicateSiteBodySchema,
  ReorderStyleRuleBodySchema,
  SiteEventBodySchema,
  UpdateSiteBodySchema,
  UpdateStyleRuleBodySchema,
  type CreateStyleRuleBody,
  type DuplicateSiteBody,
  type UpdateSiteBody,
  type ReorderStyleRuleBody,
  type SiteEventBody,
  type UpdateStyleRuleBody,
} from "./site-contract.ts";
import {
  approveReview,
  createPreview,
  discardReview,
  expirePreviews,
  publishRelease,
  requestChanges,
  resolveBuildFile,
  resolvePreviewFile,
  resolveReleaseFile,
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
import type {
  EngineSettingsPatch,
  ImageSettingsPatch,
  SmtpSettingsPatch,
} from "./store.ts";
import { backupStatus, createBackup, listBackups, restoreBackup } from "./backup.ts";
import { MaintenanceError, type MaintenanceGate } from "./maintenance.ts";
import { reviewVisualFileNames, type ReviewVisualDriver } from "./review-visuals.ts";
import { sendTestMail, smtpMailSender, type MailSender } from "./mailer.ts";
import { createComfyImageProvider } from "./image-comfy.ts";
import { createImageUseProvider } from "./image-use-provider.ts";
import { validateImageRequest } from "./image-provider.ts";
import {
  CreateImageJobBodySchema,
  type CreateImageJobBody,
} from "./images-contract.ts";
import {
  encryptSmtpPassword,
  referenceSettingsPatch,
  resolveSmtpConfig,
  smtpView,
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
  createCollectionFromForm,
  FormRejection,
  listSiteForms,
  listSubmissions,
  planCollectionFromForm,
  submitForm,
  tickNotifications,
  unsubscribeNewsletter,
  type FormSigner,
} from "./forms.ts";
import {
  FormCollectionCreateBodySchema,
  FormCollectionPlanBodySchema,
  FormTickBodySchema,
  type FormCollectionCreateBody,
  type FormCollectionPlanBody,
  type FormTickBody,
} from "./forms-contract.ts";
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
  EntryPreviewBodySchema,
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
  type EntryPreviewBody,
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
  analyzeReference,
  applyReference,
  deleteReference,
  editReferenceProfile,
  referenceThemeDraft,
  removeReferenceAssignment,
  runDueReferenceJobs,
  verifyReferenceApply,
  type ReferenceContext,
  type ReferenceDeps,
} from "./references-lifecycle.ts";
import {
  AnalyzeReferenceBodySchema,
  ApplyReferenceBodySchema,
  CreateReferenceCollectionBodySchema,
  EditReferenceProfileBodySchema,
  MANUAL_REFERENCE_BODY_LIMIT_BYTES,
  ManualReferenceBodySchema,
  parseReferenceListFilters,
  ReferenceBriefBodySchema,
  ReferenceTickBodySchema,
  referenceDocumentsFrom,
  referenceFooterText,
  UpdateReferenceBodySchema,
  UpdateReferenceCollectionBodySchema,
  type AnalyzeReferenceBody,
  type ApplyReferenceBody,
  type CreateReferenceCollectionBody,
  type EditReferenceProfileBody,
  type ManualReferenceBody,
  type ReferenceBriefBody,
  type ReferenceTickBody,
  type ReferenceListFilters,
  type UpdateReferenceBody,
  type UpdateReferenceCollectionBody,
} from "./references-contract.ts";
import {
  createManualReference,
  referenceStyleCatalogInfo,
  seedReferenceStyles,
} from "./references-library.ts";
import { buildRedesignPackage } from "./redesign-package.ts";
import {
  buildCollectionBrief,
  buildImagePrompt,
  buildReferenceBrief,
} from "./references-brief.ts";
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
import type {
  ImageJobRequest,
  ImageJobStatus,
  ImageSettings,
  ReferenceDna,
  ReferencePreferences,
  ReferenceSummary,
  ReviewStatus,
  TokenKind,
  TokenScope,
} from "./types.ts";
import { IMAGE_JOB_STATUSES, REVIEW_STATUSES } from "./types.ts";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const BODY_LIMIT_BYTES = 1024 * 1024;

export type EngineContext = {
  store: Store;
  registry: Registry;
  locks: PageLocks;
  rateLimiter: RateLimiter;
  // Maintenance window (T12 restore): blocks requests while it runs.
  maintenance: MaintenanceGate;
  dataDir: string;
  maxUploadBytes: number;
  uploadSigner: UploadSigner;
  // Forms (T11): the token signer and a per-IP limiter for the public endpoint.
  formSigner: FormSigner;
  formRateLimiter: RateLimiter;
  formBaseUrl?: string;
  // Settings (T12): the mail sender used for test mails and the outbox. Tests
  // inject a double so no run ever talks to a real SMTP server.
  mailSender?: MailSender;
  // References (T14): the injected capture/analyzer dependencies. Without them
  // the live Playwright path and the heuristic analyzer are used.
  referenceDeps?: ReferenceDeps;
  // Review visuals (T07): the injected capture driver of a submit.
  visuals?: ReviewVisualDriver;
};

function referenceContext(context: EngineContext): ReferenceContext {
  return {
    store: context.store,
    dataDir: context.dataDir,
    ...(context.referenceDeps === undefined ? {} : { deps: context.referenceDeps }),
  };
}

function lifecycleContext(context: EngineContext): LifecycleContext {
  return {
    store: context.store,
    dataDir: context.dataDir,
    formSigner: context.formSigner,
    formBaseUrl: context.formBaseUrl,
    ...(context.visuals === undefined ? {} : { visuals: context.visuals }),
  };
}

function mediaContext(context: EngineContext): MediaContext {
  return {
    store: context.store,
    dataDir: context.dataDir,
    maxUploadBytes: context.maxUploadBytes,
  };
}

// The settings view the app reads: SMTP without the password, the defaults, the
// backup target (T12), the reference preferences (T14) and the image generation
// (S1).
async function settingsView(
  context: EngineContext,
): Promise<{
  email: ReturnType<typeof smtpView>;
  defaults: { defaultProfile: string; defaultLayout: string; autostart: boolean };
  backup: { targetDir: string };
  referenceDna: ReferenceDna;
  referencePreferences: ReferencePreferences;
  image: ImageSettings;
}> {
  const [email, settings, status, references, image] = await Promise.all([
    context.store.getSmtpSettings(),
    context.store.getEngineSettings(),
    backupStatus({ store: context.store, dataDir: context.dataDir }),
    context.store.getReferenceSettings(),
    context.store.getImageSettings(),
  ]);
  return {
    email: smtpView(email),
    defaults: {
      defaultProfile: settings.defaultProfile,
      defaultLayout: settings.defaultLayout,
      autostart: settings.autostart,
    },
    backup: { targetDir: status.targetDir },
    referenceDna: references.dna,
    referencePreferences: references.preferences,
    image,
  };
}

type AuthInfo = {
  tokenId: string;
  tokenName: string;
  kind: TokenKind;
  scopes: TokenScope[];
};

// The audited author is always the token, never the request body (ticket 18):
// a direct API call cannot claim a foreign identity or a different kind. The
// body's `author` stays a suggestion that the server overrides here.
function resolveAuthor(auth: AuthInfo | undefined): AuthorInput {
  if (!auth) {
    throw new AuthError(401, "Missing bearer token", {
      suggestion: "Author-bearing routes require a token; the token is the identity.",
    });
  }
  return { kind: auth.kind, id: auth.tokenName, label: auth.tokenName };
}

// Deterministic JSON for the idempotency fingerprint: object keys are sorted
// recursively, so two requests that differ only in key order are the same.
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// Idempotent create (ticket 18, slice 2): the request claims a slot keyed by
// (token, route, key) before it runs. A retry replays the stored response, a
// concurrent duplicate is rejected as in-flight, and a failed attempt releases
// the slot so the same key may be retried (with a corrected body if needed).
async function withIdempotency(
  context: EngineContext,
  auth: AuthInfo | undefined,
  req: IncomingMessage,
  url: URL,
  key: string | undefined,
  body: Record<string, unknown>,
  run: () => Promise<RouteResult>,
): Promise<RouteResult> {
  if (key === undefined || auth === undefined) return run();
  const route = `${req.method ?? "POST"} ${url.pathname}`;
  const { idempotencyKey: _ignored, ...fingerprintBody } = body;
  const fingerprint = createHash("sha256")
    .update(stableJson(fingerprintBody))
    .digest("hex");
  const claim = await context.store.claimIdempotencyKey({
    tokenId: auth.tokenId,
    route,
    key,
    fingerprint,
  });
  if (claim.state === "replay") {
    return {
      status: claim.status,
      body: claim.body,
      headers: { "idempotency-replayed": "true" },
    };
  }
  if (claim.state === "mismatch") {
    throw new SenifyError(
      "conflict",
      "This idempotency key was already used with a different request",
      {
        field: "idempotencyKey",
        suggestion:
          "Use a fresh key for a different request, or resend the original body.",
      },
    );
  }
  if (claim.state === "in_progress") {
    throw new SenifyError(
      "conflict",
      "A request with this idempotency key is still in progress",
      {
        field: "idempotencyKey",
        suggestion: "Retry in a moment; the first attempt has not finished yet.",
      },
    );
  }
  try {
    const result = await run();
    await context.store.completeIdempotencyKey({
      tokenId: auth.tokenId,
      route,
      key,
      status: result.status,
      body: result.body ?? null,
    });
    return result;
  } catch (error) {
    // A failed attempt does not burn the key: the caller may retry it.
    await context.store
      .releaseIdempotencyKey({ tokenId: auth.tokenId, route, key })
      .catch(() => undefined);
    throw error;
  }
}

type RouteResult = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  // Plain-text response (CSV export).
  text?: {
    contentType: string;
    body: string;
  };
  // 303 to a page: the no-JavaScript path after a form submit or newsletter
  // confirmation.
  redirect?: string;
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
  ".webm": "video/webm",
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

function sendRedirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { location });
  res.end();
}

function sendText(
  res: ServerResponse,
  status: number,
  text: string,
  contentType: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
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
  if (error instanceof MaintenanceError) {
    sendJson(
      res,
      503,
      {
        error: {
          category: error.category,
          message: error.message,
          ...(error.field !== undefined ? { field: error.field } : {}),
          ...(error.suggestion !== undefined
            ? { suggestion: error.suggestion }
            : {}),
        },
      },
      { "retry-after": "5" },
    );
    return;
  }
  if (error instanceof FormRejection) {
    sendJson(
      res,
      error.status,
      {
        error: {
          category: error.category,
          reason: error.reason,
          message: error.message,
          ...(error.field !== undefined ? { field: error.field } : {}),
          ...(error.suggestion !== undefined
            ? { suggestion: error.suggestion }
            : {}),
        },
      },
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

async function readJsonBody(
  req: IncomingMessage,
  limitBytes = BODY_LIMIT_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > limitBytes) {
      throw new SenifyError(
        "validation",
        limitBytes === BODY_LIMIT_BYTES
          ? "Request body exceeds 1 MB"
          : `Request body exceeds ${Math.floor(limitBytes / (1024 * 1024))} MB`,
        {
          suggestion:
            limitBytes === BODY_LIMIT_BYTES
              ? "Split large batches into smaller mutation requests."
              : "Ein kleineres Bild senden (Obergrenze 20 MB).",
        },
      );
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

const FORM_BODY_LIMIT_BYTES = 64 * 1024;

function clientIpOf(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof first === "string" && first.trim() !== "") {
    return first.split(",")[0]?.trim() ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

function originOf(req: IncomingMessage): string | undefined {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== "") return origin;
  const referer = req.headers.referer;
  if (typeof referer === "string" && referer !== "") {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function refererPath(req: IncomingMessage): string | undefined {
  const referer = req.headers.referer;
  if (typeof referer !== "string") return undefined;
  try {
    return new URL(referer).pathname;
  } catch {
    return undefined;
  }
}

function requestHostOf(req: IncomingMessage): string | undefined {
  const host = req.headers.host;
  return typeof host === "string" && host !== "" ? host : undefined;
}

// The JS path asks for JSON; the plain browser POST does not.
function wantsJson(req: IncomingMessage): boolean {
  return String(req.headers.accept ?? "").includes("application/json");
}

async function readTextBody(
  req: IncomingMessage,
  limitBytes: number,
): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > limitBytes) {
      throw new FormRejection("body_cap", "Einsendung überschreitet das Größenlimit", {
        suggestion: `Höchstens ${Math.floor(limitBytes / 1024)} KB senden.`,
      });
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseFormEncoded(text: string): Record<string, string | string[]> {
  const params = new URLSearchParams(text);
  const values: Record<string, string | string[]> = {};
  for (const [key, value] of params.entries()) {
    const existing = values[key];
    if (existing === undefined) values[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else values[key] = [existing, value];
  }
  return values;
}

type ParsedSubmit = {
  token: string;
  values: Record<string, string | string[]>;
  consent: boolean;
  honeypot: string;
};

// One endpoint, two encodings: the browser posts urlencoded, the JS island
// posts the same FormData (also urlencoded) and agents may post JSON.
async function readSubmitBody(req: IncomingMessage): Promise<ParsedSubmit> {
  const text = await readTextBody(req, FORM_BODY_LIMIT_BYTES);
  const contentType = String(req.headers["content-type"] ?? "");
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const raw = parseFormEncoded(text);
    const token = typeof raw.form_token === "string" ? raw.form_token : "";
    const consentValue = raw.consent;
    const consent =
      consentValue === "true" || consentValue === "on" || consentValue === "1";
    const honeypot =
      typeof raw.company === "string" ? raw.company : "";
    const values = { ...raw };
    delete values.form_token;
    delete values.consent;
    return { token, values, consent, honeypot };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = (text === "" ? {} : JSON.parse(text)) as Record<string, unknown>;
  } catch {
    throw new SenifyError("validation", "Request body must be valid JSON", {
      suggestion: "Send a JSON object with token and values.",
    });
  }
  const token =
    typeof parsed.token === "string"
      ? parsed.token
      : typeof parsed.form_token === "string"
        ? parsed.form_token
        : "";
  const values =
    parsed.values && typeof parsed.values === "object" && !Array.isArray(parsed.values)
      ? (parsed.values as Record<string, string | string[]>)
      : {};
  const honeypot = typeof parsed.honeypot === "string" ? parsed.honeypot : "";
  return { token, values, consent: parsed.consent === true, honeypot };
}

async function applyMutationsToPage(
  context: EngineContext,
  pageId: string,
  input: ApplyMutationsBody,
  auth: AuthInfo | undefined,
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
    // The site profile is part of the gate (ticket 21): intensity cap, preset
    // classes, pin budget.
    const site = await context.store.getSite(page.siteId);
    const guardrails = hardGuardrailsForTree(outcome.tree, site.profile);
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
    // The token is the identity for the whole batch; the body author is only
    // a suggestion and never reaches the audit log (ticket 18).
    const author = resolveAuthor(auth);
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
            author,
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

// The canvas persists its v2 editor ops through the same write path: they are
// translated into the section vocabulary and handed to `applyMutationsToPage`,
// so the conflict check, the hard guardrails, the version bump, the audit log
// and the optimistic locking are all shared with the section mutations route.
async function applyEditorMutationsToPage(
  context: EngineContext,
  pageId: string,
  input: ApplyEditorMutationsBody,
  auth: AuthInfo | undefined,
): Promise<RouteResult["body"]> {
  // The author is resolved from the token inside `applyMutationsToPage`; the
  // section envelope carries no author on this path.
  const sectionBody: ApplyMutationsBody = {
    baseDraftVersion: input.baseDraftVersion,
    ...(input.dry_run === undefined ? {} : { dry_run: input.dry_run }),
    mutations: editorMutationsToSection(input.mutations),
  };
  return applyMutationsToPage(context, pageId, sectionBody, auth);
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
  // Ausgelieferte Dateien (Bilder einer Referenz) laufen nicht in die
  // Drosselung: eine Uebersicht laedt leicht mehr als 60 Bilder je Minute.
  rateLimit?: boolean;
  // Health and the restore itself stay reachable during a maintenance window;
  // the restore acquires the gate from its handler.
  maintenanceExempt?: boolean;
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
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<UpdateSiteBody>(
        UpdateSiteBodySchema,
        body,
        "site update",
      );
      if (parsed.name === undefined && parsed.profile === undefined) {
        throw new SenifyError(
          "validation",
          "Nothing to update: pass a name or a profile",
          {
            field: "body",
            suggestion: 'Send { "name": "…" } or { "profile": "clean|standard|showcase" }.',
          },
        );
      }
      let site = await context.store.getSite(siteId);
      if (parsed.name !== undefined) {
        site = await context.store.renameSite(siteId, parsed.name);
        await context.store.recordSiteEvent({
          siteId,
          mutation: "rename_site",
          params: { name: parsed.name },
          author: resolveAuthor(auth),
        });
      }
      if (parsed.profile !== undefined) {
        site = await context.store.updateSiteProfile(siteId, parsed.profile);
        await context.store.recordSiteEvent({
          siteId,
          mutation: "update_site_profile",
          params: { profile: parsed.profile },
          author: resolveAuthor(auth),
        });
      }
      return { status: 200, body: site };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "trash"],
    scope: "publish",
    destructive: true,
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<SiteEventBody>(SiteEventBodySchema, body, "site trash");
      const site = await context.store.trashSite(siteId);
      await context.store.recordSiteEvent({
        siteId,
        mutation: "trash_site",
        params: {},
        author: resolveAuthor(auth),
      });
      return { status: 200, body: site };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "restore"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<SiteEventBody>(SiteEventBodySchema, body, "site restore");
      const site = await context.store.restoreSite(siteId);
      await context.store.recordSiteEvent({
        siteId,
        mutation: "restore_site",
        params: {},
        author: resolveAuthor(auth),
      });
      return { status: 200, body: site };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "duplicate"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<DuplicateSiteBody>(
        DuplicateSiteBodySchema,
        body,
        "site duplicate",
      );
      const site = await context.store.duplicateSite(siteId, {
        withContent: parsed.withContent ?? false,
        author: resolveAuthor(auth),
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
    handler: async (context, params, req, url, auth) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const body = (await readJsonBody(req)) ?? {};
      const pageBody = parseBody<CreatePageBody>(CreatePageBodySchema, body, "page");
      const { idempotencyKey, ...pageInput } = pageBody;
      return withIdempotency(context, auth, req, url, idempotencyKey, pageBody, async () => {
        const page = await context.store.createPage(siteId, pageInput);
        return { status: 201, body: page };
      });
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
    handler: async (context, params, req, _url, auth) => {
      const siteId = params.siteId;
      if (!siteId) throw new SenifyError("validation", "Missing site id", { field: "siteId" });
      const body = (await readJsonBody(req)) ?? {};
      const themeBody = parseBody<UpdateThemeBody>(UpdateThemeBodySchema, body, "theme update");
      const updated = await context.store.updateTheme(
        siteId,
        themeBody.theme,
        resolveAuthor(auth),
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
    segments: ["api", "sites", ":siteId", "style-rules"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      return { status: 200, body: { rules: await context.store.listStyleRules(siteId) } };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "style-rules"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<CreateStyleRuleBody>(
        CreateStyleRuleBodySchema,
        body,
        "style rule",
      );
      const { author: _suggestion, ...input } = parsed;
      const rule = await context.store.createStyleRule(siteId, input, resolveAuthor(auth));
      return { status: 201, body: rule };
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      return { status: 200, body: await context.store.getStyleRule(siteId, ruleId) };
    },
  },
  {
    method: "PATCH",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<UpdateStyleRuleBody>(
        UpdateStyleRuleBodySchema,
        body,
        "style rule update",
      );
      const { author: _suggestion, ...patch } = parsed;
      return {
        status: 200,
        body: await context.store.updateStyleRule(siteId, ruleId, patch, resolveAuthor(auth)),
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId", "reorder"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      const body = (await readJsonBody(req)) ?? {};
      const parsed = parseBody<ReorderStyleRuleBody>(
        ReorderStyleRuleBodySchema,
        body,
        "style rule reorder",
      );
      const rules = await context.store.reorderStyleRule(
        siteId,
        ruleId,
        parsed.index,
        resolveAuthor(auth),
      );
      return { status: 200, body: { rules } };
    },
  },
  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId", "style-rules", ":ruleId"],
    scope: "publish",
    destructive: true,
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const ruleId = requireParam(params, "ruleId");
      const body = (await readJsonBody(req)) ?? {};
      // The body stays validated (closed shape); the token is the identity.
      parseBody<SiteEventBody>(SiteEventBodySchema, body, "style rule delete");
      await context.store.deleteStyleRule(siteId, ruleId, resolveAuthor(auth));
      return { status: 204 };
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
    method: "POST",
    segments: ["api", "sites", ":siteId", "releases"],
    scope: "publish",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<PublishReleaseBody>(
        PublishReleaseBodySchema,
        body,
        "release",
      );
      const result = await publishRelease(lifecycleContext(context), {
        siteId,
        author: resolveAuthor(auth),
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
    // Re-bake jobs (E12 slice 1): the durable outbox behind content changes.
    // The status is the read side of the worker — queued, running, done, failed
    // with attempts, next attempt time and the last error.
    method: "GET",
    segments: ["api", "sites", ":siteId", "bake-jobs"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      return {
        status: 200,
        body: { jobs: await context.store.listBakeJobs(siteId) },
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
    method: "POST",
    segments: ["api", "sites", ":siteId", "previews"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreatePreviewBody>(
        CreatePreviewBodySchema,
        body,
        "preview",
      );
      const preview = await createPreview(lifecycleContext(context), {
        siteId,
        author: resolveAuthor(auth),
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
    handler: async (context, params, req, _url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<SubmitReviewBody>(
        SubmitReviewBodySchema,
        body,
        "review",
      );
      const result = await submitReview(lifecycleContext(context), {
        siteId,
        author: resolveAuthor(auth),
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
    method: "POST",
    segments: ["api", "sites", ":siteId", "assets", "upload-url"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<UploadUrlBody>(
        UploadUrlBodySchema,
        body,
        "upload request",
      );
      const { idempotencyKey, ...uploadInput } = input;
      return withIdempotency(context, auth, req, url, idempotencyKey, input, async () => {
        const { uploadId, ticket } = await createUploadTicket(mediaContext(context), {
          siteId,
          body: uploadInput,
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
      });
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
    handler: async (context, params, req, url, auth) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateEntryBody>(
        CreateEntryBodySchema,
        body,
        "entry",
      );
      const { idempotencyKey, ...entryInput } = input;
      return withIdempotency(context, auth, req, url, idempotencyKey, input, async () => ({
        status: 201,
        body: await createEntry(context.store, {
          siteId,
          body: { ...entryInput, author: resolveAuthor(auth) },
        }),
      }));
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
    // The program's form overview: latest snapshot per form, for the
    // submissions view (fields, target collection, source page).
    method: "GET",
    segments: ["api", "sites", ":siteId", "forms"],
    scope: "read",
    handler: async (context, params) => ({
      status: 200,
      body: { forms: await listSiteForms(context.store, requireParam(params, "siteId")) },
    }),
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
    // Entry-based view for the program; the same rows the entry tools expose.
    method: "GET",
    segments: ["api", "sites", ":siteId", "submissions"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const collectionId = url.searchParams.get("collectionId") ?? undefined;
      const view = await listSubmissions(context.store, {
        siteId,
        ...(collectionId === undefined ? {} : { collectionId }),
        limit: limitParam(url, 200),
      });
      return {
        status: 200,
        body: { source: view.source, columns: view.columns, rows: view.rows },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "forms", "collection-plan"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<FormCollectionPlanBody>(
        FormCollectionPlanBodySchema,
        body,
        "form collection plan",
      );
      return {
        status: 200,
        body: await planCollectionFromForm(context.store, {
          siteId,
          formId: input.formId,
        }),
      };
    },
  },
  {
    // One click: creates the target collection with fields + status template.
    method: "POST",
    segments: ["api", "sites", ":siteId", "forms", "collection"],
    scope: "write",
    handler: async (context, params, req) => {
      const siteId = requireParam(params, "siteId");
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<FormCollectionCreateBody>(
        FormCollectionCreateBodySchema,
        body,
        "form collection",
      );
      return {
        status: 201,
        body: await createCollectionFromForm(context.store, {
          siteId,
          formId: input.formId,
          ...(input.name === undefined ? {} : { name: input.name }),
        }),
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
    method: "GET",
    segments: ["api", "sites", ":siteId", "notifications"],
    scope: "read",
    handler: async (context, params, _req, url) => ({
      status: 200,
      body: {
        notifications: await context.store.listNotifications(
          requireParam(params, "siteId"),
          limitParam(url, 50),
        ),
      },
    }),
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
          }),
          imagePrompt: references.length === 1 ? buildImagePrompt(references[0]!) : null,
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
            ...(input.documents === undefined
              ? {}
              : { documents: referenceDocumentsFrom(input.documents) }),
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
    // Design brief of one reference plus its image prompt.
    method: "GET",
    segments: ["api", "references", ":referenceId", "brief"],
    scope: "read",
    handler: async (context, params) => {
      const reference = await context.store.getReference(
        requireParam(params, "referenceId"),
      );
      const settings = await context.store.getReferenceSettings();
      return {
        status: 200,
        body: {
          brief: buildReferenceBrief({
            references: [reference],
            dna: settings.dna,
            preferences: settings.preferences,
          }),
          imagePrompt: buildImagePrompt(reference),
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
    // Project assignment of references + the derived theme draft (T14 reuse).
    method: "GET",
    segments: ["api", "sites", ":siteId", "references"],
    scope: "read",
    handler: async (context, params) => {
      const siteId = requireParam(params, "siteId");
      const references = referenceContext(context);
      const { draft, verification } = await referenceThemeDraft(references, siteId);
      return {
        status: 200,
        body: {
          assignments: await context.store.listReferenceAssignments(siteId),
          draft,
          verification,
          unchanged: await verifyReferenceApply(references, siteId),
        },
      };
    },
  },
  {
    method: "POST",
    segments: ["api", "sites", ":siteId", "references"],
    scope: "write",
    handler: async (context, params, req, _url, auth) => {
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<ApplyReferenceBody>(
        ApplyReferenceBodySchema,
        body,
        "reference assignment",
      );
      const result = await applyReference(referenceContext(context), {
        siteId: requireParam(params, "siteId"),
        referenceId: input.referenceId,
        author: resolveAuthor(auth),
        ...(input.scales === undefined ? {} : { scales: input.scales }),
      });
      return { status: 201, body: result };
    },
  },
  {
    method: "DELETE",
    segments: ["api", "sites", ":siteId", "references", ":referenceId"],
    scope: "write",
    destructive: true,
    handler: async (context, params) => ({
      status: 200,
      body: await removeReferenceAssignment(referenceContext(context), {
        siteId: requireParam(params, "siteId"),
        referenceId: requireParam(params, "referenceId"),
      }),
    }),
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
            providers: { "image-use": null, comfyui: null },
          },
        };
      }
      const [imageUse, comfyui] = await Promise.all([
        createImageUseProvider(settings).health(),
        createComfyImageProvider(settings).health(),
      ]);
      return {
        status: 200,
        body: {
          provider: settings.provider,
          fallbackProvider: settings.fallbackProvider,
          providers: { "image-use": imageUse, comfyui },
        },
      };
    },
  },
  {
    // Starts a durable image job (S2): the worker walks the provider chain and
    // commits the result through the media pipeline.
    method: "POST",
    segments: ["api", "sites", ":siteId", "images", "jobs"],
    scope: "write",
    handler: async (context, params, req, url, auth) => {
      const siteId = requireParam(params, "siteId");
      await context.store.getSite(siteId);
      const body = (await readJsonBody(req)) ?? {};
      const input = parseBody<CreateImageJobBody>(
        CreateImageJobBodySchema,
        body,
        "image job",
      );
      const settings = await context.store.getImageSettings();
      const provider = input.provider ?? settings.provider;
      if (provider === "off") {
        throw new SenifyError(
          "validation",
          "Bildgenerierung ist in den Einstellungen deaktiviert (provider: off)",
          {
            field: "image.provider",
            suggestion: "Den Provider in den Einstellungen aktivieren.",
          },
        );
      }
      let prompt = input.prompt?.trim() ?? "";
      if (prompt === "" && input.referenceId !== undefined) {
        const reference = await context.store.getReference(input.referenceId);
        const built = buildImagePrompt(reference);
        if (built === null) {
          throw new SenifyError(
            "validation",
            `Referenz "${input.referenceId}" hat kein Bildrezept`,
            {
              field: "referenceId",
              suggestion:
                "get_reference_brief liefert imagePrompt, sobald ein Rezept hinterlegt ist.",
            },
          );
        }
        prompt = built;
      }
      if (prompt === "") {
        throw new SenifyError("validation", "prompt oder referenceId ist nötig", {
          field: "prompt",
          suggestion: "Einen Prompt senden oder eine Referenz mit Bildrezept angeben.",
        });
      }
      const request: ImageJobRequest = {
        prompt,
        width: input.width ?? 1024,
        height: input.height ?? 1024,
        steps: input.steps ?? settings.defaultSteps,
        ...(input.seed === undefined ? {} : { seed: input.seed }),
        filename:
          input.filename?.trim() ?? `senify-bild-${newEntityId().slice(0, 8)}.png`,
        altText: input.altText?.trim() ?? null,
        decorative: input.decorative ?? false,
        folderId: input.folderId ?? null,
        tags: input.tags ?? [],
        provider,
        ...(input.referenceId === undefined
          ? {}
          : { referenceId: input.referenceId }),
      };
      validateImageRequest(provider, request, settings.maxPixels);
      return withIdempotency(
        context,
        auth,
        req,
        url,
        input.idempotencyKey,
        input,
        async () => {
          const job = await context.store.enqueueImageJob({ siteId, request });
          return {
            status: 202,
            body: { jobId: job.id, status: job.status, provider },
          };
        },
      );
    },
  },
  {
    method: "GET",
    segments: ["api", "sites", ":siteId", "images", "jobs"],
    scope: "read",
    handler: async (context, params, _req, url) => {
      const siteId = requireParam(params, "siteId");
      const status = url.searchParams.get("status");
      if (
        status !== null &&
        !IMAGE_JOB_STATUSES.includes(status as ImageJobStatus)
      ) {
        throw new SenifyError("validation", `Unknown image job status "${status}"`, {
          field: "status",
          suggestion: `Use one of: ${IMAGE_JOB_STATUSES.join(", ")}.`,
        });
      }
      return {
        status: 200,
        body: {
          jobs: await context.store.listImageJobs(siteId, {
            ...(status === null ? {} : { status: status as ImageJobStatus }),
          }),
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
    handler: async (context, params) => {
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
];

// The list filters of the reference library: collection, family, status and the
// search over title, family, note, vocabulary and collection name (app.js:17).
function filterReferences(
  references: ReferenceSummary[],
  filters: ReferenceListFilters,
): ReferenceSummary[] {
  let result = references;
  if (filters.collection === "none") {
    result = result.filter((reference) => reference.collectionId === null);
  } else if (filters.collection !== undefined) {
    result = result.filter(
      (reference) => reference.collectionId === filters.collection,
    );
  }
  const family = filters.family;
  if (family !== undefined) {
    // The library family of the card counts as well as the analysed taxonomy.
    result = result.filter(
      (reference) =>
        reference.family === family || reference.families.includes(family),
    );
  }
  const status = filters.status;
  if (status !== undefined) {
    result = result.filter((reference) => reference.status === status);
  }
  const query = filters.query?.toLowerCase();
  if (query !== undefined) {
    result = result.filter((reference) =>
      [
        reference.name,
        reference.sourceUrl,
        reference.family ?? "",
        reference.note ?? "",
        ...reference.families,
        ...reference.vocabulary,
        reference.collection?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }
  return result;
}

function requireParam(params: RouteParams, key: string): string {
  const value = params[key];
  if (!value) {
    throw new SenifyError("validation", `Missing ${key}`, { field: key });
  }
  return value;
}

function limitParam(url: URL, fallback = 50): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw new SenifyError("validation", "limit must be an integer between 1 and 500", {
      field: "limit",
    });
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
  const file = previewFileTarget(preview.buildRef, relativePath, (path) =>
    resolvePreviewFile(preview, path),
  );
  if (!file) {
    sendError(
      res,
      new SenifyError("validation", "Invalid preview file path", {
        field: "path",
      }),
    );
    return;
  }
  // An HTML document links the build's own files root-absolute
  // (/assets/theme.css, /_astro/…, page links). Nothing serves the build root
  // next to the preview, so the document keeps all of them inside its own
  // build — including for previews baked before the pages became self-contained.
  if (extname(file).toLowerCase() === ".html") {
    const html = readFileSync(file, "utf8");
    sendText(
      res,
      200,
      rewriteToBuildPrefix(html, `/api/previews/${preview.id}/files/`, preview.token),
      CONTENT_TYPES[".html"] ?? "text/html; charset=utf-8",
      { "cache-control": "no-store" },
    );
    return;
  }
  sendFile(res, { path: file });
}

// `/assets/theme.css` → `<prefix>assets/theme.css?token=…`: the leading slash
// of every local URL is replaced and the preview token is carried into the
// sub-resource request, because the signed preview serves every file by token.
// Foreign URLs (http/https, protocol-relative) and fragment links stay as they
// are.
function rewriteToBuildPrefix(html: string, prefix: string, token: string): string {
  const suffix = `token=${encodeURIComponent(token)}`;
  const local = (value: string): string => {
    if (!value.startsWith("/") || value.startsWith("//")) return value;
    const hashIndex = value.indexOf("#");
    const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
    const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
    const queryIndex = beforeHash.indexOf("?");
    const path = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
    const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "";
    const merged = query === "" ? suffix : `${query}&${suffix}`;
    return `${prefix}${path.slice(1)}?${merged}${hash}`;
  };
  return html.replace(
    /\b(href|src|srcset)="([^"]*)"/g,
    (match, attribute: string, value: string) => {
      const rewritten =
        attribute === "srcset"
          ? value
              .split(",")
              .map((entry) => {
                const [url, ...rest] = entry.trim().split(/\s+/);
                return [local(url ?? ""), ...rest].join(" ");
              })
              .join(", ")
          : local(value);
      return rewritten === value ? match : `${attribute}="${rewritten}"`;
    },
  );
}

// The published site: releases have no token, a browser opens them directly
// (`/api/releases/<id>/files/…`), and their pages link the build root files
// (theme.css, _astro/*, islands.js) that `/assets/<file>` and `/_astro/<file>`
// serve from the newest build.
async function serveReleaseFile(
  context: EngineContext,
  res: ServerResponse,
  releaseId: string,
  relativePath: string,
): Promise<void> {
  let release;
  try {
    release = await context.store.getRelease(releaseId);
  } catch (error) {
    sendError(res, error);
    return;
  }
  if (release.buildRef === null) {
    sendError(
      res,
      new SenifyError("not_found", `Release "${releaseId}" has no build`, {
        suggestion: "Publish the site first.",
      }),
    );
    return;
  }
  const file = previewFileTarget(release.buildRef, relativePath, (path) =>
    resolveReleaseFile(release, path),
  );
  if (!file) {
    sendError(
      res,
      new SenifyError("validation", "Invalid release file path", {
        field: "path",
      }),
    );
    return;
  }
  sendFile(res, { path: file });
}

// A build is a directory tree: a request that ends in a folder (or at the build
// root itself) answers with its index page.
function previewFileTarget(
  root: string,
  relativePath: string,
  resolveInBuild: (path: string) => string | undefined,
): string | undefined {
  const requested =
    relativePath === "" || relativePath.endsWith("/")
      ? `${relativePath}index.html`
      : relativePath;
  const file = resolveInBuild(requested);
  if (file === undefined) return undefined;
  if (existsSync(file) && statSync(file).isDirectory()) {
    return resolveBuildFile(root, `${requested.replace(/\/+$/, "")}/index.html`);
  }
  return file;
}

// Root files of a bake. The baked pages link them as `/assets/theme.css`,
// `/assets/islands.js` and `/_astro/<hash>.css`; the asset store keeps its own
// `/assets/<id>/<file>` route (a different prefix depth, no collision).
const BUILD_ROOT_FILES = new Set([
  "theme.css",
  "components.css",
  "sections.css",
  "islands.js",
  "page.js",
  "forms.js",
  // The theme webfonts (Sora, Inter): the theme CSS references them as root
  // files, the bake copies them next to it (ticket 17).
  "sora-400.woff2",
  "sora-600.woff2",
  "sora-700.woff2",
  "inter-400.woff2",
  "inter-500.woff2",
  "inter-600.woff2",
]);

// Which build serves those root paths? `?release=`/`?preview=` pick one
// explicitly (the preview needs its token), otherwise the published state wins:
// the active release of a site, and while nothing is published yet the newest
// ready preview. The engine is a local, single-operator program.
async function currentBuildRoot(
  context: EngineContext,
  url: URL,
): Promise<string | undefined> {
  const releaseId = url.searchParams.get("release");
  if (releaseId !== null) {
    const release = await context.store.getRelease(releaseId);
    return release.buildRef ?? undefined;
  }
  const previewId = url.searchParams.get("preview");
  if (previewId !== null) {
    const preview = await context.store.getPreview(previewId);
    if (url.searchParams.get("token") !== preview.token) {
      throw new AuthError(401, "Preview token is missing or invalid", {
        suggestion: "Use the signed preview URL from the review item.",
      });
    }
    return preview.buildRef;
  }
  const sites = await context.store.listSites();
  for (const site of sites) {
    const activeId = await context.store.getActiveReleaseId(site.id);
    if (activeId === null) continue;
    const release = await context.store.getRelease(activeId);
    if (release.buildRef !== null && existsSync(release.buildRef)) {
      return release.buildRef;
    }
  }
  let newest: { buildRef: string; createdAt: string } | undefined;
  for (const site of sites) {
    for (const preview of await context.store.listPreviews(site.id)) {
      if (preview.status !== "ready") continue;
      if (Date.parse(preview.expiresAt) <= Date.now()) continue;
      if (newest === undefined || preview.createdAt > newest.createdAt) {
        newest = preview;
      }
    }
  }
  return newest?.buildRef;
}

async function buildRootFile(
  context: EngineContext,
  url: URL,
  relativePath: string,
): Promise<{ status: number; file: { path: string; headers: Record<string, string> } }> {
  const root = await currentBuildRoot(context, url);
  if (root === undefined) {
    throw new SenifyError("not_found", `Build file "${relativePath}" does not exist`, {
      suggestion: "Publish a release or create a preview first.",
    });
  }
  const file = resolveBuildFile(root, relativePath);
  if (file === undefined || !existsSync(file) || !statSync(file).isFile()) {
    throw new SenifyError("not_found", `Build file "${relativePath}" does not exist`, {
      field: "filename",
    });
  }
  // Revalidate: a new release replaces the file under the stable path.
  return {
    status: 200,
    file: { path: file, headers: { "cache-control": "public, max-age=0, must-revalidate" } },
  };
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
