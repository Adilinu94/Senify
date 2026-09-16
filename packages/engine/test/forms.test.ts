import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { SenifyError } from "@senify/core";
import type { NodeTree } from "@senify/section-sdk";
import {
  buildSubmissionsCsv,
  confirmNewsletter,
  createFormSigner,
  FormRejection,
  listSubmissions,
  MIN_FILL_MS,
  RateLimiter,
  submitForm,
  tickNotifications,
  unsubscribeNewsletter,
  type FormSigner,
} from "@senify/engine";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
} from "./helpers.ts";

// Prüfstelle 1: Forms & Submissions end-to-end against the real engine.

function tree(spec: {
  id: string;
  type: string;
  props?: Record<string, unknown>;
}): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {}, children: [spec.id] },
      [spec.id]: {
        id: spec.id,
        type: spec.type,
        props: (spec.props ?? {}) as NodeTree["nodes"][string]["props"],
      },
    },
  };
}

type RawResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function rawRequest(
  origin: string,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, origin);
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: options.method ?? "GET",
        headers: options.headers ?? {},
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

function extractForm(html: string): { action: string; token: string } {
  const action =
    html.match(/action="([^"]*\/api\/forms\/[^"]*\/submit)"/)?.[1] ?? "";
  const token =
    html.match(/name="form_token"\s+value="([^"]+)"/)?.[1] ??
    html.match(/value="([^"]+)"\s+name="form_token"/)?.[1] ??
    "";
  return { action, token };
}

function stripBom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

const GENEROUS = new RateLimiter({
  perMinute: 10_000,
  burst: 10_000,
  destructivePerMinute: 10_000,
});

let env: BootEnv;
let secret: string;
let signer: FormSigner;
let siteId = "";
let contactCollectionId = "";
let newsletterCollectionId = "";
let contactFormId = "";
let contactToken = "";
let contactSnapshotId = "";
let newsletterFormId = "";
let newsletterSnapshotId = "";
const thanksPath = "/danke";

// A token signed now, valid against the frozen snapshot: `aged` steps the
// issued-at back so the minimum fill time is satisfied.
function signedToken(
  formId: string,
  snapshotId: string,
  agedMs: number,
): string {
  return signer.sign({
    siteId,
    formId,
    snapshotId,
    issuedAt: Date.now() - agedMs,
  });
}

function contactSigned(agedMs = MIN_FILL_MS + 500): string {
  return signedToken(contactFormId, contactSnapshotId, agedMs);
}

function newsletterSigned(agedMs = MIN_FILL_MS + 500): string {
  return signedToken(newsletterFormId, newsletterSnapshotId, agedMs);
}

async function createCollection(body: Record<string, unknown>): Promise<string> {
  const response = await env.api.request<{ id: string }>({
    method: "POST",
    path: `/api/sites/${siteId}/collections/from-fields`,
    body,
  });
  if (response.status !== 201) {
    throw new Error(`Collection setup failed: ${JSON.stringify(response.body)}`);
  }
  return response.body.id;
}

const CONTACT_FIELD_PROPS = {
  fields: [
    { kind: "text", key: "name", label: "Name", required: true },
    { kind: "email", key: "email", label: "E-Mail", required: true },
    { kind: "textarea", key: "nachricht", label: "Nachricht", required: true },
  ],
};

function autoFields(statusOptions: [string, string][]): unknown[] {
  return [
    {
      key: "status",
      label: "Status",
      description: "Bearbeitungsstand.",
      type: "select",
      options: statusOptions.map(([value, label]) => ({ value, label })),
    },
    {
      key: "submitted_at",
      label: "Eingegangen am",
      description: "Zeitpunkt des Absendens.",
      type: "dateTime",
    },
    {
      key: "source_path",
      label: "Quellseite",
      description: "Pfad der Quellseite.",
      type: "text",
    },
    {
      key: "consent_text",
      label: "Zustimmungstext",
      description: "Textfassung der Einwilligung.",
      type: "text",
    },
    {
      key: "consent_ip_hash",
      label: "IP-Hash",
      description: "Gesalzener IP-Hash.",
      type: "text",
    },
  ];
}

