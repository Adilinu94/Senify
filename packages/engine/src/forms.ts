import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SenifyError } from "@senify/core";
import type { Author, NodeTree } from "@senify/section-sdk";
import {
  formSnapshotFromNode,
  isFormSection,
  stampFormsInTree,
  type FormField,
  type FormFieldKind,
  type FormSnapshot,
} from "@senify/renderer";
import type { CreateCollectionBody, FieldDefInput } from "./content-contract.ts";
import { createCollectionFromFields, createEntry, listEntries, publishEntry, updateEntry } from "./content.ts";
import { newEntityId } from "./ids.ts";
import { smtpMailSender, type MailSender } from "./mailer.ts";
import type { RateLimiter } from "./rate-limit.ts";
import { RateLimitError } from "./rate-limit.ts";
import { resolveSmtpConfig } from "./settings.ts";
import { slugify, type Store } from "./store.ts";
import type {
  CheckIssue,
  Collection,
  Entry,
  EntryStatus,
  FieldDef,
  FieldType,
  FormSnapshotRecord,
  Page,
  SubmissionRow,
} from "./types.ts";

// Native forms (artifacts/26): spam protection is automatic, the endpoint only
// trusts the frozen snapshot and every rejection names its cause.

export const MIN_FILL_MS = 2_000;
export const DEFAULT_CONFIRM_TTL_HOURS = 48;
export const MAX_NOTIFICATION_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 3_600_000;
const BODY_CAP_BYTES = 64 * 1024;

// Reserved auto keys of a collection created from a form (artifacts/26 §3).
export const FORM_AUTO_KEYS = {
  status: "status",
  submittedAt: "submitted_at",
  sourcePath: "source_path",
  consentText: "consent_text",
  consentIpHash: "consent_ip_hash",
} as const;

export const FORM_AUTHOR: Author = {
  kind: "agent",
  id: "senify-forms",
  label: "Formular",
};

export type FormRejectionReason =
  | "token"
  | "spam"
  | "origin"
  | "rate_limited"
  | "unknown_field"
  | "validation"
  | "body_cap"
  | "unconfigured"
  | "newsletter";

export class FormRejection extends SenifyError {
  readonly reason: FormRejectionReason;
  readonly status: number;

  constructor(
    reason: FormRejectionReason,
    message: string,
    options: { field?: string; suggestion?: string; status?: number } = {},
  ) {
    super(reason === "rate_limited" ? "auth" : "validation", message, {
      ...(options.field === undefined ? {} : { field: options.field }),
      ...(options.suggestion === undefined
        ? {}
        : { suggestion: options.suggestion }),
    });
    this.name = "FormRejection";
    this.reason = reason;
    this.status = options.status ?? (reason === "token" ? 401 : 400);
  }
}

// ------------------------------------------------------------------ token

export type FormTokenPayload = {
  siteId: string;
  formId: string;
  snapshotId: string;
  issuedAt: number;
};

export type FormSigner = {
  sign(payload: FormTokenPayload): string;
  verify(token: string): FormTokenPayload | undefined;
};

export function createFormSigner(secret: string): FormSigner {
  const mac = (body: string): string =>
    createHmac("sha256", secret).update(body).digest("base64url");
  return {
    sign(payload) {
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
      return `${body}.${mac(body)}`;
    },
    verify(token) {
      const index = token.indexOf(".");
      if (index <= 0) return undefined;
      const body = token.slice(0, index);
      const signature = token.slice(index + 1);
      const expected = mac(body);
      const given = Buffer.from(signature);
      const wanted = Buffer.from(expected);
      if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
        return undefined;
      }
      try {
        const parsed = JSON.parse(
          Buffer.from(body, "base64url").toString("utf8"),
        ) as Partial<FormTokenPayload>;
        if (
          typeof parsed.siteId !== "string" ||
          typeof parsed.formId !== "string" ||
          typeof parsed.snapshotId !== "string" ||
          typeof parsed.issuedAt !== "number"
        ) {
          return undefined;
        }
        return {
          siteId: parsed.siteId,
          formId: parsed.formId,
          snapshotId: parsed.snapshotId,
          issuedAt: parsed.issuedAt,
        };
      } catch {
        return undefined;
      }
    },
  };
}

// ------------------------------------------------------------------- bake

export type FormStampTarget = {
  id: string;
  path: string;
  tree: NodeTree;
};

// Freezes every form of a bake and stamps the signed descriptor into the node.
export async function stampFormsForBuild(input: {
  store: Store;
  signer: FormSigner;
  siteId: string;
  pages: FormStampTarget[];
  baseUrl?: string;
}): Promise<FormSnapshotRecord[]> {
  const records: FormSnapshotRecord[] = [];
  for (const page of input.pages) {
    await stampFormsInTree({
      tree: page.tree,
      context: { siteId: input.siteId, pageId: page.id, pagePath: page.path },
      stamp: async (snapshot) => {
        const formId = await input.store.resolveFormId({
          siteId: input.siteId,
          pageId: page.id,
          nodeId: snapshot.nodeId,
        });
        const snapshotId = newEntityId();
        records.push(
          await input.store.saveFormSnapshot({
            id: snapshotId,
            formId,
            siteId: input.siteId,
            pageId: page.id,
            nodeId: snapshot.nodeId,
            pagePath: page.path,
            sectionType: snapshot.sectionType,
            snapshot,
          }),
        );
        const token = input.signer.sign({
          siteId: input.siteId,
          formId,
          snapshotId,
          issuedAt: Date.now(),
        });
        const action = `${input.baseUrl ?? ""}/api/forms/${encodeURIComponent(formId)}/submit`;
        return { formId, snapshotId, token, action };
      },
    });
  }
  return records;
}

