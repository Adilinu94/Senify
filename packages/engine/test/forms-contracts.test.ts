import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { FormField, FormSnapshot } from "@senify/renderer";
import { createFormSigner, MIN_FILL_MS, RateLimiter, submitForm, listSubmissions, type Collection } from "@senify/engine";
import { assertAllowedOrigin } from "../src/forms.ts";
import { bootEngine, createTestPage, createTestSite, type BootEnv } from "./helpers.ts";

describe("Formular-Verträge und Fallbacks", () => {
  let env: BootEnv;
  let siteId: string;
  let pageId: string;
  let collection: Collection;
  let count = 0;
  const signer = createFormSigner("test-signing-secret");
  const now = Date.parse("2026-10-21T12:00:00.000Z");
  const field: FormField = { key: "message", label: "Nachricht", kind: "text", required: true };
  beforeAll(async () => {
    env = await bootEngine();
    siteId = (await createTestSite(env.api)).id;
    pageId = (await createTestPage(env.api, siteId)).id;
    const created = await env.api.request<Collection>({ method: "POST", path: `/api/sites/${siteId}/collections/from-fields`, body: {
      name: "Einsendungen", supports: ["drafts"], fields: [{ key: "message", label: "Nachricht", description: "Nachricht", type: "text" }],
    } });
    expect(created.status).toBe(201);
    collection = created.body;
  });
  afterAll(async () => { await env.close(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  async function input(overrides: Partial<FormSnapshot> = {}) {
    const id = `contract-snapshot-${++count}`;
    const formId = `contract-form-${count}`;
    const snapshot: FormSnapshot = {
      siteId, pageId, nodeId: "form", pagePath: "/kontakt", sectionType: "contact", mode: "message", name: "Kontakt",
      fields: [field], targetCollectionId: collection.id, consent: null, successMessage: "Danke", successPageId: null,
      honeypotKey: "company", notifyEmail: null, ...overrides,
    };
    await env.engine.store.saveFormSnapshot({ id, formId, siteId, pageId, nodeId: "form", pagePath: snapshot.pagePath, sectionType: snapshot.sectionType, snapshot });
    return { store: env.engine.store, signer, rateLimiter: new RateLimiter({ perMinute: 1000, burst: 1000, destructivePerMinute: 1000 }),
      formId, token: signer.sign({ siteId, formId, snapshotId: id, issuedAt: now - MIN_FILL_MS }),
      values: { message: "Hallo" }, consent: false, honeypot: "", origin: "http://localhost", requestHost: "localhost", clientIp: "127.0.0.1", now };
  }

  it.each([null, {}, { siteId: 1 }, { siteId: "site", formId: 1 }, { siteId: "site", formId: "form", snapshotId: 1 }, { siteId: "site", formId: "form", snapshotId: "snap", issuedAt: "now" }, "invalid-json"])(
    "verweigert korrekt signierte, aber ungültige Token-Payloads: %j", (payload) => {
      const body = Buffer.from(payload === "invalid-json" ? "{" : JSON.stringify(payload)).toString("base64url");
      const mac = createHmac("sha256", "test-signing-secret").update(body).digest("base64url");
      expect(signer.verify(`${body}.${mac}`)).toBeUndefined();
    },
  );

  it("verweigert fehlende Snapshots und Tokens einer anderen Site ohne Entry-Write", async () => {
    const args = await input();
    for (const payload of [
      { siteId, formId: args.formId, snapshotId: "missing", issuedAt: now - MIN_FILL_MS },
      { siteId: "other", formId: args.formId, snapshotId: `contract-snapshot-${count}`, issuedAt: now - MIN_FILL_MS },
    ]) {
      await expect(submitForm({ ...args, token: signer.sign(payload) })).rejects.toMatchObject({ reason: "token", field: "form_token", status: 401 });
    }
    expect(await env.engine.store.listEntries({ siteId, collectionId: collection.id })).toEqual([]);
  });

  it("akzeptiert konfigurierte Hosts und verweigert ungültige und fremde Origins", () => {
    vi.stubEnv("SENIFY_FORMS_ORIGINS", "https://custom.test, other.test, ,");
    for (const origin of ["https://custom.test", "https://other.test", "https://studio.senify.xyz", "https://website.test", "https://proxy.test", "http://[::1]"]) {
      expect(() => assertAllowedOrigin({ origin, requestHost: "proxy.test:443", siteSlug: "studio", siteBaseUrl: "https://website.test/" })).not.toThrow();
    }
    for (const origin of ["not-a-url", "https://foreign.test"]) {
      expect(() => assertAllowedOrigin({ origin, requestHost: undefined, siteSlug: "studio", siteBaseUrl: "invalid" })).toThrow();
    }
  });

  it.each([
    { kind: "checkbox", value: "no", required: true, validation: undefined },
    { kind: "date", value: "21.10.2026", required: true, validation: undefined },
    { kind: "number", value: "NaN", required: true, validation: undefined },
    { kind: "number", value: "1", required: true, validation: { min: 2 } },
    { kind: "number", value: "9", required: true, validation: { max: 8 } },
    { kind: "select", value: "unknown", required: true, validation: undefined },
    { kind: "text", value: "ab", required: true, validation: { min: 3 } },
    { kind: "text", value: "abcd", required: true, validation: { max: 3 } },
    { kind: "text", value: "abc", required: true, validation: { pattern: "[" } },
    { kind: "text", value: "abc", required: true, validation: { pattern: "^xyz$" } },
  ] satisfies { kind: FormField["kind"]; value: string; required: boolean; validation: FormField["validation"] }[])(
    "prüft eingefrorene Feldregeln vor jedem Write: $kind $value", async ({ kind, value, required, validation }) => {
      const args = await input({ fields: [{ ...field, kind, required, ...(validation === undefined ? {} : { validation }) }] });
      const before = await env.engine.store.listEntries({ siteId, collectionId: collection.id });
      await expect(submitForm({ ...args, values: { message: value } })).rejects.toMatchObject({ reason: "validation", field: "message" });
      expect(await env.engine.store.listEntries({ siteId, collectionId: collection.id })).toEqual(before);
    },
  );

  it("meldet eine fehlende oder stillgelegte Ziel-Collection und bewahrt unerwartete Fehler", async () => {
    await expect(submitForm(await input({ targetCollectionId: null }))).rejects.toMatchObject({ reason: "unconfigured", field: "targetCollectionId" });
    await env.db.query("UPDATE collections SET deprecated_at = $2 WHERE id = $1", [collection.id, new Date(now).toISOString()]);
    const args = await input();
    await expect(submitForm(args)).rejects.toMatchObject({ reason: "unconfigured", field: "targetCollectionId" });
    await env.db.query("UPDATE collections SET deprecated_at = null WHERE id = $1", [collection.id]);
    const error = new Error("Limiter-Ausfall");
    vi.spyOn(args.rateLimiter, "check").mockImplementation(() => { throw error; });
    await expect(submitForm(args)).rejects.toBe(error);
  });

  it("verwendet bei leerem optionalem Feld den Titel-Fallback und bei fehlender Danke-Page den No-JS-Rückweg", async () => {
    const args = await input({ fields: [{ ...field, required: false }], successPageId: "missing-page" });
    const result = await submitForm({ ...args, values: { message: [] } });
    expect(result).toMatchObject({ state: "created", redirectUrl: null, pagePath: "/kontakt" });
    const entry = await env.engine.store.getEntry(result.entryId);
    expect(entry.status).toBe("draft");
    expect(entry.cells[collection.titleField]).toBe("Einsendung 2026-10-21T12:00");
    const form = await input();
    const token = env.engine.formSigner.sign({ siteId, formId: form.formId, snapshotId: `contract-snapshot-${count}`, issuedAt: Date.now() - MIN_FILL_MS });
    const response = await fetch(`${env.server.origin}/api/forms/${form.formId}/submit`, {
      method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: env.server.origin },
      body: new URLSearchParams({ form_token: token, message: "Hallo" }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/kontakt?gesendet=1");
    const rejected = await fetch(`${env.server.origin}/api/forms/${form.formId}/submit`, {
      method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: env.server.origin, referer: `${env.server.origin}/kontakt` },
      body: new URLSearchParams({ form_token: token, message: "" }),
    });
    expect(rejected.status).toBe(303);
    expect(rejected.headers.get("location")).toBe("/kontakt?form_fehler=validation");
    const withoutReferer = await fetch(`${env.server.origin}/api/forms/${form.formId}/submit`, {
      method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: env.server.origin },
      body: new URLSearchParams({ form_token: token, message: "" }),
    });
    expect(withoutReferer.status).toBe(400);
    expect(await withoutReferer.json()).toMatchObject({ error: { field: "message" } });
  });

  it("verweigert Export ohne Quelle und mit fremder Site", async () => {
    await expect(listSubmissions(env.engine.store, {})).rejects.toMatchObject({ category: "validation", field: "formId" });
    await expect(listSubmissions(env.engine.store, { collectionId: collection.id, siteId: "foreign" })).rejects.toMatchObject({ category: "validation", field: "collectionId" });
  });

  it("weist ein HTTP-Formular ohne Token vor jedem Entry-Write zurück", async () => {
    const form = await input();
    const before = await env.engine.store.listEntries({ siteId, collectionId: collection.id });
    const response = await env.api.request({ method: "POST", path: `/api/forms/${form.formId}/submit`, body: { values: { message: "Hallo" } } });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { field: "form_token" } });
    expect(await env.engine.store.listEntries({ siteId, collectionId: collection.id })).toEqual(before);
  });
});
