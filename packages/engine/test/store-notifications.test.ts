import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { NotificationsRepository } from "../src/store-notifications.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the notification outbox and the newsletter tokens live in `NotificationsRepository`;
// `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return { db: database.db, repo: new NotificationsRepository(database.db) };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

const enqueue = (repo: NotificationsRepository, overrides: { siteId?: string; nextAttemptAt?: string } = {}) =>
  repo.enqueueNotification({
    siteId: overrides.siteId ?? "site-1",
    formId: "form-1",
    entryId: null,
    kind: "form-submission",
    recipient: "owner@example.net",
    subject: "Neue Anfrage",
    body: "Hallo",
    ...(overrides.nextAttemptAt ? { nextAttemptAt: overrides.nextAttemptAt } : {}),
  });

describe("NotificationsRepository: outbox", () => {
  it("queues a message that is due now and reads it back", async () => {
    const { repo } = await fixture();
    const queued = await enqueue(repo);
    expect(queued).toMatchObject({
      siteId: "site-1",
      formId: "form-1",
      entryId: null,
      kind: "form-submission",
      recipient: "owner@example.net",
      subject: "Neue Anfrage",
      body: "Hallo",
      status: "queued",
      attempts: 0,
      lastError: null,
      sentAt: null,
    });
    expect(Number.isNaN(Date.parse(queued.nextAttemptAt))).toBe(false);
    expect(await repo.getNotification(queued.id)).toEqual(queued);
  });

  it("answers an unknown notification with a not_found error on the notificationId field", async () => {
    const { repo } = await fixture();
    const error = await rejected(repo.getNotification("nope"));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found", field: "notificationId" });
    expect(
      await rejected(
        repo.markNotificationResult({
          id: "nope",
          status: "failed",
          attempts: 1,
          nextAttemptAt: "2026-10-10T00:00:00.000Z",
          lastError: "boom",
          sentAt: null,
        }),
      ),
    ).toMatchObject({ category: "not_found", field: "notificationId" });
  });

  it("lists the newest message first, per site, and clamps the limit", async () => {
    const { repo } = await fixture();
    const first = await enqueue(repo);
    await tick();
    const second = await enqueue(repo);
    await enqueue(repo, { siteId: "site-2" });

    expect((await repo.listNotifications("site-1")).map((n) => n.id)).toEqual([second.id, first.id]);
    expect(await repo.listNotifications("site-1", 0)).toHaveLength(1);
  });

  it("lists only queued messages that are past their next attempt, oldest attempt first", async () => {
    const { repo } = await fixture();
    const later = await enqueue(repo, { nextAttemptAt: "2026-10-10T12:00:00.000Z" });
    const early = await enqueue(repo, { nextAttemptAt: "2026-10-10T08:00:00.000Z" });
    const done = await enqueue(repo, { nextAttemptAt: "2026-10-10T07:00:00.000Z" });
    await repo.markNotificationResult({
      id: done.id,
      status: "sent",
      attempts: 1,
      nextAttemptAt: "2026-10-10T07:00:00.000Z",
      lastError: null,
      sentAt: "2026-10-10T07:00:05.000Z",
    });

    expect((await repo.listDueNotifications("2026-10-10T10:00:00.000Z")).map((n) => n.id)).toEqual([early.id]);
    expect((await repo.listDueNotifications("2026-10-10T13:00:00.000Z")).map((n) => n.id)).toEqual([
      early.id,
      later.id,
    ]);
    expect(await repo.listDueNotifications("2026-10-10T13:00:00.000Z", 0)).toHaveLength(1);
  });

  it("records the delivery result with attempts, error and sent time", async () => {
    const { repo } = await fixture();
    const queued = await enqueue(repo);
    const failed = await repo.markNotificationResult({
      id: queued.id,
      status: "failed",
      attempts: 2,
      nextAttemptAt: "2026-10-11T00:00:00.000Z",
      lastError: "smtp down",
      sentAt: null,
    });
    expect(failed).toMatchObject({ status: "failed", attempts: 2, lastError: "smtp down", sentAt: null });
    expect(failed.nextAttemptAt).toBe("2026-10-11T00:00:00.000Z");

    const sent = await repo.markNotificationResult({
      id: queued.id,
      status: "sent",
      attempts: 3,
      nextAttemptAt: "2026-10-11T00:00:00.000Z",
      lastError: null,
      sentAt: "2026-10-10T09:00:00.000Z",
    });
    expect(sent).toMatchObject({ status: "sent", attempts: 3, lastError: null });
    expect(sent.sentAt).toBe("2026-10-10T09:00:00.000Z");
  });
});