// ---------------------------------------------------- collection from form

export function fieldTypeFor(kind: FormFieldKind): FieldType {
  switch (kind) {
    case "email":
      return "email";
    case "textarea":
      return "longText";
    case "checkbox":
      return "boolean";
    case "date":
      return "date";
    case "number":
      return "number";
    case "select":
    case "radios":
      return "select";
    default:
      return "text";
  }
}

function statusOptions(mode: FormSnapshot["mode"]): { value: string; label: string }[] {
  return mode === "newsletter"
    ? [
        { value: "pending", label: "Unbestätigt" },
        { value: "confirmed", label: "Bestätigt" },
        { value: "unsubscribed", label: "Abgemeldet" },
      ]
    : [
        { value: "neu", label: "Neu" },
        { value: "beantwortet", label: "Beantwortet" },
      ];
}

// The one-click template: form fields become collection fields, plus the
// auto/status fields submissions fill in (artifacts/26 §3).
export function collectionFieldsForForm(snapshot: FormSnapshot): CreateCollectionBody {
  const fields: FieldDefInput[] = snapshot.fields.map((field) => ({
    key: field.key,
    label: field.label,
    description: `Formularfeld "${field.label}".`,
    type: fieldTypeFor(field.kind),
    ...(field.required ? { required: true } : {}),
    ...(field.options === undefined ? {} : { options: field.options }),
  }));
  fields.push(
    {
      key: FORM_AUTO_KEYS.status,
      label: "Status",
      description: "Bearbeitungsstand der Einsendung.",
      type: "select",
      options: statusOptions(snapshot.mode),
    },
    {
      key: FORM_AUTO_KEYS.submittedAt,
      label: "Eingegangen am",
      description: "Zeitpunkt des Absendens.",
      type: "dateTime",
    },
    {
      key: FORM_AUTO_KEYS.sourcePath,
      label: "Quellseite",
      description: "Pfad der Seite, auf der das Formular stand.",
      type: "text",
    },
    {
      key: FORM_AUTO_KEYS.consentText,
      label: "Zustimmungstext",
      description: "Textfassung der erteilten Einwilligung.",
      type: "text",
    },
    {
      key: FORM_AUTO_KEYS.consentIpHash,
      label: "IP-Hash",
      description: "Gesalzener Hash der Absender-IP (DSGVO-Nachweis).",
      type: "text",
    },
  );
  return {
    name: `${snapshot.name} — Einsendungen`,
    // Slim supports: no draft workflow, submissions appear immediately.
    supports: ["seo", "search"],
    fields,
  };
}

export async function planCollectionFromForm(
  store: Store,
  input: { siteId: string; formId: string },
): Promise<{ snapshot: FormSnapshot; collection: CreateCollectionBody }> {
  const record = await requireFormSnapshot(store, input.formId, input.siteId);
  return { snapshot: record.snapshot, collection: collectionFieldsForForm(record.snapshot) };
}

export async function createCollectionFromForm(
  store: Store,
  input: { siteId: string; formId: string; name?: string },
): Promise<{ collection: Collection; snapshot: FormSnapshot }> {
  const record = await requireFormSnapshot(store, input.formId, input.siteId);
  const body = collectionFieldsForForm(record.snapshot);
  const collection = await createCollectionFromFields(store, {
    siteId: input.siteId,
    body: { ...body, name: input.name?.trim() || body.name },
  });
  return { collection, snapshot: record.snapshot };
}

async function requireFormSnapshot(
  store: Store,
  formId: string,
  siteId: string,
): Promise<FormSnapshotRecord> {
  const record = await store.getFormSnapshotForForm(formId);
  if (record === undefined || record.siteId !== siteId) {
    throw new SenifyError("not_found", `Formular "${formId}" existiert nicht`, {
      field: "formId",
      suggestion: "Bake die Seite neu — dann liegt wieder ein Snapshot vor.",
    });
  }
  return record;
}

// ---------------------------------------------------------------- origin

