// Notification outbox and newsletter tokens of the Store (ADR 0019): queued mails with their delivery result and the single-use confirm/unsubscribe tokens. `Store` delegates here.
import { randomBytes } from "node:crypto";
import { SenifyError } from "@senify/core";
import type { Db } from "./db.ts";
import { newEntityId } from "./ids.ts";
import {
  NOTIFICATION_COLUMNS,
  type NewsletterTokenRow,
  type NotificationRow,
  mapNewsletterToken,
  mapNotification,
} from "./store-form-mappers.ts";
import type {
  NewsletterToken,
  NewsletterTokenKind,
  NotificationMessage,
  NotificationStatus,
} from "./types.ts";

export type EnqueueNotificationInput = {
  siteId: string;
  formId: string | null;
  entryId: string | null;
  kind: string;
  recipient: string;
  subject: string;
  body: string;
  nextAttemptAt?: string;
};

export type MarkNotificationResultInput = {
  id: string;
  status: NotificationStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  sentAt: string | null;
};

export type CreateNewsletterTokenInput = {
  siteId: string;
  formId: string;
  entryId: string;
  email: string;
  kind: NewsletterTokenKind;
  expiresAt: string | null;
};

export class NotificationsRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async enqueueNotification(input: EnqueueNotificationInput): Promise<NotificationMessage> {
    const now = new Date().toISOString();
    const result = await this.#db.query<NotificationRow>(
      `INSERT INTO notification_outbox
        (id, site_id, form_id, entry_id, kind, recipient, subject, body, status,
         attempts, next_attempt_at, last_error, created_at, updated_at, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', 0, $9, NULL, $10, $10, NULL)
       RETURNING ${NOTIFICATION_COLUMNS}`,
      [
        newEntityId(),
        input.siteId,
        input.formId,
        input.entryId,
        input.kind,
        input.recipient,
        input.subject,
        input.body,
        input.nextAttemptAt ?? now,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Notification insert returned no row");
    return mapNotification(row);
  }

  async getNotification(id: string): Promise<NotificationMessage> {
    const result = await this.#db.query<NotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notification_outbox WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Notification "${id}" does not exist`, {
        field: "notificationId",
      });
    }
    return mapNotification(row);
  }

  async listNotifications(
    siteId: string,
    limit = 50,
  ): Promise<NotificationMessage[]> {
    const result = await this.#db.query<NotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notification_outbox
       WHERE site_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [siteId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapNotification);
  }

  // Jobs that are due: queued and past their next attempt time.
  async listDueNotifications(
    now: string,
    limit = 50,
  ): Promise<NotificationMessage[]> {
    const result = await this.#db.query<NotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notification_outbox
       WHERE status = 'queued' AND next_attempt_at <= $1
       ORDER BY next_attempt_at ASC, created_at ASC, id ASC LIMIT $2`,
      [now, Math.max(1, Math.min(200, limit))],
    );
    return result.rows.map(mapNotification);
  }

  async markNotificationResult(input: MarkNotificationResultInput): Promise<NotificationMessage> {
    const result = await this.#db.query<NotificationRow>(
      `UPDATE notification_outbox SET
         status = $2, attempts = $3, next_attempt_at = $4, last_error = $5,
         sent_at = $6, updated_at = $7
       WHERE id = $1 RETURNING ${NOTIFICATION_COLUMNS}`,
      [
        input.id,
        input.status,
        input.attempts,
        input.nextAttemptAt,
        input.lastError,
        input.sentAt,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Notification "${input.id}" does not exist`, {
        field: "notificationId",
      });
    }
    return mapNotification(row);
  }

  async createNewsletterToken(input: CreateNewsletterTokenInput): Promise<NewsletterToken> {
    const token = randomBytes(24).toString("base64url");
    const result = await this.#db.query<NewsletterTokenRow>(
      `INSERT INTO newsletter_tokens
        (token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, NULL)
       RETURNING token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at`,
      [
        token,
        input.siteId,
        input.formId,
        input.entryId,
        input.email,
        input.kind,
        input.expiresAt,
        new Date().toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Newsletter token insert returned no row");
    return mapNewsletterToken(row);
  }

  async getNewsletterToken(token: string): Promise<NewsletterToken | undefined> {
    const result = await this.#db.query<NewsletterTokenRow>(
      `SELECT token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at
       FROM newsletter_tokens WHERE token = $1`,
      [token],
    );
    const row = result.rows[0];
    return row ? mapNewsletterToken(row) : undefined;
  }

  // Single use: the flip to used is idempotent (already-used tokens stay used).
  async markNewsletterTokenUsed(
    token: string,
    status: string,
  ): Promise<NewsletterToken> {
    const result = await this.#db.query<NewsletterTokenRow>(
      `UPDATE newsletter_tokens SET status = $2, used_at = COALESCE(used_at, $3)
       WHERE token = $1
       RETURNING token, site_id, form_id, entry_id, email, kind, status, expires_at, created_at, used_at`,
      [token, status, new Date().toISOString()],
    );
    const row = result.rows[0];
    if (!row) {
      throw new SenifyError("not_found", `Newsletter token is unknown`, {
        field: "token",
      });
    }
    return mapNewsletterToken(row);
  }
}
