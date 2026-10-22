import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PropValue } from "@senify/section-sdk";
import { createCodePayload } from "../src/code-payloads.ts";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type ErrorResponse,
  type MutationsResponse,
  type PageResponse,
} from "./helpers.ts";

type ReleaseResponse = {
  release: {
    id: string;
    buildRef: string | null;
    basisReleaseId: string | null;
    pageRevisions: { pageId: string; path: string; revisionId: string }[];
  };
  checks: { hard: unknown[]; soft: unknown[] };
};

let env: BootEnv;
let siteId: string;
let mainPage: PageResponse;

async function loadPage(pageId: string): Promise<PageResponse> {
  const response = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${pageId}`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

async function insertNode(
  pageId: string,
  nodeId: string,
  type: string,
  props: Record<string, PropValue>,
): Promise<{ status: number; body: MutationsResponse & ErrorResponse }> {
  const page = await loadPage(pageId);
  return applyMutationsRequest(env.api, page, [
    {
      op: "insertNode",
      parent: { nodeId: page.draft.rootNodeId },
      node: { id: nodeId, type, props },
    },
  ]);
}

async function updateHeadline(
  pageId: string,
  nodeId: string,
  headline: string,
): Promise<{ status: number; body: MutationsResponse & ErrorResponse }> {
  return applyMutationsRequest(env.api, await loadPage(pageId), [
    { op: "updateNodeProps", id: nodeId, patch: { headline } },
  ]);
}

async function headlineOf(pageId: string, nodeId: string): Promise<string> {
  const page = await loadPage(pageId);
  const node = page.draft.nodes[nodeId] as { props: { headline?: string } };
  return node.props.headline ?? "";
}

async function publishRelease(
  site: string,
  body: Record<string, unknown> = {},
): Promise<{ status: number; body: ReleaseResponse & ErrorResponse }> {
  return env.api.request<ReleaseResponse & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${site}/releases`,
    body: { author: TEST_AUTHOR, ...body },
  });
}

beforeAll(async () => {
  env = await bootEngine();
  siteId = (await createTestSite(env.api, "Lifecycle Studio")).id;
  mainPage = await createTestPage(env.api, siteId, { title: "Start" });
});

afterAll(async () => {
  await env.close();
});