describe("NotificationsRepository: newsletter tokens", () => {
  const issue = (repo: NotificationsRepository, kind: "confirm" | "unsubscribe" = "confirm") =>
    repo.createNewsletterToken({
      siteId: "site-1",
      formId: "form-1",
      entryId: "entry-1",
      email: "reader@example.net",
      kind,
      expiresAt: null,
    });

  it("issues a random active token and reads it back", async () => {
    const { repo } = await fixture();
    const a = await issue(repo);
    const b = await issue(repo, "unsubscribe");
    expect(a).toMatchObject({
      siteId: "site-1",
      formId: "form-1",
      entryId: "entry-1",
      email: "reader@example.net",
      kind: "confirm",
      status: "active",
      expiresAt: null,
      usedAt: null,
    });
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(b.token).not.toBe(a.token);
    expect(await repo.getNewsletterToken(a.token)).toEqual(a);
    expect(await repo.getNewsletterToken("unknown")).toBeUndefined();
  });

  it("keeps an expiry date", async () => {
    const { repo } = await fixture();
    const token = await repo.createNewsletterToken({
      siteId: "site-1",
      formId: "form-1",
      entryId: "entry-1",
      email: "reader@example.net",
      kind: "confirm",
      expiresAt: "2026-10-17T00:00:00.000Z",
    });
    expect(token.expiresAt).toBe("2026-10-17T00:00:00.000Z");
  });

  it("flips a token to used once; the first used time stays", async () => {
    const { repo } = await fixture();
    const token = await issue(repo);
    const used = await repo.markNewsletterTokenUsed(token.token, "used");
    expect(used.status).toBe("used");
    expect(Number.isNaN(Date.parse(used.usedAt ?? ""))).toBe(false);

    await tick();
    const again = await repo.markNewsletterTokenUsed(token.token, "used");
    expect(again.usedAt).toBe(used.usedAt);
  });

  it("answers an unknown token with a not_found error on the token field", async () => {
    const { repo } = await fixture();
    const error = await rejected(repo.markNewsletterTokenUsed("unknown", "used"));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found", field: "token" });
  });
});

describe("NotificationsRepository behind the Store facade", () => {
  it("is what Store delegates to: the same rows come back through the facade", async () => {
    const { db, repo } = await fixture();
    const store = new Store(db);
    const queued = await store.enqueueNotification({
      siteId: "site-1",
      formId: null,
      entryId: null,
      kind: "form-submission",
      recipient: "owner@example.net",
      subject: "Betreff",
      body: "Text",
    });
    expect(await store.getNotification(queued.id)).toEqual(await repo.getNotification(queued.id));
    expect(await store.listNotifications("site-1")).toEqual(await repo.listNotifications("site-1"));

    const token = await store.createNewsletterToken({
      siteId: "site-1",
      formId: "form-1",
      entryId: "entry-1",
      email: "reader@example.net",
      kind: "unsubscribe",
      expiresAt: null,
    });
    expect(await store.getNewsletterToken(token.token)).toEqual(await repo.getNewsletterToken(token.token));
    expect((await store.markNewsletterTokenUsed(token.token, "used")).status).toBe("used");
    expect((await repo.getNewsletterToken(token.token))?.status).toBe("used");
  });
});