async function pages(): Promise<{
  privacy: string;
  thanks: string;
  home: string;
  newsletter: string;
}> {
  const privacy = await createTestPage(env.api, siteId, {
    title: "Datenschutz",
    path: "/datenschutz",
  });
  const thanks = await createTestPage(env.api, siteId, {
    title: "Danke",
    path: thanksPath,
  });
  const home = await createTestPage(env.api, siteId, { title: "Start", path: "/" });
  const newsletter = await createTestPage(env.api, siteId, {
    title: "Newsletter",
    path: "/newsletter",
  });
  return {
    privacy: privacy.id,
    thanks: thanks.id,
    home: home.id,
    newsletter: newsletter.id,
  };
}

async function setDraft(
  pageId: string,
  title: string,
  path: string,
  draft: NodeTree,
): Promise<void> {
  const page = await env.engine.store.getPage(pageId);
  await env.engine.store.updatePage(pageId, page.draftVersion, {
    draft,
    title,
    path,
  });
}

beforeAll(async () => {
  env = await bootEngine();
  secret = await env.engine.store.getOrCreateFormSecret();
  signer = createFormSigner(secret);
  const site = await createTestSite(env.api, "Formular-Site");
  siteId = site.id;
  contactCollectionId = await createCollection({
    name: "Kontaktanfragen",
    slug: "kontaktanfragen",
    supports: ["search"],
    fields: [
      { key: "name", label: "Name", description: "Name.", type: "text", required: true },
      { key: "email", label: "E-Mail", description: "Adresse.", type: "email", required: true },
      { key: "nachricht", label: "Nachricht", description: "Text.", type: "longText", required: true },
      ...(autoFields([
        ["neu", "Neu"],
        ["beantwortet", "Beantwortet"],
      ]) as object[]),
    ],
  });
  newsletterCollectionId = await createCollection({
    name: "Newsletter-Abos",
    slug: "newsletter-abos",
    supports: ["search"],
    fields: [
      { key: "email", label: "E-Mail", description: "Adresse.", type: "email", required: true },
      ...(autoFields([
        ["pending", "Unbestätigt"],
        ["confirmed", "Bestätigt"],
        ["unsubscribed", "Abgemeldet"],
      ]) as object[]),
    ],
  });
  const created = await pages();
  await setDraft(
    created.home,
    "Start",
    "/",
    tree({
      id: "c1",
      type: "contact",
      props: {
        title: "Kontakt",
        ...CONTACT_FIELD_PROPS,
        targetCollectionId: contactCollectionId,
        consentText: "Mit dem Absenden stimmen Sie der Datenschutzerklärung zu.",
        consentPage: { pageId: created.privacy },
        successMessage: "Danke für deine Nachricht!",
        successPage: { pageId: created.thanks },
        notifyEmail: "team@musterstudio.de",
      },
    }),
  );
  await setDraft(
    created.newsletter,
    "Newsletter",
    "/newsletter",
    tree({
      id: "n1",
      type: "newsletter",
      props: {
        headline: "Newsletter",
        targetCollectionId: newsletterCollectionId,
        consentText: "Mit der Anmeldung stimmen Sie der Datenschutzerklärung zu.",
        consentPage: { pageId: created.privacy },
        successMessage: "Bitte bestätige den Link in deiner E-Mail.",
        successPage: { pageId: created.thanks },
        notifyEmail: "team@musterstudio.de",
      },
    }),
  );
}, 120000);

afterAll(async () => {
  await env.close();
});