function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function allowedOriginHosts(siteSlug: string, siteBaseUrl?: string): string[] {
  const hosts = [`${siteSlug}.senify.xyz`];
  const own = siteBaseUrl === undefined ? undefined : hostOf(siteBaseUrl);
  if (own !== undefined) hosts.push(own);
  const configured = process.env.SENIFY_FORMS_ORIGINS;
  if (configured !== undefined) {
    for (const entry of configured.split(",")) {
      const host = hostOf(entry.trim()) ?? entry.trim().toLowerCase();
      if (host !== "") hosts.push(host);
    }
  }
  return hosts;
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

// Origin is mandatory: a same-site/staging request may pass, a foreign one
// never does (artifacts/26 §2).
export function assertAllowedOrigin(input: {
  origin: string | undefined;
  requestHost: string | undefined;
  siteSlug: string;
  siteBaseUrl?: string;
}): void {
  if (input.origin === undefined || input.origin.trim() === "") {
    throw new FormRejection(
      "origin",
      "Origin-Header fehlt — Einsendung abgewiesen",
      { field: "origin", suggestion: "Sende die Einsendung aus dem Browser der Seite." },
    );
  }
  const host = hostOf(input.origin);
  if (host === undefined) {
    throw new FormRejection("origin", `Origin "${input.origin}" ist ungültig`, {
      field: "origin",
    });
  }
  const requestHost = input.requestHost?.split(":")[0]?.toLowerCase() ?? "";
  const allowed =
    isLocalHost(host) ||
    (requestHost !== "" && host === requestHost) ||
    allowedOriginHosts(input.siteSlug, input.siteBaseUrl).includes(host);
  if (!allowed) {
    throw new FormRejection(
      "origin",
      `Origin "${input.origin}" ist für dieses Formular nicht erlaubt`,
      {
        field: "origin",
        suggestion: "Nur die eigene Website darf Einsendungen absenden.",
      },
    );
  }
}

// ------------------------------------------------------------ submission

export type FormSubmitInput = {
  store: Store;
  signer: FormSigner;
  rateLimiter: RateLimiter;
  formId: string;
  token: string;
  values: Record<string, string | string[]>;
  consent: boolean;
  honeypot: string;
  origin: string | undefined;
  requestHost: string | undefined;
  clientIp: string;
  now?: number;
};

export type FormSubmitResult = {
  ok: true;
  state: "created" | "pending";
  message: string;
  entryId: string;
  pagePath: string;
  redirectUrl: string | null;
};

function stringValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function hasValue(value: string | string[] | undefined): boolean {
  const text = stringValue(value).trim();
  return text !== "";
}

function failField(message: string, field: string, suggestion: string): never {
  throw new FormRejection("validation", message, { field, suggestion });
}

function validateField(field: FormField, value: string | string[] | undefined): void {
  const label = `"${field.label}"`;
  if (field.kind === "checkbox") {
    const checked =
      hasValue(value) &&
      ["true", "on", "1", "ja"].includes(stringValue(value).toLowerCase());
    if (field.required && !checked) {
      failField(`${label} muss bestätigt werden`, field.key, "Zustimmung ankreuzen.");
    }
    return;
  }
  if (!hasValue(value)) {
    if (field.required) {
      failField(`${label} ist ein Pflichtfeld`, field.key, "Feld ausfüllen.");
    }
    return;
  }
  const text = stringValue(value).trim();
  switch (field.kind) {
    case "email":
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) {
        failField(`${label} braucht eine gültige E-Mail-Adresse`, field.key, "Adresse prüfen.");
      }
      break;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        failField(`${label} braucht ein Datum (JJJJ-MM-TT)`, field.key, "Datum prüfen.");
      }
      break;
    case "number": {
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) {
        failField(`${label} braucht eine Zahl`, field.key, "Zahl eingeben.");
      }
      if (field.validation?.min !== undefined && parsed < field.validation.min) {
        failField(`${label} muss mindestens ${field.validation.min} sein`, field.key, "Wert erhöhen.");
      }
      if (field.validation?.max !== undefined && parsed > field.validation.max) {
        failField(`${label} darf höchstens ${field.validation.max} sein`, field.key, "Wert senken.");
      }
      break;
    }
    case "select":
    case "radios": {
      const allowed = (field.options ?? []).map((option) => option.value);
      if (!allowed.includes(text)) {
        failField(`${label}: "${text}" ist keine gültige Auswahl`, field.key, `Erlaubt: ${allowed.join(", ")}.`);
      }
      break;
    }
    default:
      break;
  }
  if (field.validation?.min !== undefined && text.length < field.validation.min) {
    failField(`${label} ist zu kurz (min. ${field.validation.min})`, field.key, "Mehr Zeichen eingeben.");
  }
  if (field.validation?.max !== undefined && text.length > field.validation.max) {
    failField(`${label} ist zu lang (max. ${field.validation.max})`, field.key, "Kürzen.");
  }
  if (field.validation?.pattern !== undefined) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(field.validation.pattern);
    } catch {
      pattern = /$^/;
    }
    if (!pattern.test(text)) {
      failField(`${label} passt nicht zum Muster`, field.key, "Format prüfen.");
    }
  }
}

function validateSubmission(
  snapshot: FormSnapshot,
  values: Record<string, string | string[]>,
): void {
  const allowed = new Set<string>([
    ...snapshot.fields.map((field) => field.key),
    snapshot.honeypotKey,
    "consent",
  ]);
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) {
      throw new FormRejection(
        "unknown_field",
        `Unbekanntes Feld "${key}" — Einsendung abgewiesen`,
        { field: key, suggestion: "Nur die Felder der eingefrorenen Formular-Definition senden." },
      );
    }
  }
  for (const field of snapshot.fields) validateField(field, values[field.key]);
}

