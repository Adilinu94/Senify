import { describe, expect, it } from "vitest";
import { createApiHarness } from "@senify/core/testing";
import { type DbResult, type Row } from "@senify/engine";
import {
  bootEngine,
  createTestSite,
  type ErrorResponse,
  type PageResponse,
} from "./helpers.ts";

type UploadUrlResponse = { uploadId: string; url: string; expiresAt: string };
type ReferenceCollectionResponse = { collection: { id: string; name: string } };
type EntryResponse = { id: string; slug: string };

async function createCollection(env: Awaited<ReturnType<typeof bootEngine>>, siteId: string): Promise<string> {
  const created = await env.api.request<{ id: string }>({
    method: "POST",
    path: `/api/sites/${siteId}/collections`,
    body: {
      name: "Notizen",
      slug: "notizen",
      fields: [
        { id: "body", key: "body", label: "Text", type: "text", description: "Inhalt." },
      ],
    },
  });
  if (created.status !== 201) {
    throw new Error(`Collection setup failed: ${JSON.stringify(created.body)}`);
  }
  return created.body.id;
}

describe("idempotency keys (ticket 18, slice 2)", () => {
  it("replays a create_page retry with the same key and keeps one page", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Idempotent");
      const first = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Startseite", path: "/start", idempotencyKey: "page-key-1" },
      });
      expect(first.status).toBe(201);

      const retry = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Startseite", path: "/start", idempotencyKey: "page-key-1" },
      });
      expect(retry.status).toBe(201);
      expect(retry.body.id).toBe(first.body.id);
      expect(retry.headers["idempotency-replayed"]).toBe("true");

      const pages = await env.api.request<{ pages: PageResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/pages`,
      });
      expect(pages.body.pages).toHaveLength(1);
    } finally {
      await env.close();
    }
  });

  it("creates again for a different key and for no key", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Ohne Key");
      const first = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "A", path: "/a", idempotencyKey: "key-a" },
      });
      const second = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "B", path: "/b", idempotencyKey: "key-b" },
      });
      const third = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "C", path: "/c" },
      });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(third.status).toBe(201);
      expect(new Set([first.body.id, second.body.id, third.body.id]).size).toBe(3);
    } finally {
      await env.close();
    }
  });

  it("rejects a reused key with a different body", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Anderer Body");
      const first = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Erste", idempotencyKey: "same-key" },
      });
      expect(first.status).toBe(201);

      const reused = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Zweite", idempotencyKey: "same-key" },
      });
      expect(reused.status).toBe(409);
      expect(reused.body.error.field).toBe("idempotencyKey");
      expect(reused.body.error.message).toMatch(/different request/);

      const pages = await env.api.request<{ pages: PageResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/pages`,
      });
      expect(pages.body.pages).toHaveLength(1);
    } finally {
      await env.close();
    }
  });

  it("scopes the key to the token", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Zwei Clients");
      const first = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Geteilt", idempotencyKey: "shared-key" },
      });
      expect(first.status).toBe(201);

      const other = await env.humanApi.request<{ secret: string }>({
        method: "POST",
        path: "/api/tokens",
        body: { name: "zweiter-client", kind: "human", scopes: ["read", "write"] },
      });
      expect(other.status).toBe(201);
      const secondApi = createApiHarness(env.server.origin, {
        token: other.body.secret,
      });
      const second = await secondApi.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Geteilt", idempotencyKey: "shared-key" },
      });
      expect(second.status).toBe(201);
      expect(second.body.id).not.toBe(first.body.id);
    } finally {
      await env.close();
    }
  });

  it("scopes the key to the route", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Zwei Routen");
      const page = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Route", idempotencyKey: "route-key" },
      });
      const collection = await env.api.request<ReferenceCollectionResponse>({
        method: "POST",
        path: "/api/reference-collections",
        body: { name: "Route", idempotencyKey: "route-key" },
      });
      expect(page.status).toBe(201);
      expect(collection.status).toBe(201);
    } finally {
      await env.close();
    }
  });

  it("replays a create_entry retry with the same key", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Eintraege");
      const collectionId = await createCollection(env, site.id);
      const body = {
        collectionId,
        cells: { title: "Idempotenter Beitrag", body: "Text" },
        idempotencyKey: "entry-key-1",
      };
      const first = await env.api.request<EntryResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/entries`,
        body,
      });
      expect(first.status).toBe(201);

      const retry = await env.api.request<EntryResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/entries`,
        body,
      });
      expect(retry.status).toBe(201);
      expect(retry.body.id).toBe(first.body.id);
      expect(retry.headers["idempotency-replayed"]).toBe("true");

      const entries = await env.api.request<{ entries: EntryResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/entries`,
      });
      expect(entries.body.entries).toHaveLength(1);
    } finally {
      await env.close();
    }
  });

  it("replays an upload-url request with the same key", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Upload");
      const body = {
        filename: "photo.png",
        mime: "image/png",
        byteSize: 128,
        idempotencyKey: "upload-key-1",
      };
      const first = await env.api.request<UploadUrlResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/assets/upload-url`,
        body,
      });
      expect(first.status).toBe(201);

      const retry = await env.api.request<UploadUrlResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/assets/upload-url`,
        body,
      });
      expect(retry.status).toBe(201);
      expect(retry.body.uploadId).toBe(first.body.uploadId);
      expect(retry.headers["idempotency-replayed"]).toBe("true");
    } finally {
      await env.close();
    }
  });

  it("replays a reference collection create with the same key", async () => {
    const env = await bootEngine();
    try {
      const body = { name: "Idempotente Sammlung", idempotencyKey: "collection-key-1" };
      const first = await env.api.request<ReferenceCollectionResponse>({
        method: "POST",
        path: "/api/reference-collections",
        body,
      });
      expect(first.status).toBe(201);

      const retry = await env.api.request<ReferenceCollectionResponse>({
        method: "POST",
        path: "/api/reference-collections",
        body,
      });
      expect(retry.status).toBe(201);
      expect(retry.body.collection.id).toBe(first.body.collection.id);

      const listed = await env.api.request<{ collections: { id: string }[] }>({
        method: "GET",
        path: "/api/reference-collections",
      });
      expect(listed.body.collections).toHaveLength(1);
    } finally {
      await env.close();
    }
  });

  it("releases the key when the attempt fails, so a corrected retry succeeds", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Fehlversuch");
      const taken = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Erste", path: "/erste" },
      });
      expect(taken.status).toBe(201);

      const failed = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Doppelt", path: "/erste", idempotencyKey: "retry-key" },
      });
      expect(failed.status).toBe(409);

      const corrected = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Korrigiert", path: "/korrigiert", idempotencyKey: "retry-key" },
      });
      expect(corrected.status).toBe(201);

      const pages = await env.api.request<{ pages: PageResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/pages`,
      });
      expect(pages.body.pages).toHaveLength(2);
    } finally {
      await env.close();
    }
  });

  it("answers in progress while a claim is open and takes over a stale one", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Laufend");
      const tokens = await env.engine.store.listTokens();
      const token = tokens.find((entry) => entry.name === "engine-tests");
      if (!token) throw new Error("Harness token missing");
      const route = `POST /api/sites/${site.id}/pages`;
      await env.engine.store.claimIdempotencyKey({
        tokenId: token.id,
        route,
        key: "busy-key",
        fingerprint: "seed",
      });

      const busy = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Laeuft", idempotencyKey: "busy-key" },
      });
      expect(busy.status).toBe(409);
      expect(busy.body.error.message).toMatch(/still in progress/);

      // Backdate the claim: a crashed attempt is taken over by the next retry.
      await env.db.query(
        `UPDATE idempotency_keys SET created_at = $1 WHERE idempotency_key = $2`,
        [new Date(Date.now() - 10 * 60 * 1000).toISOString(), "busy-key"],
      );
      const takeover = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Laeuft", idempotencyKey: "busy-key" },
      });
      expect(takeover.status).toBe(201);
    } finally {
      await env.close();
    }
  });

  it("answers a retry with a conflict when the write is committed but its response was lost (R6)", async () => {
    // R6 is the only known true data-integrity fault in the earlier audit: a
    // failure AFTER the write inside completeIdempotencyKey (or a slot that
    // vanished beneath it) used to release the key, and a retry wrote a second
    // entity. This test simulates exactly that half-state on the store (the
    // marker row is written by withIdempotency's catch arm and cannot be
    // reached through plain HTTP) and then proves over HTTP that a retry does
    // not create a second entity.
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "CommittedUnknown");
      const first = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Einmal", idempotencyKey: "lost-response" },
      });
      expect(first.status).toBe(201);

      const tokens = await env.engine.store.listTokens();
      const token = tokens.find((entry) => entry.name === "engine-tests");
      if (!token) throw new Error("Harness token missing");
      const route = `POST /api/sites/${site.id}/pages`;
      // The half-state: the slot is gone (completion failed after the write),
      // and only the committed marker records that the write happened.
      await env.db.query(
        `DELETE FROM idempotency_keys WHERE token_id = $1 AND route = $2 AND idempotency_key = $3`,
        [token.id, route, "lost-response"],
      );
      await env.engine.store.markIdempotencyCommitted({
        tokenId: token.id,
        route,
        key: "lost-response",
      });

      const retried = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Einmal", idempotencyKey: "lost-response" },
      });
      expect(retried.status).toBe(409);
      expect(retried.body.error.field).toBe("idempotencyKey");
      expect(retried.body.error.message).toMatch(/already applied/);

      const pages = await env.api.request<{ pages: PageResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/pages`,
      });
      expect(pages.body.pages).toHaveLength(1);
    } finally {
      await env.close();
    }
  });

  it("treats a body with reordered keys as the same request", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Schluesselordnung");
      const first = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Sortiert", path: "/sortiert", idempotencyKey: "order-key" },
      });
      expect(first.status).toBe(201);

      // The fingerprint is built over a canonicalized JSON: key order in the
      // request must not turn a retry into a mismatch.
      const retry = await env.api.request<PageResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { idempotencyKey: "order-key", path: "/sortiert", title: "Sortiert" },
      });
      expect(retry.status).toBe(201);
      expect(retry.body.id).toBe(first.body.id);
      expect(retry.headers["idempotency-replayed"]).toBe("true");
    } finally {
      await env.close();
    }
  });

  it("validates the key shape", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Form");
      const empty = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Leer", idempotencyKey: "" },
      });
      expect(empty.status).toBe(400);
      expect(empty.body.error.field).toBe("idempotencyKey");

      const long = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/pages`,
        body: { title: "Lang", idempotencyKey: "x".repeat(201) },
      });
      expect(long.status).toBe(400);
      expect(long.body.error.field).toBe("idempotencyKey");
    } finally {
      await env.close();
    }
  });
});