describe("form bake and snapshot", () => {
  it("stamps a signed token, freezes the snapshot and renders the native form", async () => {
    const published = await env.api.request<{
      release: { id: string; buildRef: string | null };
    }>({
      method: "POST",
      path: `/api/sites/${siteId}/releases`,
      body: { author: TEST_AUTHOR },
    });
    expect(published.status).toBe(201);
    const buildRef = published.body.release.buildRef ?? "";
    expect(buildRef).not.toBe("");

    const html = readFileSync(join(buildRef, "index.html"), "utf8");
    const form = extractForm(html);
    expect(form.action).toContain("/api/forms/");
    expect(form.token).not.toBe("");
    expect(html).toContain('name="nachricht"');
    expect(html).toContain('name="consent"');
    expect(html).toContain('href="/datenschutz"');
    expect(html).toContain('src="/assets/forms.js"');
    const firstFormId = form.action.split("/")[3] ?? "";
    expect(firstFormId).not.toBe("");

    const newsletterHtml = readFileSync(
      join(buildRef, "newsletter", "index.html"),
      "utf8",
    );
    const newsletterForm = extractForm(newsletterHtml);
    expect(newsletterForm.action).toContain("/api/forms/");
    expect(newsletterForm.token).not.toBe("");

    const snapshot = await env.engine.store.getFormSnapshotForForm(firstFormId);
    expect(snapshot).toBeDefined();
    expect(snapshot?.snapshot.fields.map((field) => field.key)).toEqual([
      "name",
      "email",
      "nachricht",
    ]);
    expect(snapshot?.snapshot.targetCollectionId).toBe(contactCollectionId);
    expect(snapshot?.snapshot.honeypotKey).toBe("company");

    // Re-bake: same formId, a fresh snapshot, a token that still verifies.
    const again = await env.api.request<{ release: { buildRef: string | null } }>({
      method: "POST",
      path: `/api/sites/${siteId}/releases`,
      body: { author: TEST_AUTHOR },
    });
    expect(again.status).toBe(201);
    const latest = await env.engine.store.getFormSnapshotForForm(firstFormId);
    expect(latest?.formId).toBe(firstFormId);
    expect(latest?.snapshot.fields).toEqual(snapshot?.snapshot.fields);
    expect(latest?.id).not.toBe(snapshot?.id);
    expect(signer.verify(form.token)?.formId).toBe(firstFormId);

    contactFormId = firstFormId;
    contactToken = form.token;
    if (latest === undefined) throw new Error("Form snapshot missing after bake");
    contactSnapshotId = latest.id;
    newsletterFormId = newsletterForm.action.split("/")[3] ?? "";
    const newsletterRecord =
      await env.engine.store.getFormSnapshotForForm(newsletterFormId);
    if (newsletterRecord === undefined) {
      throw new Error("Newsletter snapshot missing after bake");
    }
    newsletterSnapshotId = newsletterRecord.id;
  }, 120000);
});

