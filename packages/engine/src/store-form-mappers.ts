// Row types and mappers for form snapshots, notifications and newsletter tokens (P3-2, moved out of store.ts).
import { type FormSnapshot } from "@senify/renderer";
import {
  type FormSnapshotRecord,
  type NewsletterToken,
  type NewsletterTokenKind,
  type NotificationMessage,
  type NotificationStatus,
} from "./types.ts";
import { toFiniteNumber, toIso, toJson } from "./store-row-utils.ts";

// -------------------------------------------------------------- forms (T11)

export const NOTIFICATION_COLUMNS =
  "id, site_id, form_id, entry_id, kind, recipient, subject, body, status, attempts, next_attempt_at, last_error, created_at, updated_at, sent_at";

export type FormSnapshotRow = {
  id: string;
  form_id: string;
  site_id: string;
  page_id: string;
  node_id: string;
  page_path: string;
  section_type: string;
  snapshot: unknown;
  created_at: unknown;
};

export function mapFormSnapshot(row: FormSnapshotRow): FormSnapshotRecord {
  return {
    id: row.id,
    formId: row.form_id,
    siteId: row.site_id,
    pageId: row.page_id,
    nodeId: row.node_id,
    pagePath: row.page_path,
    sectionType: row.section_type,
    snapshot: toJson<FormSnapshot>(row.snapshot),
    createdAt: toIso(row.created_at),
  };
}

export type NotificationRow = {
  id: string;
  site_id: string;
  form_id: unknown;
  entry_id: unknown;
  kind: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  attempts: unknown;
  next_attempt_at: unknown;
  last_error: unknown;
  created_at: unknown;
  updated_at: unknown;
  sent_at: unknown;
};

export function mapNotification(row: NotificationRow): NotificationMessage {
  return {
    id: row.id,
    siteId: row.site_id,
    formId: typeof row.form_id === "string" ? row.form_id : null,
    entryId: typeof row.entry_id === "string" ? row.entry_id : null,
    kind: row.kind,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    status: row.status as NotificationStatus,
    attempts: toFiniteNumber(row.attempts, "attempts"),
    nextAttemptAt: toIso(row.next_attempt_at),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    sentAt: row.sent_at === null || row.sent_at === undefined ? null : toIso(row.sent_at),
  };
}

export type NewsletterTokenRow = {
  token: string;
  site_id: string;
  form_id: string;
  entry_id: string;
  email: string;
  kind: string;
  status: string;
  expires_at: unknown;
  created_at: unknown;
  used_at: unknown;
};

export function mapNewsletterToken(row: NewsletterTokenRow): NewsletterToken {
  return {
    token: row.token,
    siteId: row.site_id,
    formId: row.form_id,
    entryId: row.entry_id,
    email: row.email,
    kind: row.kind as NewsletterTokenKind,
    status: row.status,
    expiresAt: row.expires_at === null || row.expires_at === undefined ? null : toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    usedAt: row.used_at === null || row.used_at === undefined ? null : toIso(row.used_at),
  };
}
