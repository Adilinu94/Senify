// Die Helfer der HTTP-Schicht: was die Routen und der Dispatcher gemeinsam
// brauchen - Body lesen, Idempotenz, die Kontexte der Fach-Module, die Mutation
// auf einer Seite (ADR-0019).

import type { AuthInfo, EngineContext, RouteParams, RouteResult } from "./http-contract.ts";
import { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { SenifyError } from "@senify/core";
import { isPublicAddress } from "@senify/core/net";
import { AuthError } from "./auth.ts";
import { newEntityId } from "./ids.ts";
import { applyMutations } from "./mutations/apply.ts";
import { designContractViolations, contractGate } from "./design-contract.ts";
import type {
  ApplyMutationsBody,
  AuthorInput,
} from "./mutations/contract.ts";
import type { ApplyEditorMutationsBody } from "./mutations/editor-contract.ts";
import { editorMutationsToSection } from "./mutations/editor-bridge.ts";
import { draftConflictError } from "./paths.ts";
import { hardGuardrailsForTree } from "./guardrails.ts";
import type { LifecycleContext } from "./lifecycle.ts";
import { backupStatus } from "./backup.ts";
import {
  imageView,
  smtpView,
} from "./settings.ts";
import { FormRejection } from "./forms.ts";
import type { ReferenceContext } from "./references-lifecycle.ts";
import type { ReferenceListFilters } from "./references-contract.ts";
import type { RedesignProposalContext } from "./redesign-proposals.ts";
import type { MediaContext } from "./media.ts";
import type {
  ReferenceDna,
  ReferencePreferences,
  ReferenceSummary,
} from "./types.ts";

export const BODY_LIMIT_BYTES = 1024 * 1024;

export function referenceContext(context: EngineContext): ReferenceContext {
  return {
    store: context.store,
    dataDir: context.dataDir,
    ...(context.referenceDeps === undefined ? {} : { deps: context.referenceDeps }),
  };
}

export function redesignProposalContext(context: EngineContext): RedesignProposalContext {
  return {
    store: context.store,
    registry: context.registry,
    dataDir: context.dataDir,
  };
}

export function lifecycleContext(context: EngineContext): LifecycleContext {
  return {
    store: context.store,
    dataDir: context.dataDir,
    formSigner: context.formSigner,
    formBaseUrl: context.formBaseUrl,
    ...(context.visuals === undefined ? {} : { visuals: context.visuals }),
  };
}

export function mediaContext(context: EngineContext): MediaContext {
  return {
    store: context.store,
    dataDir: context.dataDir,
    maxUploadBytes: context.maxUploadBytes,
  };
}

export async function settingsView(
  context: EngineContext,
): Promise<{
  email: ReturnType<typeof smtpView>;
  defaults: { defaultProfile: string; defaultLayout: string; autostart: boolean };
  backup: { targetDir: string };
  referenceDna: ReferenceDna;
  referencePreferences: ReferencePreferences;
  image: ReturnType<typeof imageView>;
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
    image: imageView(image),
  };
}

export function resolveAuthor(auth: AuthInfo | undefined): AuthorInput {
  if (!auth) {
    throw new AuthError(401, "Missing bearer token", {
      suggestion: "Author-bearing routes require a token; the token is the identity.",
    });
  }
  return { kind: auth.kind, id: auth.tokenName, label: auth.tokenName };
}