describe("form submission", () => {
  const base = (agedMs = MIN_FILL_MS + 500) => ({
    store: env.engine.store,
    signer,
    rateLimiter: GENEROUS,
    formId: contactFormId,
    token: contactSigned(agedMs),
    origin: env.server.origin,
    requestHost: new URL(env.server.origin).host,
    clientIp: "127.0.0.1",
  });

  async function attempt(
    input: Parameters<typeof submitForm>[0],
  ): Promise<unknown> {
    return submitForm(input).catch((error: unknown) => error);
  }

  it("rejects honeypot, missing origin, foreign origin, unknown fields and missing consent", async () => {
    const tooFast = await attempt({
      ...base(0),
      values: { name: "A", email: "a@b.de", nachricht: "Hallo" },
      consent: true,
      honeypot: "",
    });
    expect(tooFast).toBeInstanceOf(FormRejection);
    expect((tooFast as FormRejection).reason).toBe("spam");

    const honeypot = await attempt({
      ...base(),
      values: { name: "Bot", email: "bot@b.de", nachricht: "Hi", company: "Acme" },
      consent: true,
      honeypot: "",
    });
    expect((honeypot as FormRejection).reason).toBe("spam");

    const missingOrigin = await attempt({
      ...base(),
      origin: undefined,
      values: { name: "A", email: "a@b.de", nachricht: "Hallo" },
      consent: true,
      honeypot: "",
    });
    expect((missingOrigin as FormRejection).reason).toBe("origin");

    const foreignOrigin = await attempt({
      ...base(),
      origin: "https://evil.example",
      values: { name: "A", email: "a@b.de", nachricht: "Hallo" },
      consent: true,
      honeypot: "",
    });
    expect((foreignOrigin as FormRejection).reason).toBe("origin");

    const unknownField = await attempt({
      ...base(),
      values: { name: "A", email: "a@b.de", nachricht: "Hallo", rolle: "admin" },
      consent: true,
      honeypot: "",
    });
    expect((unknownField as FormRejection).reason).toBe("unknown_field");

    const missingConsent = await attempt({
      ...base(),
      values: { name: "A", email: "a@b.de", nachricht: "Hallo" },
      consent: false,
      honeypot: "",
    });
    expect((missingConsent as FormRejection).reason).toBe("validation");

    const badEmail = await attempt({
      ...base(),
      values: { name: "A", email: "keine-mail", nachricht: "Hallo" },
      consent: true,
      honeypot: "",
    });
    expect((badEmail as FormRejection).reason).toBe("validation");

    const missingField = await attempt({
      ...base(),
      values: { name: "A", email: "a@b.de" },
      consent: true,
      honeypot: "",
    });
    expect((missingField as FormRejection).reason).toBe("validation");
  });

  it("creates an entry, auto-fields and a notification job", async () => {
    const result = await submitForm({
      ...base(),
      values: {
        name: "Anna Beispiel",
        email: "anna@beispiel.de",
        nachricht: "Bitte um Rückruf.",
      },
      consent: true,
      honeypot: "",
    });
    expect(result.ok).toBe(true);
    expect(result.state).toBe("created");
    expect(result.redirectUrl).toBe("/danke?gesendet=1");

    const entry = await env.engine.store.getEntry(result.entryId);
    // Slim supports: the submission is published right away.
    expect(entry.status).toBe("published");
    const collection = await env.engine.store.getCollection(contactCollectionId);
    const byKey = (key: string): string =>
      collection.fields.find((field) => field.key === key)?.id ?? "";
    expect(entry.cells[byKey("name")]).toBe("Anna Beispiel");
    expect(entry.cells[byKey("email")]).toBe("anna@beispiel.de");
    expect(entry.cells[byKey("source_path")]).toBe("/");
    expect(entry.cells[byKey("consent_text")]).toContain("Datenschutzerklärung");
    expect(String(entry.cells[byKey("consent_ip_hash")]).length).toBeGreaterThan(10);

    const notifications = await env.engine.store.listNotifications(siteId);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0]?.kind).toBe("submission");
    expect(notifications[0]?.status).toBe("queued");
  });

  it("rate limits per IP", async () => {
    const tight = new RateLimiter({ perMinute: 1, burst: 1, destructivePerMinute: 1 });
    const first = await submitForm({
      ...base(),
      rateLimiter: tight,
      values: { name: "Eins", email: "eins@b.de", nachricht: "Erste" },
      consent: true,
      honeypot: "",
    });
    expect(first.ok).toBe(true);
    const second = await attempt({
      ...base(),
      rateLimiter: tight,
      values: { name: "Zwei", email: "zwei@b.de", nachricht: "Zweite" },
      consent: true,
      honeypot: "",
    });
    expect((second as FormRejection).reason).toBe("rate_limited");
    expect((second as FormRejection).status).toBe(429);
  });

  it("rejects a tampered token", async () => {
    const broken = `${contactToken.slice(0, -3)}abc`;
    const result = await attempt({
      ...base(),
      token: broken,
      values: { name: "A", email: "a@b.de", nachricht: "Hallo" },
      consent: true,
      honeypot: "",
    });
    expect((result as FormRejection).reason).toBe("token");
    expect((result as FormRejection).status).toBe(401);
  });
});