describe("releases and revisions", () => {
  it("leads an unchecked payload licence in the release checks", async () => {
    // ADR-0010 §4: a payload may run on its own site with an unchecked licence,
    // but the release says so — it is never silently accepted. The soft check
    // list is where that statement lands.
    //
    // A site of its own: a payload carrier is a heavy surface (profile `clean`
    // allows one), and the shared site must stay clear for the other tests.
    const ownSite = (await createTestSite(env.api, "Lizenz Studio")).id;
    const ownPage = await createTestPage(env.api, ownSite, { title: "Start" });
    const payload = await createCodePayload(env.engine.store, {
      siteId: ownSite,
      body: {
        name: "Ungeprüft",
        kind: "module",
        bundle: "export function mount(stage) { stage.textContent = 'x'; }",
        provenance: { kind: "framer-import", sourceUrl: "https://example.test/" },
        license: { id: "unknown" },
      },
    });
    const rootId = (await loadPage(ownPage.id)).draft.rootNodeId;
    const carried = await applyMutationsRequest(env.api, await loadPage(ownPage.id), [
      {
        op: "insertNode",
        parent: { nodeId: rootId },
        node: { id: "carrier-1", type: "payload", props: { payloadId: payload.id, label: "Original" } },
      },
    ]);
    expect(carried.status).toBe(200);
    const published = await publishRelease(ownSite, { note: "mit Payload" });
    expect(published.status).toBe(201);
    const messages = published.body.checks.soft.map((issue) => (issue as { message: string }).message);
    expect(messages.some((message) => message.includes('"Ungeprüft"') && message.includes("ungeprüfter Lizenz"))).toBe(true);
    // The counter-proof: the licence is the only thing standing in the way, so
    // a checked payload must not produce the check.
    const cleared = await createCodePayload(env.engine.store, {
      siteId: ownSite,
      body: {
        name: "Geprüft",
        kind: "module",
        bundle: "export function mount(stage) { stage.textContent = 'y'; }",
        provenance: { kind: "framer-import", sourceUrl: "https://example.test/" },
        license: { id: "MIT", assertedBy: "hand" },
      },
    });
    await applyMutationsRequest(env.api, await loadPage(ownPage.id), [
      { op: "updateNodeProps", id: "carrier-1", patch: { payloadId: cleared.id } },
    ]);
    const second = await publishRelease(ownSite, { note: "geprüft" });
    expect(second.status).toBe(201);
    const secondMessages = second.body.checks.soft.map((issue) => (issue as { message: string }).message);
    expect(secondMessages.some((message) => message.includes('"Geprüft"') && message.includes("ungeprüfter Lizenz"))).toBe(false);
  }, 120_000);

  it("publishes a release with revisions for every page", async () => {
    const inserted = await insertNode(mainPage.id, "hero-1", "hero", {
      headline: "Publish mich",
    });
    expect(inserted.status).toBe(200);
    const published = await publishRelease(siteId, { note: "erster Release" });
    expect(published.status).toBe(201);
    expect(published.body.release.pageRevisions).toHaveLength(1);
    expect(published.body.release.buildRef).toContain("releases");
    expect(published.body.release.basisReleaseId).toBeNull();

    const revisions = await env.api.request<{
      revisions: { id: string; nodeCount: number; note: string | null }[];
    }>({ method: "GET", path: `/api/pages/${mainPage.id}/revisions` });
    expect(revisions.status).toBe(200);
    expect(revisions.body.revisions).toHaveLength(1);
    expect(revisions.body.revisions[0]?.nodeCount).toBeGreaterThan(1);
    expect(revisions.body.revisions[0]?.note).toBe("erster Release");

    const releases = await env.api.request<{
      releases: { id: string }[];
      activeReleaseId: string | null;
    }>({ method: "GET", path: `/api/sites/${siteId}/releases` });
    expect(releases.body.releases).toHaveLength(1);
    expect(releases.body.activeReleaseId).toBe(published.body.release.id);
  }, 90000);

  it("restores a revision as a new draft and audits the restore", async () => {
    await updateHeadline(mainPage.id, "hero-1", "Geändert");
    const revisions = await env.api.request<{ revisions: { id: string }[] }>({
      method: "GET",
      path: `/api/pages/${mainPage.id}/revisions`,
    });
    const revisionId = revisions.body.revisions[0]?.id ?? "";
    const restored = await env.api.request<PageResponse>({
      method: "POST",
      path: `/api/pages/${mainPage.id}/restore`,
      body: { author: TEST_AUTHOR, revisionId },
    });
    expect(restored.status).toBe(200);
    expect(await headlineOf(mainPage.id, "hero-1")).toBe("Publish mich");

    const audit = await env.api.request<{ entries: { mutation: string }[] }>({
      method: "GET",
      path: `/api/pages/${mainPage.id}/audit?limit=5`,
    });
    expect(
      audit.body.entries.some((entry) => entry.mutation === "restoreRevision"),
    ).toBe(true);

    const missing = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/pages/${mainPage.id}/restore`,
      body: { author: TEST_AUTHOR, revisionId: "nope" },
    });
    expect(missing.status).toBe(404);
  });
});

describe("guardrails and checks", () => {
  it("blocks writes that would break the pin guardrail", async () => {
    const site = (await createTestSite(env.api, "Pins")).id;
    const page = await createTestPage(env.api, site, { title: "Pins" });
    await insertNode(page.id, "pin-0001", "pinned", { headline: "Eins" });
    const withMotion = await applyMutationsRequest(
      env.api,
      await loadPage(page.id),
      [{ op: "setMotion", id: "pin-0001", spec: { preset: "scrub-pin" } }],
    );
    expect(withMotion.status).toBe(200);

    await insertNode(page.id, "pin-0002", "pinned", { headline: "Zwei" });
    const blocked = await applyMutationsRequest(
      env.api,
      await loadPage(page.id),
      [{ op: "setMotion", id: "pin-0002", spec: { preset: "scrub-pin" } }],
    );
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.category).toBe("guardrail");
    expect(blocked.body.error.message).toContain("pin presets");
    expect(blocked.body.error.suggestion).toContain("one pin preset");

    const stillOne = await loadPage(page.id);
    const node = stillOne.draft.nodes["pin-0002"] as { motion?: unknown };
    expect(node.motion).toBeUndefined();
  });

  it("blocks publish on broken links and missing alt texts", async () => {
    const site = (await createTestSite(env.api, "Checks")).id;
    const page = await createTestPage(env.api, site, { title: "Kaputt" });
    const linkInsert = await insertNode(page.id, "cta-0001", "cta", {
      headline: "Link",
      buttons: [{ label: "Los", link: { pageId: "missing-page" } }],
    });
    expect(linkInsert.status).toBe(200);
    const blockedLink = await publishRelease(site);
    expect(blockedLink.status).toBe(422);
    expect(blockedLink.body.error.message).toContain("does not exist");

    await applyMutationsRequest(env.api, await loadPage(page.id), [
      { op: "deleteNode", id: "cta-0001" },
    ]);
    const gallery = await insertNode(page.id, "gallery-1", "gallery", {
      title: "Galerie",
      items: [{ asset: { assetId: "bild-1" } }],
    });
    expect(gallery.status).toBe(200);
    const blockedAlt = await publishRelease(site);
    expect(blockedAlt.status).toBe(422);
    expect(blockedAlt.body.error.message).toContain("alt text");
  });

  // Ticket 04, publish versions: the pin is a contract — the release blocks
  // site-wide while an instance pins an older definition version (no silent
  // fallback to the newer definition), and passes once the instances follow.
  it("blocks publish while a component instance pins an older version", async () => {
    const site = (await createTestSite(env.api, "Drift")).id;
    const page = await createTestPage(env.api, site, { title: "Drift" });

    const definition = await insertNode(page.id, "def-card-01", "__component", {
      name: "Karte",
      version: 1,
    });
    expect(definition.status).toBe(200);
    const child = await applyMutationsRequest(env.api, await loadPage(page.id), [
      {
        op: "insertNode",
        parent: { nodeId: "def-card-01" },
        node: { id: "def-head-01", type: "hero", props: { headline: "Titel" } },
      },
    ]);
    expect(child.status).toBe(200);
    const instance = await insertNode(page.id, "inst-a-01", "__component_instance", {
      componentId: "def-card-01",
      componentVersion: 1,
    });
    expect(instance.status).toBe(200);

    // The definition moves on, the instance still pins v1: the release blocks.
    const bumped = await applyMutationsRequest(env.api, await loadPage(page.id), [
      { op: "updateNodeProps", id: "def-card-01", patch: { version: 2 } },
    ]);
    expect(bumped.status).toBe(200);
    const blocked = await publishRelease(site);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.category).toBe("guardrail");
    expect(blocked.body.error.message).toContain("pins component version 1");
    expect(blocked.body.error.message).toContain("version 2");
    expect(blocked.body.error.suggestion).toContain("update_component_instances");

    // Updating the instance resolves the drift: the same release goes through.
    const updated = await applyMutationsRequest(env.api, await loadPage(page.id), [
      { op: "updateNodeProps", id: "inst-a-01", patch: { componentVersion: 2 } },
    ]);
    expect(updated.status).toBe(200);
    const published = await publishRelease(site);
    expect(published.status).toBe(201);
  }, 90000);
});

describe("review loop", () => {
  let reviewId: string;
  let preview: { id: string; token: string; status: string };

  it("submits a review with preview, diff and checks", async () => {
    await updateHeadline(mainPage.id, "hero-1", "Review mich");
    const submitted = await env.api.request<{
      review: {
        id: string;
        status: string;
        thread: { note: string }[];
        structureDiff: { pageId: string; status: string; sections: unknown[] }[];
      };
      preview: { id: string; token: string; status: string };
      checks: { hard: unknown[]; soft: unknown[] };
    }>({
      method: "POST",
      path: `/api/sites/${siteId}/reviews`,
      body: { author: TEST_AUTHOR, note: "Bitte prüfen" },
    });
    expect(submitted.status).toBe(201);
    reviewId = submitted.body.review.id;
    preview = submitted.body.preview;
    expect(submitted.body.preview.status).toBe("ready");
    expect(submitted.body.review.status).toBe("submitted");
    expect(submitted.body.review.thread[0]?.note).toBe("Bitte prüfen");
    const diff = submitted.body.review.structureDiff.find(
      (entry) => entry.pageId === mainPage.id,
    );
    expect(diff?.status).toBe("changed");
    expect(diff?.sections.length).toBeGreaterThan(0);
  }, 90000);

  it("serves the preview build behind the signed token", async () => {
    const ok = await fetch(
      `${env.server.origin}/api/previews/${preview.id}/files/index.html?token=${preview.token}`,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/html");
    const html = await ok.text();
    expect(html).toContain("Review mich");

    const noToken = await fetch(
      `${env.server.origin}/api/previews/${preview.id}/files/index.html`,
    );
    expect(noToken.status).toBe(401);

    const traversal = await fetch(
      `${env.server.origin}/api/previews/${preview.id}/files/..%2F..%2Fpackage.json?token=${preview.token}`,
    );
    expect(traversal.status).toBe(400);
  });

  it("runs request changes → fix → approve → release", async () => {
    const withoutNote = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/reviews/${reviewId}/request-changes`,
      body: { author: TEST_AUTHOR },
    });
    expect(withoutNote.status).toBe(400);
    expect(withoutNote.body.error.field).toBe("note");

    const requested = await env.api.request<{
      status: string;
      thread: { note: string }[];
    }>({
      method: "POST",
      path: `/api/reviews/${reviewId}/request-changes`,
      body: { author: TEST_AUTHOR, note: "Headline kürzen" },
    });
    expect(requested.status).toBe(200);
    expect(requested.body.status).toBe("changes_requested");
    expect(requested.body.thread.at(-1)?.note).toBe("Headline kürzen");

    const feedback = await env.api.request<{ thread: { note: string }[] }>({
      method: "GET",
      path: `/api/reviews/${reviewId}`,
    });
    expect(feedback.body.thread.at(-1)?.note).toBe("Headline kürzen");

    await updateHeadline(mainPage.id, "hero-1", "Kurz");

    const approved = await env.api.request<{
      review: { status: string; releaseId: string | null };
      release: { id: string; buildRef: string | null };
    }>({
      method: "POST",
      path: `/api/reviews/${reviewId}/approve`,
      body: { author: TEST_AUTHOR, note: "Passt" },
    });
    expect(approved.status).toBe(200);
    expect(approved.body.review.status).toBe("approved");
    expect(approved.body.review.releaseId).toBe(approved.body.release.id);
    expect(approved.body.release.buildRef).toContain("releases");
  }, 90000);

  it("rolls back to an older release as a new release", async () => {
    const releases = await env.api.request<{
      releases: { id: string; pageRevisions: { revisionId: string }[] }[];
    }>({ method: "GET", path: `/api/sites/${siteId}/releases` });
    const first = releases.body.releases.at(-1);
    const rollback = await publishRelease(siteId, {
      note: "Rollback",
      basisReleaseId: first?.id,
    });
    expect(rollback.status).toBe(201);
    expect(rollback.body.release.basisReleaseId).toBe(first?.id);
    expect(rollback.body.release.pageRevisions).toEqual(first?.pageRevisions);

    const active = await env.api.request<{ activeReleaseId: string }>({
      method: "GET",
      path: `/api/sites/${siteId}/releases`,
    });
    expect(active.body.activeReleaseId).toBe(rollback.body.release.id);
    expect(await headlineOf(mainPage.id, "hero-1")).toBe("Publish mich");
  }, 90000);

  it("discards a review and restores the draft state of the submit", async () => {
    await updateHeadline(mainPage.id, "hero-1", "Verwerfen");
    const submitted = await env.api.request<{ review: { id: string } }>({
      method: "POST",
      path: `/api/sites/${siteId}/reviews`,
      body: { author: TEST_AUTHOR },
    });
    expect(submitted.status).toBe(201);
    const discardId = submitted.body.review.id;

    await updateHeadline(mainPage.id, "hero-1", "Nach Submit");
    const discarded = await env.api.request<{ status: string }>({
      method: "POST",
      path: `/api/reviews/${discardId}/discard`,
      body: { author: TEST_AUTHOR, note: "verworfen" },
    });
    expect(discarded.status).toBe(200);
    expect(discarded.body.status).toBe("discarded");
    expect(await headlineOf(mainPage.id, "hero-1")).toBe("Verwerfen");
  }, 90000);
});

describe("preview lifecycle", () => {
  it("expires previews after their TTL and stops serving them", async () => {
    const preview = await env.engine.store.createPreview({
      siteId,
      buildRef: `${env.engine.dataDir}/previews/gone`,
      token: "expired-token",
      createdBy: { ...TEST_AUTHOR },
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const listed = await env.api.request<{
      previews: { id: string; status: string }[];
      expired: number;
    }>({ method: "GET", path: `/api/sites/${siteId}/previews` });
    expect(listed.body.expired).toBeGreaterThan(0);
    const entry = listed.body.previews.find((item) => item.id === preview.id);
    expect(entry?.status).toBe("expired");

    const served = await fetch(
      `${env.server.origin}/api/previews/${preview.id}/files/index.html?token=expired-token`,
    );
    expect(served.status).toBe(404);
  });
});