export function stableJson(value: unknown): string {
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

export async function withIdempotency(
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
  if (claim.state === "committed_unknown") {
    // The write behind this key is committed and its response is gone. Running
    // the operation again would create a second entity, and replaying is
    // impossible, so the honest answer is a conflict that says what happened.
    throw new SenifyError(
      "conflict",
      "This idempotency key was already applied, but its response was lost",
      {
        field: "idempotencyKey",
        suggestion:
          "Read the resource back instead of writing it again, or start over with a fresh key.",
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
  let result: RouteResult;
  try {
    result = await run();
  } catch (error) {
    // The attempt failed and left nothing durable behind: a failed attempt does
    // not burn the key, so the caller may retry it (with a corrected body if the
    // failure was validation).
    await context.store
      .releaseIdempotencyKey({ tokenId: auth.tokenId, route, key })
      .catch(() => undefined);
    throw error;
  }
  try {
    await context.store.completeIdempotencyKey({
      tokenId: auth.tokenId,
      route,
      key,
      status: result.status,
      body: result.body ?? null,
    });
    return result;
  } catch (completionError) {
    // R6: the operation is committed and only its replay response is missing.
    // Releasing the slot here is exactly what turned a retry into a second
    // entity, so the claim stays and the key is recorded as committed with an
    // unknown response. The caller keeps the real result they already earned;
    // a retry hears "already applied" instead of writing a second time.
    console.error("[engine] idempotency completion failed", completionError);
    await context.store
      .markIdempotencyCommitted({ tokenId: auth.tokenId, route, key })
      .catch(() => undefined);
    return {
      ...result,
      headers: { ...result.headers, "idempotency-cached": "false" },
    };
  }
}

export async function readJsonBody(
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

export async function readRawBody(
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

export const FORM_BODY_LIMIT_BYTES = 64 * 1024;

export function clientIpOf(req: Pick<IncomingMessage, "headers" | "socket">): string {
  const peer = req.socket.remoteAddress ?? "unknown";
  if (isPublicAddress(peer)) return peer;
  const forwarded = req.headers["x-forwarded-for"];
  const header = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
  const last = header?.split(",").at(-1)?.trim();
  return last !== undefined && last !== "" ? last : peer;
}

export function originOf(req: IncomingMessage): string | undefined {
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

export function refererPath(req: IncomingMessage): string | undefined {
  const referer = req.headers.referer;
  if (typeof referer !== "string") return undefined;
  try {
    return new URL(referer).pathname;
  } catch {
    return undefined;
  }
}

export function requestHostOf(req: IncomingMessage): string | undefined {
  const host = req.headers.host;
  return typeof host === "string" && host !== "" ? host : undefined;
}

export function publicBaseUrlOf(req: IncomingMessage): string | undefined {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host =
    typeof forwardedHost === "string" && forwardedHost.trim() !== ""
      ? (forwardedHost.split(",")[0]?.trim() ?? undefined)
      : requestHostOf(req);
  if (host === undefined) return undefined;
  const forwarded = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwarded === "string" && forwarded.trim() !== ""
      ? (forwarded.split(",")[0]?.trim() ?? "http")
      : "http";
  return `${proto}://${host}`;
}

export function wantsJson(req: IncomingMessage): boolean {
  return String(req.headers.accept ?? "").includes("application/json");
}

export async function readTextBody(
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

export function parseFormEncoded(text: string): Record<string, string | string[]> {
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

export type ParsedSubmit = {
  token: string;
  values: Record<string, string | string[]>;
  consent: boolean;
  honeypot: string;
};

export async function readSubmitBody(req: IncomingMessage): Promise<ParsedSubmit> {
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

export async function applyMutationsToPage(
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
    // Design-DNA fence (E26, R9): the project's `never` rules are hard for
    // agent tokens and a warning for humans. A manual contract applies to
    // both; the author kind decides the gate.
    const dnaWarnings: string[] = [];
    if (site.designContract !== undefined && site.designContract.never.length > 0) {
      const violations = designContractViolations(outcome.tree, site.designContract);
      const authorKind = auth?.kind ?? "agent";
      const gate = contractGate(violations, authorKind);
      if (gate.error !== undefined) throw gate.error;
      dnaWarnings.push(...gate.warnings);
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
        warnings: [...outcome.warnings, ...dnaWarnings.map((message) => ({ field: "design-dna", message, suggestion: "" }))],
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
    // Live follow (ticket 05): the write is durable, the event tells the
    // program and the open editor what changed (page, nodes, actor).
    context.events.publish({
      kind: "draft.changed",
      siteId: page.siteId,
      pageId: page.id,
      nodeIds: touchedNodeIds(input),
      action: input.mutations[0]?.op ?? "batch",
      actor: author,
    });
    return {
      newDraftVersion: newVersion,
      undoBatchId: batchId,
      warnings: [...outcome.warnings, ...dnaWarnings.map((message) => ({ field: "design-dna", message, suggestion: "" }))],
      results: outcome.results,
    };
  });
}

export async function applyEditorMutationsToPage(
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

export function pathOpIndex(input: ApplyMutationsBody): number | undefined {
  let found: number | undefined;
  input.mutations.forEach((mutation, index) => {
    if (mutation.op === "updatePageMeta" && mutation.path !== undefined) {
      found = index;
    }
  });
  return found;
}

export function touchedNodeIds(input: ApplyMutationsBody): string[] {
  const ids = new Set<string>();
  for (const mutation of input.mutations) {
    const record = mutation as Record<string, unknown>;
    if (typeof record.id === "string") ids.add(record.id);
    const node = record.node;
    if (node !== null && typeof node === "object") {
      const nodeId = (node as Record<string, unknown>).id;
      if (typeof nodeId === "string") ids.add(nodeId);
    }
    for (const key of ["parent", "target"] as const) {
      const ref = record[key];
      if (ref !== null && typeof ref === "object") {
        const nodeId = (ref as Record<string, unknown>).nodeId;
        if (typeof nodeId === "string") ids.add(nodeId);
      }
    }
  }
  return [...ids];
}

export function withPathOpIndex(
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

// The list filters of the reference library: collection, family, status and the
// search over title, family, note, vocabulary and collection name (app.js:17).
export function filterReferences(
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

export function requireParam(params: RouteParams, key: string): string {
  const value = params[key];
  if (!value) {
    throw new SenifyError("validation", `Missing ${key}`, { field: key });
  }
  return value;
}

export function limitParam(url: URL, fallback = 50): number {
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