describe("public endpoint (progressive submit)", () => {
  it("accepts the same endpoint with and without JavaScript", async () => {
    const noOrigin = await rawRequest(env.server.origin, `/api/forms/${contactFormId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ form_token: contactToken, name: "X" }).toString(),
    });
    expect(noOrigin.status).toBe(400);
    expect(JSON.parse(noOrigin.body).error.reason).toBe("origin");

    // The stamped token is old enough to pass the minimum fill time.
    await new Promise((resolve) => setTimeout(resolve, MIN_FILL_MS + 250));

    const noJs = await rawRequest(env.server.origin, `/api/forms/${contactFormId}/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: env.server.origin,
      },
      body: new URLSearchParams({
        form_token: contactToken,
        name: "Ohne JS",
        email: "ohne-js@b.de",
        nachricht: "Klassischer POST",
        consent: "true",
      }).toString(),
    });
    // No JavaScript: a 303 to the success page.
    expect(noJs.status).toBe(303);
    expect(noJs.headers.location).toBe("/danke?gesendet=1");
    const count = await env.api.request<{ entries: { slug: string }[] }>({
      method: "GET",
      path: `/api/sites/${siteId}/entries?collectionId=${contactCollectionId}`,
    });
    expect(count.body.entries.length).toBeGreaterThanOrEqual(1);

    // JavaScript path: the very same endpoint, JSON in and out.
    const json = await rawRequest(env.server.origin, `/api/forms/${contactFormId}/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: env.server.origin,
      },
      body: JSON.stringify({
        token: contactToken,
        values: {
          name: "Mit JS",
          email: "mit-js@b.de",
          nachricht: "Inline-Bestätigung",
        },
        consent: true,
      }),
    });
    expect(json.status).toBe(200);
    const parsed = JSON.parse(json.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.message).toContain("Danke");
  }, 60000);
});

describe("newsletter double opt-in", () => {
  async function submitNewsletter(email: string): Promise<string> {
    const result = await submitForm({
      store: env.engine.store,
      signer,
      rateLimiter: GENEROUS,
      formId: newsletterFormId,
      token: newsletterSigned(),
      values: { email },
      consent: true,
      honeypot: "",
      origin: env.server.origin,
      requestHost: new URL(env.server.origin).host,
      clientIp: "127.0.0.1",
      now: Date.now() + MIN_FILL_MS + 1,
    });
    expect(result.state).toBe("pending");
    return result.entryId;
  }

  it("goes pending -> confirmed (idempotent) and unsubscribed", async () => {
    const entryId = await submitNewsletter("abo@beispiel.de");
    const entry = await env.engine.store.getEntry(entryId);
    const collection = await env.engine.store.getCollection(newsletterCollectionId);
    const statusField = collection.fields.find((field) => field.key === "status")?.id ?? "";
    expect(entry.cells[statusField]).toBe("pending");

    const notifications = await env.engine.store.listNotifications(siteId);
    const confirmation = notifications.find(
      (message) => message.kind === "newsletter_confirmation",
    );
    expect(confirmation).toBeDefined();
    const token = confirmation?.body.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? "";
    expect(token).not.toBe("");

    const confirmed = await confirmNewsletter(env.engine.store, { token });
    expect(confirmed.state).toBe("confirmed");
    const afterConfirm = await env.engine.store.getEntry(entryId);
    expect(afterConfirm.cells[statusField]).toBe("confirmed");

    // Double confirmation stays idempotent.
    const again = await confirmNewsletter(env.engine.store, { token });
    expect(again.state).toBe("already");

    // Expiry is enforced.
    const expired = await env.engine.store.createNewsletterToken({
      formId: newsletterFormId,
      siteId,
      entryId,
      email: "abo@beispiel.de",
      kind: "confirm",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const expiredResult = await confirmNewsletter(env.engine.store, {
      token: expired.token,
    }).catch((error: unknown) => error);
    expect((expiredResult as FormRejection).reason).toBe("newsletter");

    // The unsubscribe token flips the status after the fact.
    const unsubscribe = await env.engine.store.createNewsletterToken({
      formId: newsletterFormId,
      siteId,
      entryId,
      email: "abo@beispiel.de",
      kind: "unsubscribe",
      expiresAt: null,
    });
    const unsubscribed = await unsubscribeNewsletter(env.engine.store, {
      token: unsubscribe.token,
    });
    expect(unsubscribed.state).toBe("unsubscribed");
    expect((await env.engine.store.getEntry(entryId)).cells[statusField]).toBe(
      "unsubscribed",
    );
    const againUnsub = await unsubscribeNewsletter(env.engine.store, {
      token: unsubscribe.token,
    });
    expect(againUnsub.state).toBe("already");

    const unknown = await unsubscribeNewsletter(env.engine.store, {
      token: "does-not-exist",
    }).catch((error: unknown) => error);
    expect((unknown as FormRejection).status).toBe(404);
  });

  it("confirms through the public route", async () => {
    const result = await submitForm({
      store: env.engine.store,
      signer,
      rateLimiter: GENEROUS,
      formId: newsletterFormId,
      token: newsletterSigned(),
      values: { email: "route@beispiel.de" },
      consent: true,
      honeypot: "",
      origin: env.server.origin,
      requestHost: new URL(env.server.origin).host,
      clientIp: "127.0.0.1",
      now: Date.now() + MIN_FILL_MS + 1,
    });
    const notifications = await env.engine.store.listNotifications(siteId);
    const confirmation = notifications.find(
      (message) =>
        message.kind === "newsletter_confirmation" &&
        message.entryId === result.entryId,
    );
    const token = confirmation?.body.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? "";
    const response = await rawRequest(
      env.server.origin,
      `/api/newsletter/confirm?token=${token}`,
      { headers: { accept: "application/json" } },
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).state).toBe("confirmed");
  });
});

describe("notification job retry", () => {
  it("retries with backoff, skips not-due jobs and fails after max attempts", async () => {
    const queued = await env.engine.store.enqueueNotification({
      siteId,
      formId: contactFormId,
      entryId: null,
      kind: "test",
      recipient: "ops@musterstudio.de",
      subject: "Test",
      body: "Body",
    });
    const now = Date.now();
    const failing = async (): Promise<void> => {
      throw new Error("SMTP nicht erreichbar");
    };
    const first = await tickNotifications({
      store: env.engine.store,
      transport: failing,
      now,
    });
    expect(first.retried.map((entry) => entry.id)).toContain(queued.id);
    const afterFirst = await env.engine.store.getNotification(queued.id);
    expect(afterFirst.attempts).toBe(1);
    expect(afterFirst.status).toBe("queued");
    expect(Date.parse(afterFirst.nextAttemptAt)).toBeGreaterThan(now);
    expect(afterFirst.lastError).toContain("SMTP");

    // Not due yet: the second tick before next_attempt_at skips the job.
    const second = await tickNotifications({
      store: env.engine.store,
      transport: failing,
      now: now + 1000,
    });
    expect(second.retried.map((entry) => entry.id)).not.toContain(queued.id);
    expect((await env.engine.store.getNotification(queued.id)).attempts).toBe(1);

    // Exhaust the attempts: the job ends as failed.
    let clock = now;
    let attempts = 1;
    while (attempts < 5) {
      clock += 60 * 60 * 1000;
      const tick = await tickNotifications({
        store: env.engine.store,
        transport: failing,
        now: clock,
      });
      void tick;
      attempts = (await env.engine.store.getNotification(queued.id)).attempts;
    }
    const exhausted = await env.engine.store.getNotification(queued.id);
    expect(exhausted.status).toBe("failed");
    expect(exhausted.attempts).toBe(5);

    // A working transport delivers a fresh job.
    const ok = await env.engine.store.enqueueNotification({
      siteId,
      formId: null,
      entryId: null,
      kind: "test",
      recipient: "ops@musterstudio.de",
      subject: "Ok",
      body: "Body",
    });
    const sent = await tickNotifications({ store: env.engine.store, now: Date.now() });
    expect(sent.sent).toContain(ok.id);
    expect((await env.engine.store.getNotification(ok.id)).status).toBe("sent");
  });
});

describe("collection from form, submissions view and CSV", () => {
  it("plans and creates a collection from the baked form", async () => {
    const plan = await env.api.request<{
      collection: { name: string; fields: { key: string; options?: unknown[] }[] };
      snapshot: { mode: string };
    }>({
      method: "POST",
      path: `/api/sites/${siteId}/forms/collection-plan`,
      body: { formId: contactFormId },
    });
    expect(plan.status).toBe(200);
    expect(plan.body.snapshot.mode).toBe("message");
    const keys = plan.body.collection.fields.map((field) => field.key);
    expect(keys).toEqual([
      "name",
      "email",
      "nachricht",
      "status",
      "submitted_at",
      "source_path",
      "consent_text",
      "consent_ip_hash",
    ]);
    const statusField = plan.body.collection.fields.find(
      (field) => field.key === "status",
    );
    expect(statusField?.options).toHaveLength(2);

    const created = await env.api.request<{
      collection: { id: string; fields: { key: string }[] };
    }>({
      method: "POST",
      path: `/api/sites/${siteId}/forms/collection`,
      body: { formId: contactFormId, name: "Einsendungen" },
    });
    expect(created.status).toBe(201);
    // Builtin title field plus the form + auto fields.
    expect(created.body.collection.fields.map((field) => field.key)).toContain(
      "consent_ip_hash",
    );
  });

  it("lists submissions and exports CSV from the frozen snapshot columns", async () => {
    const view = await listSubmissions(env.engine.store, { formId: contactFormId });
    expect(view.source).toBe("form");
    expect(view.columns.map((column) => column.key)).toEqual([
      "name",
      "email",
      "nachricht",
      "source_path",
      "submitted_at",
      "status",
    ]);
    expect(view.rows.length).toBeGreaterThanOrEqual(1);
    expect(
      view.rows.some((row) =>
        row.values.some((value) => value.value.includes("Rückruf")),
      ),
    ).toBe(true);

    const csv = buildSubmissionsCsv({ columns: view.columns, rows: view.rows });
    // Header = snapshot fields in snapshot order, then the auto columns.
    const header = stripBom(csv).split("\r\n")[0];
    expect(header).toBe("Name;E-Mail;Nachricht;Quellseite;Eingegangen am;Status");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Anna Beispiel");
    // Umlaute survive: the BOM tells the spreadsheet the file is UTF-8.
    expect(csv).toContain("Rückruf");

    const response = await rawRequest(
      env.server.origin,
      `/api/forms/${contactFormId}/submissions.csv`,
      { headers: { authorization: `Bearer ${env.token}` } },
    );
    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"])).toContain("text/csv");
    expect(String(response.headers["content-disposition"])).toBe(
      `attachment; filename="submissions-${contactFormId}.csv"`,
    );
    expect(response.body.startsWith("\uFEFF")).toBe(true);
    expect(stripBom(response.body).split("\r\n")[0]).toBe(header);
    expect(response.body).toContain("anna@beispiel.de");

    const json = await env.api.request<{ columns: unknown[] }>({
      method: "GET",
      path: `/api/forms/${contactFormId}/submissions`,
    });
    expect(json.status).toBe(200);
    expect(json.body.columns).toHaveLength(6);
  });

  it("quotes semicolons, quotes and newlines per RFC 4180, plain umlauts stay bare", () => {
    const columns = [
      { key: "name", label: "Name" },
      { key: "notiz", label: "Notiz" },
    ];
    const row = {
      entryId: "e1",
      slug: "eins",
      status: "published" as const,
      createdAt: "2026-09-15T10:00",
      submittedAt: "2026-09-15T10:00",
      sourcePath: "/",
      values: [
        { key: "name", label: "Name", value: "Anna;Beispiel" },
        { key: "notiz", label: "Notiz", value: 'Rückruf "bitte"\nzweite Zeile' },
      ],
    };
    const csv = buildSubmissionsCsv({ columns, rows: [row] });
    expect(csv).toBe(
      '\uFEFFName;Notiz\r\n"Anna;Beispiel";"Rückruf ""bitte""\nzweite Zeile"\r\n',
    );

    // Plain values stay unquoted; a leading formula character is neutralized.
    const plain = buildSubmissionsCsv({
      columns,
      rows: [
        {
          ...row,
          values: [
            { key: "name", label: "Name", value: "Grüße" },
            { key: "notiz", label: "Notiz", value: "=SUM(A1)" },
          ],
        },
      ],
    });
    expect(plain).toBe("\uFEFFName;Notiz\r\nGrüße;'=SUM(A1)\r\n");
  });

  it("needs a read token and rejects unknown or foreign forms", async () => {
    const anonymous = await rawRequest(
      env.server.origin,
      `/api/forms/${contactFormId}/submissions.csv`,
    );
    expect(anonymous.status).toBe(401);

    const unknown = await rawRequest(
      env.server.origin,
      "/api/forms/unbekannt/submissions.csv",
      { headers: { authorization: `Bearer ${env.token}` } },
    );
    expect(unknown.status).toBe(404);
    expect(JSON.parse(unknown.body).error.category).toBe("not_found");

    // A snapshot whose target collection lives on another site is foreign.
    const record = await env.engine.store.getFormSnapshotForForm(contactFormId);
    if (record === undefined) throw new Error("Contact snapshot missing");
    await env.engine.store.saveFormSnapshot({
      id: "snapshot-fremd",
      formId: "fremdes-formular",
      siteId: "site-fremd",
      pageId: record.pageId,
      nodeId: record.nodeId,
      pagePath: record.pagePath,
      sectionType: record.sectionType,
      snapshot: record.snapshot,
    });
    const foreign = await rawRequest(
      env.server.origin,
      "/api/forms/fremdes-formular/submissions.csv",
      { headers: { authorization: `Bearer ${env.token}` } },
    );
    expect(foreign.status).toBe(404);
    expect(JSON.parse(foreign.body).error.category).toBe("not_found");

    const listed = await listSubmissions(env.engine.store, {
      formId: "fremdes-formular",
    }).catch((error: unknown) => error);
    expect(listed).toBeInstanceOf(SenifyError);
    expect((listed as SenifyError).category).toBe("not_found");
  });
});

describe("form overview for the program", () => {
  it("lists the latest snapshot per form with fields and target collection", async () => {
    const response = await env.api.request<{
      forms: {
        formId: string;
        pagePath: string;
        sectionType: string;
        mode: string;
        targetCollectionId: string | null;
        fields: { key: string; label: string }[];
      }[];
    }>({ method: "GET", path: `/api/sites/${siteId}/forms` });
    expect(response.status).toBe(200);

    const contact = response.body.forms.filter((entry) => entry.formId === contactFormId);
    expect(contact).toHaveLength(1);
    expect(contact[0]?.pagePath).toBe("/");
    expect(contact[0]?.sectionType).toBe("contact");
    expect(contact[0]?.mode).toBe("message");
    expect(contact[0]?.targetCollectionId).toBe(contactCollectionId);
    expect(contact[0]?.fields.map((field) => field.key)).toEqual([
      "name",
      "email",
      "nachricht",
    ]);
    expect(contact[0]?.fields.map((field) => field.label)).toEqual([
      "Name",
      "E-Mail",
      "Nachricht",
    ]);

    const newsletter = response.body.forms.find(
      (entry) => entry.formId === newsletterFormId,
    );
    expect(newsletter?.sectionType).toBe("newsletter");
    expect(newsletter?.mode).toBe("newsletter");
    expect(newsletter?.pagePath).toBe("/newsletter");
  });
});

describe("publish hard checks", () => {
  it("blocks a publish when a form is not wired up", async () => {
    const site = await createTestSite(env.api, "Check-Site");
    const page = await createTestPage(env.api, site.id, { title: "Kaputt", path: "/" });
    await setDraft(
      page.id,
      "Kaputt",
      "/",
      tree({
        id: "c9",
        type: "contact",
        props: {
          ...CONTACT_FIELD_PROPS,
          consentText: "Zustimmung",
        },
      }),
    );
    const blocked = await env.api.request<{ error: { message: string } }>({
      method: "POST",
      path: `/api/sites/${site.id}/releases`,
      body: { author: TEST_AUTHOR },
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.message).toMatch(/Ziel-Sammlung|Erfolgsseite|Consent/);

    // Duplicate keys are a hard check too.
    const duplicate = await createTestPage(env.api, site.id, {
      title: "Doppelt",
      path: "/doppelt",
    });
    await setDraft(
      duplicate.id,
      "Doppelt",
      "/doppelt",
      tree({
        id: "c10",
        type: "contact",
        props: {
          fields: [
            { kind: "text", key: "name", label: "Name" },
            { kind: "email", key: "name", label: "E-Mail" },
          ],
          consentText: "Zustimmung",
        },
      }),
    );
    const dupBlocked = await env.api.request<{ error: { message: string } }>({
      method: "POST",
      path: `/api/sites/${site.id}/releases`,
      body: { author: TEST_AUTHOR },
    });
    expect(dupBlocked.status).toBe(422);
  }, 60000);
});