function collectionFieldByKey(
  collection: Collection,
  key: string,
): FieldDef | undefined {
  return collection.fields.find((field) => field.key === key && field.deprecated !== true);
}

function submissionSlug(title: string): string {
  const base = slugify(title).slice(0, 40) || "einsendung";
  return `${base}-${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
}

// A pseudonym of the visitor's address for the consent record. Keyed with the
// engine secret, which stays out of backups (ADR-0017): a plain SHA-256 over an
// IPv4 address can be reversed by trying all 2^32 inputs.
function ipHash(secret: string, siteId: string, clientIp: string): string {
  return createHmac("sha256", secret)
    .update(`consent-ip:${siteId}:${clientIp}`)
    .digest("hex")
    .slice(0, 24);
}

function deriveTitle(
  snapshot: FormSnapshot,
  values: Record<string, string | string[]>,
  now: number,
): string {
  for (const field of snapshot.fields) {
    if (!["text", "email", "phone", "textarea"].includes(field.kind)) continue;
    const text = stringValue(values[field.key]).trim();
    if (text !== "") return text.slice(0, 120);
  }
  return `Einsendung ${new Date(now).toISOString().slice(0, 16)}`;
}

function buildCells(input: {
  snapshot: FormSnapshot;
  collection: Collection;
  values: Record<string, string | string[]>;
  statusValue: string;
  now: number;
  ipHashValue: string;
}): Record<string, string | number | boolean> {
  const { snapshot, collection } = input;
  const cells: Record<string, string | number | boolean> = {};
  for (const field of snapshot.fields) {
    const def = collectionFieldByKey(collection, field.key);
    if (def === undefined) continue;
    const raw = input.values[field.key];
    if (field.kind === "checkbox") {
      const checked =
        hasValue(raw) &&
        ["true", "on", "1", "ja"].includes(stringValue(raw).toLowerCase());
      if (def.type === "boolean") {
        cells[def.id] = checked;
      } else if (checked) {
        cells[def.id] = stringValue(raw);
      }
      continue;
    }
    if (!hasValue(raw)) continue;
    cells[def.id] =
      def.type === "number" ? Number(stringValue(raw)) : stringValue(raw);
  }
  const titleField = collection.fields.find(
    (field) => field.id === collection.titleField,
  );
  if (titleField !== undefined && cells[titleField.id] === undefined) {
    cells[titleField.id] = deriveTitle(snapshot, input.values, input.now);
  }
  const auto: [string, string][] = [
    [FORM_AUTO_KEYS.status, input.statusValue],
    [FORM_AUTO_KEYS.submittedAt, new Date(input.now).toISOString().slice(0, 16)],
    [FORM_AUTO_KEYS.sourcePath, snapshot.pagePath],
    [FORM_AUTO_KEYS.consentText, snapshot.consent?.text ?? ""],
    [FORM_AUTO_KEYS.consentIpHash, input.ipHashValue],
  ];
  for (const [key, value] of auto) {
    const def = collectionFieldByKey(collection, key);
    if (def !== undefined && value !== "") cells[def.id] = value;
  }
  return cells;
}

async function createSubmissionEntry(input: {
  store: Store;
  snapshot: FormSnapshot;
  collection: Collection;
  values: Record<string, string | string[]>;
  statusValue: string;
  now: number;
  clientIp: string;
}): Promise<{ entry: Entry; title: string }> {
  const title = deriveTitle(input.snapshot, input.values, input.now);
  const cells = buildCells({
    snapshot: input.snapshot,
    collection: input.collection,
    values: input.values,
    statusValue: input.statusValue,
    now: input.now,
    ipHashValue: ipHash(
      await input.store.getOrCreateEngineSecret(),
      input.snapshot.siteId,
      input.clientIp,
    ),
  });
  const entry = await createEntry(input.store, {
    siteId: input.snapshot.siteId,
    body: {
      collectionId: input.collection.id,
      slug: submissionSlug(title),
      cells,
      author: FORM_AUTHOR,
    },
  });
  // Slim supports (no draft workflow): the submission is live right away.
  if (!input.collection.supports.includes("drafts")) {
    await publishEntry(input.store, { entryId: entry.id, author: FORM_AUTHOR });
    return { entry: await input.store.getEntry(entry.id), title };
  }
  return { entry, title };
}

function notificationBody(input: {
  snapshot: FormSnapshot;
  values: Record<string, string | string[]>;
  title: string;
  now: number;
}): string {
  const lines = [
    `Formular: ${input.snapshot.name}`,
    `Quellseite: ${input.snapshot.pagePath}`,
    `Zeitpunkt: ${new Date(input.now).toISOString()}`,
    "",
  ];
  for (const field of input.snapshot.fields) {
    lines.push(`${field.label}: ${stringValue(input.values[field.key])}`);
  }
  lines.push("", `Ansicht: /api/forms/${input.snapshot.pageId}/submissions`);
  return lines.join("\n");
}

export async function submitForm(input: FormSubmitInput): Promise<FormSubmitResult> {
  const now = input.now ?? Date.now();
  const payload = input.signer.verify(input.token);
  if (payload === undefined || payload.formId !== input.formId) {
    throw new FormRejection("token", "Formular-Token ist ungültig", {
      field: "form_token",
      suggestion: "Seite neu laden — der Token wurde neu gestempelt.",
    });
  }
  const record = await input.store.getFormSnapshot(payload.snapshotId).catch(() => {
    throw new FormRejection("token", "Formular-Snapshot existiert nicht mehr", {
      field: "form_token",
      suggestion: "Seite neu laden, dann erneut absenden.",
    });
  });
  const snapshot = record.snapshot;
  if (record.siteId !== payload.siteId) {
    throw new FormRejection("token", "Formular-Token passt nicht zur Seite", {
      field: "form_token",
    });
  }
  const site = await input.store.getSite(snapshot.siteId);
  assertAllowedOrigin({
    origin: input.origin,
    requestHost: input.requestHost,
    siteSlug: site.slug,
    ...(site.baseUrl === undefined ? {} : { siteBaseUrl: site.baseUrl }),
  });

  // Honeypot: a bot fills every field, a person never sees it.
  if (hasValue(input.values[snapshot.honeypotKey]) || hasValue(input.honeypot)) {
    throw new FormRejection("spam", "Spam abgewiesen: Honeypot gefüllt", {
      field: snapshot.honeypotKey,
    });
  }
  // Too fast: a human cannot read and fill a form in under MIN_FILL_MS.
  if (now - payload.issuedAt < MIN_FILL_MS) {
    throw new FormRejection("spam", "Spam abgewiesen: Formular zu schnell abgesendet", {
      suggestion: `Bitte mindestens ${MIN_FILL_MS / 1000} s ausfüllen.`,
    });
  }
  if (JSON.stringify(input.values).length > BODY_CAP_BYTES) {
    throw new FormRejection("body_cap", "Einsendung ist zu groß", {
      suggestion: "Kürzere Werte senden.",
    });
  }
  try {
    input.rateLimiter.check(`forms-ip:${input.clientIp}`, false);
    input.rateLimiter.check(`forms-form:${input.clientIp}:${input.formId}`, false);
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new FormRejection(
        "rate_limited",
        "Zu viele Einsendungen — bitte kurz warten",
        {
          status: 429,
          suggestion: `Erneut in ${error.retryAfterSeconds} s versuchen.`,
        },
      );
    }
    throw error;
  }

  validateSubmission(snapshot, input.values);
  if (snapshot.consent !== null && input.consent !== true) {
    failField(
      "Zustimmung zur Datenschutzerklärung fehlt",
      "consent",
      "Kontrollkästchen anhaken.",
    );
  }
  if (snapshot.targetCollectionId === null) {
    throw new FormRejection(
      "unconfigured",
      "Formular hat keine Ziel-Sammlung",
      { field: "targetCollectionId", suggestion: "Erst die Sammlung anlegen und verknüpfen." },
    );
  }
  const collection = await input.store.getCollection(snapshot.targetCollectionId);
  if (collection.siteId !== snapshot.siteId || collection.deprecatedAt !== null) {
    throw new FormRejection(
      "unconfigured",
      "Ziel-Sammlung des Formulars ist nicht aktiv",
      { field: "targetCollectionId" },
    );
  }

  const isNewsletter = snapshot.mode === "newsletter";
  const { entry, title } = await createSubmissionEntry({
    store: input.store,
    snapshot,
    collection,
    values: input.values,
    statusValue: isNewsletter ? "pending" : "neu",
    now,
    clientIp: input.clientIp,
  });

  if (isNewsletter) {
    const email = stringValue(input.values.email).toLowerCase();
    const expiresAt = new Date(
      now + DEFAULT_CONFIRM_TTL_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const confirm = await input.store.createNewsletterToken({
      siteId: snapshot.siteId,
      formId: input.formId,
      entryId: entry.id,
      email,
      kind: "confirm",
      expiresAt,
    });
    await input.store.createNewsletterToken({
      siteId: snapshot.siteId,
      formId: input.formId,
      entryId: entry.id,
      email,
      kind: "unsubscribe",
      expiresAt: null,
    });
    await input.store.enqueueNotification({
      siteId: snapshot.siteId,
      formId: input.formId,
      entryId: entry.id,
      kind: "newsletter_confirmation",
      recipient: email,
      subject: "Bitte bestätige deine Newsletter-Anmeldung",
      body: [
        `Hallo,`,
        "",
        `bitte bestätige deine Anmeldung: /api/newsletter/confirm?token=${confirm.token}`,
        `Mit dem Klick ist die Anmeldung gültig; der Link läuft in ${DEFAULT_CONFIRM_TTL_HOURS} h ab.`,
      ].join("\n"),
    });
    return {
      ok: true,
      state: "pending",
      message: snapshot.successMessage,
      entryId: entry.id,
      pagePath: snapshot.pagePath,
      redirectUrl: null,
    };
  }

  await input.store.enqueueNotification({
    siteId: snapshot.siteId,
    formId: input.formId,
    entryId: entry.id,
    kind: "submission",
    recipient: snapshot.notifyEmail ?? "",
    subject: `Neue Einsendung: ${snapshot.name} — ${title}`,
    body: notificationBody({ snapshot, values: input.values, title, now }),
  });
  const redirectPage = await successPageUrl(input.store, snapshot);
  return {
    ok: true,
    state: "created",
    message: snapshot.successMessage,
    entryId: entry.id,
    pagePath: snapshot.pagePath,
    redirectUrl: redirectPage,
  };
}

async function successPageUrl(
  store: Store,
  snapshot: FormSnapshot,
): Promise<string | null> {
  if (snapshot.successPageId === null) return null;
  const page = await store.getPage(snapshot.successPageId).catch(() => undefined);
  return page === undefined ? null : `${page.path}?gesendet=1`;
}

// ------------------------------------------------------------- newsletter

export type NewsletterTransition = {
  state: "confirmed" | "unsubscribed" | "already";
  entryId: string;
  redirectUrl: string | null;
};

async function setStatusCell(
  store: Store,
  entryId: string,
  statusValue: string,
): Promise<Entry> {
  const entry = await store.getEntry(entryId);
  const collection = await store.getCollection(entry.collectionId);
  const field = collectionFieldByKey(collection, FORM_AUTO_KEYS.status);
  if (field === undefined) return entry;
  if (entry.cells[field.id] === statusValue) return entry;
  return updateEntry(store, {
    entryId,
    body: { baseVersion: entry.version, cells: { [field.id]: statusValue }, author: FORM_AUTHOR },
  });
}

export async function confirmNewsletter(
  store: Store,
  input: { token: string; now?: number },
): Promise<NewsletterTransition> {
  const now = input.now ?? Date.now();
  const record = await store.getNewsletterToken(input.token);
  if (record === undefined || record.kind !== "confirm") {
    throw new FormRejection("newsletter", "Bestätigungslink ist ungültig", {
      field: "token",
      status: 404,
      suggestion: "Den Link aus der Bestätigungsmail verwenden.",
    });
  }
  if (record.status !== "active") {
    // Double confirmation is idempotent: the state simply stays confirmed.
    return { state: "already", entryId: record.entryId, redirectUrl: null };
  }
  if (record.expiresAt !== null && Date.parse(record.expiresAt) <= now) {
    throw new FormRejection("newsletter", "Bestätigungslink ist abgelaufen", {
      field: "token",
      suggestion: "Erneut anmelden, um einen frischen Link zu erhalten.",
    });
  }
  await setStatusCell(store, record.entryId, "confirmed");
  await store.markNewsletterTokenUsed(record.token, "used");
  const snapshot = await store.getFormSnapshotForForm(record.formId);
  const redirectUrl =
    snapshot === undefined ? null : await successPageUrl(store, snapshot.snapshot);
  return { state: "confirmed", entryId: record.entryId, redirectUrl };
}

export async function unsubscribeNewsletter(
  store: Store,
  input: { token: string },
): Promise<NewsletterTransition> {
  const record = await store.getNewsletterToken(input.token);
  if (record === undefined || record.kind !== "unsubscribe") {
    throw new FormRejection("newsletter", "Abmeldelink ist ungültig", {
      field: "token",
      status: 404,
      suggestion: "Den Link aus der Newsletter-Mail verwenden.",
    });
  }
  if (record.status !== "active") {
    return { state: "already", entryId: record.entryId, redirectUrl: null };
  }
  await setStatusCell(store, record.entryId, "unsubscribed");
  await store.markNewsletterTokenUsed(record.token, "used");
  return { state: "unsubscribed", entryId: record.entryId, redirectUrl: null };
}

// --------------------------------------------------------------- outbox

export type OutboundMessage = {
  id: string;
  siteId: string;
  entryId: string | null;
  kind: string;
  recipient: string;
  subject: string;
  body: string;
};

export type NotificationTransport = (message: OutboundMessage) => Promise<void>;

// Dev transport: the outbox row itself is the record; "sending" is a no-op.
export const devTransport: NotificationTransport = async () => {};

export type NotificationTickResult = {
  sent: string[];
  retried: { id: string; attempts: number; nextAttemptAt: string }[];
  failed: string[];
};

export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

// Configured SMTP transport when host and sender are set, otherwise the no-op
// dev transport stays in place (artifacts/26 §5.4).
async function configuredTransport(
  store: Store,
  send: MailSender | undefined,
): Promise<NotificationTransport> {
  const config = await resolveSmtpConfig(store);
  if (config === undefined) return devTransport;
  const sender = send ?? smtpMailSender;
  return async (message) => {
    await sender(config, {
      recipient: message.recipient,
      subject: message.subject,
      body: message.body,
    });
  };
}

export async function tickNotifications(input: {
  store: Store;
  transport?: NotificationTransport;
  send?: MailSender;
  now?: number;
  limit?: number;
}): Promise<NotificationTickResult> {
  const now = input.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const transport =
    input.transport ?? (await configuredTransport(input.store, input.send));
  const due = await input.store.listDueNotifications(nowIso, input.limit ?? 50);
  const result: NotificationTickResult = { sent: [], retried: [], failed: [] };
  for (const message of due) {
    const attempts = message.attempts + 1;
    try {
      await transport({
        id: message.id,
        siteId: message.siteId,
        entryId: message.entryId,
        kind: message.kind,
        recipient: message.recipient,
        subject: message.subject,
        body: message.body,
      });
      await input.store.markNotificationResult({
        id: message.id,
        status: "sent",
        attempts,
        nextAttemptAt: nowIso,
        lastError: null,
        sentAt: nowIso,
      });
      result.sent.push(message.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unbekannter Fehler";
      const exhausted = attempts >= MAX_NOTIFICATION_ATTEMPTS;
      const nextAttemptAt = new Date(now + backoffMs(attempts)).toISOString();
      await input.store.markNotificationResult({
        id: message.id,
        status: exhausted ? "failed" : "queued",
        attempts,
        nextAttemptAt,
        lastError: reason,
        sentAt: null,
      });
      if (exhausted) result.failed.push(message.id);
      else result.retried.push({ id: message.id, attempts, nextAttemptAt });
    }
  }
  return result;
}

// ------------------------------------------------------- submissions view

export type SubmissionColumn = { key: string; label: string };

export type SiteFormSummary = {
  formId: string;
  pageId: string;
  pagePath: string;
  sectionType: string;
  mode: FormSnapshot["mode"];
  targetCollectionId: string | null;
  fields: SubmissionColumn[];
  createdAt: string;
};

// The form overview of the program: the latest snapshot per form — a re-bake
// replaces the frozen definition, older snapshots stay for their tokens.
export async function listSiteForms(
  store: Store,
  siteId: string,
): Promise<SiteFormSummary[]> {
  const records = await store.listFormSnapshots(siteId);
  const latest = new Map<string, FormSnapshotRecord>();
  for (const record of records) {
    const current = latest.get(record.formId);
    if (!current || record.createdAt > current.createdAt) {
      latest.set(record.formId, record);
    }
  }
  return [...latest.values()]
    .sort(
      (a, b) =>
        a.pagePath.localeCompare(b.pagePath) ||
        a.sectionType.localeCompare(b.sectionType),
    )
    .map((record) => ({
      formId: record.formId,
      pageId: record.pageId,
      pagePath: record.pagePath,
      sectionType: record.sectionType,
      mode: record.snapshot.mode,
      targetCollectionId: record.snapshot.targetCollectionId ?? null,
      fields: record.snapshot.fields.map((field) => ({
        key: field.key,
        label: field.label,
      })),
      createdAt: record.createdAt,
    }));
}

export type SubmissionView = {
  source: "form" | "collection";
  columns: SubmissionColumn[];
  rows: SubmissionRow[];
};

function stringifyCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export async function listSubmissions(
  store: Store,
  input: {
    siteId?: string;
    formId?: string;
    collectionId?: string;
    limit?: number;
  },
): Promise<SubmissionView> {
  let columns: SubmissionColumn[] = [];
  let collectionId = input.collectionId;
  let source: SubmissionView["source"] = "collection";
  let formRecord: FormSnapshotRecord | undefined;
  if (input.formId !== undefined) {
    const record = await store.getFormSnapshotForForm(input.formId);
    if (record === undefined) {
      throw new SenifyError("not_found", `Formular "${input.formId}" existiert nicht`, {
        field: "formId",
      });
    }
    formRecord = record;
    source = "form";
    columns = record.snapshot.fields.map((field) => ({
      key: field.key,
      label: field.label,
    }));
    collectionId = record.snapshot.targetCollectionId ?? collectionId;
  }
  if (collectionId === undefined) {
    throw new SenifyError("validation", "formId oder collectionId ist erforderlich", {
      field: "formId",
    });
  }
  const collection = await store.getCollection(collectionId);
  // Submissions come from the form's own target collection only: a snapshot
  // whose collection lives elsewhere never leaks another site's entries.
  if (formRecord !== undefined && collection.siteId !== formRecord.siteId) {
    throw new SenifyError(
      "not_found",
      `Formular "${formRecord.formId}" gehört zu einer anderen Site`,
      {
        field: "formId",
        suggestion: "Nur Formulare der eigenen Site exportieren.",
      },
    );
  }
  const siteId = input.siteId ?? collection.siteId;
  if (collection.siteId !== siteId) {
    throw new SenifyError("validation", "Sammlung gehört zu einer anderen Site", {
      field: "collectionId",
    });
  }
  // Without a form the collection schema is the column source (plain entry
  // view); with a form the frozen field list wins.
  if (source === "collection") {
    columns = collection.fields
      .filter((field) => field.deprecated !== true)
      .map((field) => ({ key: field.key, label: field.label }));
  }
  for (const key of [
    FORM_AUTO_KEYS.sourcePath,
    FORM_AUTO_KEYS.submittedAt,
    FORM_AUTO_KEYS.status,
  ]) {
    if (columns.some((column) => column.key === key)) continue;
    const field = collectionFieldByKey(collection, key);
    if (field !== undefined) columns.push({ key, label: field.label });
  }
  const entries = await listEntries(store, {
    siteId,
    filters: {
      collectionId: collection.id,
      trashed: false,
      sort: "createdAt",
      dir: "desc",
      limit: input.limit ?? 200,
    },
  });
  const rows = entries.map((entry) => {
    const values = columns.map((column) => {
      const field = collectionFieldByKey(collection, column.key);
      return {
        key: column.key,
        label: column.label,
        value: field === undefined ? "" : stringifyCell(entry.cells[field.id]),
      };
    });
    const submittedField = collectionFieldByKey(collection, FORM_AUTO_KEYS.submittedAt);
    const sourceField = collectionFieldByKey(collection, FORM_AUTO_KEYS.sourcePath);
    return {
      entryId: entry.id,
      slug: entry.slug,
      status: entry.status as EntryStatus,
      createdAt: entry.createdAt,
      submittedAt:
        submittedField === undefined
          ? entry.createdAt
          : stringifyCell(entry.cells[submittedField.id]) || entry.createdAt,
      sourcePath:
        sourceField === undefined ? null : stringifyCell(entry.cells[sourceField.id]) || null,
      values,
    };
  });
  return { source, columns, rows };
}

// CSV of the submissions view: semicolon-separated (the German spreadsheet
// default), quoted per RFC 4180 and led by a BOM so Excel keeps the Umlaute.
// Columns are the frozen snapshot fields in snapshot order plus the auto
// columns (source page, timestamp, status).
const CSV_DELIMITER = ";";

function csvCell(value: string): string {
  // A leading =+-@ - or a tab or carriage return, which Excel skips before it
  // reads the formula - would be run as a formula: neutralize it.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (guarded.includes(CSV_DELIMITER) || /["\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function buildSubmissionsCsv(view: {
  columns: SubmissionColumn[];
  rows: SubmissionRow[];
}): string {
  const lines = [
    view.columns.map((column) => csvCell(column.label)).join(CSV_DELIMITER),
  ];
  for (const row of view.rows) {
    lines.push(
      row.values.map((value) => csvCell(value.value)).join(CSV_DELIMITER),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

// ---------------------------------------------------------- publish checks

// Hard checks at publish (artifacts/26 §7): a form must be fully wired up.
export function checkForms(input: {
  pages: readonly Page[];
  pageIds: ReadonlySet<string>;
  collectionIds: ReadonlySet<string>;
}): CheckIssue[] {
  const issues: CheckIssue[] = [];
  for (const page of input.pages) {
    for (const node of Object.values(page.draft.nodes)) {
      if (!isFormSection(node)) continue;
      const snapshot = formSnapshotFromNode(node, {
        siteId: "",
        pageId: page.id,
        pagePath: page.path,
      });
      const base = { pageId: page.id, nodeId: node.id };
      if (snapshot === null) {
        issues.push({
          ...base,
          code: "form-empty",
          severity: "hard",
          message: `Formular "${node.id}" hat keine Felder`,
          suggestion: "Mindestens ein Feld definieren (kind + label).",
        });
        continue;
      }
      const keys = new Set<string>();
      snapshot.fields.forEach((field, index) => {
        if (keys.has(field.key)) {
          issues.push({
            ...base,
            code: "form-duplicate-keys",
            severity: "hard",
            message: `Formular "${node.id}": Feld-Key "${field.key}" ist doppelt`,
            field: `fields[${index}].key`,
            suggestion: "Jedem Feld einen eindeutigen Key geben.",
          });
        }
        keys.add(field.key);
      });
      if (
        snapshot.targetCollectionId === null ||
        !input.collectionIds.has(snapshot.targetCollectionId)
      ) {
        issues.push({
          ...base,
          code: "form-target-missing",
          severity: "hard",
          message: `Formular "${node.id}": Ziel-Sammlung fehlt oder existiert nicht`,
          field: "targetCollectionId",
          suggestion: "Sammlung aus dem Formular anlegen und verknüpfen.",
        });
      }
      if (snapshot.consent === null) {
        issues.push({
          ...base,
          code: "form-consent-missing",
          severity: "hard",
          message: `Formular "${node.id}": Consent-Block fehlt`,
          field: "consentText",
          suggestion: "Zustimmungstext und Datenschutz-Seite konfigurieren.",
        });
      } else if (
        snapshot.consent.pageId === null ||
        !input.pageIds.has(snapshot.consent.pageId)
      ) {
        issues.push({
          ...base,
          code: "form-consent-page-missing",
          severity: "hard",
          message: `Formular "${node.id}": Consent verlinkt keine existierende Seite`,
          field: "consentPage",
          suggestion: "Eine Datenschutz-Seite auswählen.",
        });
      }
      if (
        snapshot.successPageId === null ||
        !input.pageIds.has(snapshot.successPageId)
      ) {
        issues.push({
          ...base,
          code: "form-success-missing",
          severity: "hard",
          message: `Formular "${node.id}": Erfolgsseite fehlt oder existiert nicht`,
          field: "successPage",
          suggestion: "Eine Danke-Seite als Ziel ohne JavaScript auswählen.",
        });
      }
      if (snapshot.notifyEmail === null) {
        issues.push({
          ...base,
          code: "form-notify-missing",
          severity: "soft",
          message: `Formular "${node.id}": keine Benachrichtigungs-Adresse (SMTP-Test weich)`,
          field: "notifyEmail",
          suggestion: "Empfänger-Adresse für die Betreiber-Mail eintragen.",
        });
      }
    }
  }
  return issues;
}
