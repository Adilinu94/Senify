import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyRedesign } from "@senify/engine";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type ErrorResponse,
} from "./helpers.ts";

// Prüfstelle 1 für apply_redesign (E25 slice 2): die mechanischen Schritte —
// Duplikat, Theme-Patch, Golden-Gerüst, Design-Record — laufen über die
// kanonischen Schreibwege; das Original bleibt unangetastet und das aktive
// Release wird nie berührt.

function pngImage(width: number, height: number): string {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

const DESIGN_DOC = [
  "# Terminal Studio",
  "",
  "## Colors",
  "",
  "| Role | Hex | Usage |",
  "|------|-----|-------|",
  "| primary | `#00E07A` | CTAs |",
  "| background | `#141414` | Page canvas |",
  "| ink | `#FFFFFF` | Headlines |",
  "",
  "## Typography",
  "",
  "Font family: **Geist Mono, Inter**, fallback `system-ui, sans-serif`.",
  "",
  "| Style | Size | Weight | Line Height | Spacing |",
  "|-------|------|--------|-------------|---------|",
  "| Body | 14px | 400 | 1.6 | 0 |",
  "",
  "## Shape",
  "",
  "| Token | Radius | Components |",
  "|-------|--------|------------|",
  "| Base | 0px | Cards |",
].join("\n");

let env: BootEnv;
let originalSiteId: string;
let pageId: string;
let referenceId: string;

beforeAll(async () => {
  env = await bootEngine();
  originalSiteId = (await createTestSite(env.api, "Original")).id;
  const page = await createTestPage(env.api, originalSiteId, {
    title: "Start",
    path: "/",
  });
  pageId = page.id;
  const stored = await env.api.request<{ reference: { id: string } }>({
    method: "POST",
    path: "/api/references/manual",
    body: {
      name: "Terminal Studio",
      documents: { design: DESIGN_DOC, guidelines: null, components: null },
      image: pngImage(1920, 1080),
      author: TEST_AUTHOR,
    },
  });
  expect(stored.status).toBe(201);
  referenceId = stored.body.reference.id;
}, 30000);

afterAll(async () => {
  await env.close();
});

describe("apply_redesign (E25 slice 2)", () => {
  it("duplicates the site, writes the theme patch and seeds empty pages", async () => {
    const result = await applyRedesign({
      store: env.engine.store,
      registry: env.registry,
      siteId: originalSiteId,
      referenceIds: [referenceId],
      author: TEST_AUTHOR,
    });

    expect(result.duplicated).toBe(true);
    expect(result.siteId).not.toBe(originalSiteId);
    expect(result.siteName).toBe("Original (Kopie)");
    expect(result.record.referenceIds).toEqual([referenceId]);
    expect(result.record.verificationOk).toBe(true);
    expect(result.record.steps.some((step) => step.includes("duplicate_site"))).toBe(true);
    expect(result.record.steps).toContain("update_theme (abgeleiteter Patch)");
    // The theme patch carries the design.md values.
    expect(result.record.themeChanges.length).toBeGreaterThan(0);

    // The seeded page carries the golden skeleton with real node ids.
    const seeded = result.pages.find((entry) => entry.path === "/");
    expect(seeded).toBeDefined();
    expect(seeded?.seeded).toBe(true);
    expect(seeded?.sections.map((section) => section.type)).toEqual([
      "hero",
      "content",
      "cta",
    ]);
    expect(seeded?.sections.every((section) => section.nodeId !== "")).toBe(true);

    // The theme of the copy really changed; the original stays untouched.
    const copyTheme = await env.api.request<{ theme: { scales: Record<string, unknown> } }>({
      method: "GET",
      path: `/api/sites/${result.siteId}/theme`,
    });
    expect(copyTheme.status).toBe(200);
    const originalTheme = await env.api.request<{ theme: { scales: Record<string, unknown> } }>({
      method: "GET",
      path: `/api/sites/${originalSiteId}/theme`,
    });
    expect(originalTheme.status).toBe(200);
    expect(JSON.stringify(copyTheme.body.theme.scales)).not.toEqual(
      JSON.stringify(originalTheme.body.theme.scales),
    );

    // The original page kept its empty draft (nothing wrote to the source).
    const originalPage = await env.api.request<{ draft: { nodes: Record<string, unknown> } }>({
      method: "GET",
      path: `/api/pages/${pageId}`,
    });
    const root = originalPage.body.draft;
    expect(Object.keys(root.nodes).length).toBe(1);

    // The design record is in the audit log.
    const audit = await env.api.request<{
      entries: { mutation: string; params: Record<string, unknown> }[];
    }>({ method: "GET", path: `/api/sites/${result.siteId}/audit?limit=50` });
    const record = audit.body.entries.find(
      (entry) => entry.mutation === "apply_redesign",
    );
    expect(record).toBeDefined();
    expect(
      (record?.params.references as { referenceId: string }[] | undefined)?.[0]?.referenceId,
    ).toBe(referenceId);
  }, 60000);

  it("rebuilds one page in place when pageId is given", async () => {
    const result = await applyRedesign({
      store: env.engine.store,
      registry: env.registry,
      siteId: originalSiteId,
      referenceIds: [referenceId],
      pageId,
      author: TEST_AUTHOR,
    });
    expect(result.duplicated).toBe(false);
    expect(result.siteId).toBe(originalSiteId);
    const rebuilt = result.pages.find((entry) => entry.pageId === pageId);
    expect(rebuilt).toBeDefined();
    expect(rebuilt?.sections.map((section) => section.type)).toEqual([
      "hero",
      "content",
      "cta",
    ]);

    // The original page now carries the skeleton in its draft.
    const page = await env.api.request<{ draftVersion: number }>({
      method: "GET",
      path: `/api/pages/${pageId}`,
    });
    expect(page.body.draftVersion).toBeGreaterThan(1);
  }, 60000);

  it("returns existing pages without rebuilding them and replays a keyed apply", async () => {
    const sourceSiteId = (await createTestSite(env.api, "Bestehende Seite")).id;
    const existingPage = await createTestPage(env.api, sourceSiteId, {
      title: "Bestehend",
      path: "/",
    });
    const rootNodeId = existingPage.draft.rootNodeId;
    await env.api.request({
      method: "POST",
      path: `/api/pages/${existingPage.id}/mutations`,
      body: {
        baseDraftVersion: existingPage.draftVersion,
        author: TEST_AUTHOR,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: rootNodeId },
            node: { type: "hero", props: { headline: "Bleibt bestehen" } },
          },
        ],
      },
    });
    const before = await env.api.request<{ draft: { nodes: Record<string, unknown> } }>({
      method: "GET",
      path: `/api/pages/${existingPage.id}`,
    });
    const key = "redesign-existing-page-1";
    const body = { referenceIds: [referenceId], idempotencyKey: key };

    const first = await env.api.request<{
      siteId: string;
      pages: { pageId: string; seeded: boolean; draftVersion: number; sections: unknown[] }[];
    }>({
      method: "POST",
      path: `/api/sites/${sourceSiteId}/redesign`,
      body,
    });
    expect(first.status).toBe(201);
    const returned = first.body.pages.find((entry) => entry.pageId !== existingPage.id && entry.seeded === false);
    expect(returned).toBeDefined();
    expect(returned?.sections).toEqual([]);

    const after = await env.api.request<{ draft: { nodes: Record<string, unknown> } }>({
      method: "GET",
      path: `/api/pages/${returned?.pageId}`,
    });
    expect(after.body.draft).toEqual(before.body.draft);

    const retry = await env.api.request<{ siteId: string; pages: { pageId: string }[] }>({
      method: "POST",
      path: `/api/sites/${sourceSiteId}/redesign`,
      body,
    });
    expect(retry.status).toBe(201);
    expect(retry.body.siteId).toBe(first.body.siteId);
    expect(retry.body.pages.map((entry) => entry.pageId)).toEqual(
      first.body.pages.map((entry) => entry.pageId),
    );
    expect(retry.headers["idempotency-replayed"]).toBe("true");

    const sites = await env.api.request<{ sites: { id: string }[] }>({
      method: "GET",
      path: "/api/sites",
    });
    expect(sites.body.sites.filter((entry) => entry.id === first.body.siteId)).toHaveLength(1);

    const mismatch = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${sourceSiteId}/redesign`,
      body: { ...body, withContent: false },
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.field).toBe("idempotencyKey");

    const wrongSite = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${sourceSiteId}/redesign`,
      body: { siteId: "site_fremd", referenceIds: [referenceId] },
    });
    expect(wrongSite.status).toBe(400);
    expect(wrongSite.body.error.field).toBe("siteId");
  }, 60000);

  it("serves the stored site theme as bake-compatible CSS", async () => {
    const stored = await env.api.request<{ version: number; css: string }>({
      method: "GET",
      path: `/api/sites/${originalSiteId}/theme`,
    });
    expect(stored.status).toBe(200);
    const css = await fetch(`${env.server.origin}/api/sites/${originalSiteId}/theme.css`, {
      headers: { authorization: `Bearer ${env.token}` },
    });
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(css.headers.get("cache-control")).toBe("no-store");
    expect(css.headers.get("x-senify-theme-version")).toBe(String(stored.body.version));
    expect(await css.text()).toBe(stored.body.css);
  });

  it("rejects unknown references and missing profiles with clear causes", async () => {
    const unknown = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${originalSiteId}/redesign`,
      body: { referenceIds: ["ref_gibt_es_nicht"] },
    });
    expect(unknown.status).toBe(404);

    // A profile-less manual reference (image only) is a conflict.
    const bare = await env.api.request<{ reference: { id: string } }>({
      method: "POST",
      path: "/api/references/manual",
      body: { name: "Nur Bild", image: pngImage(800, 600), author: TEST_AUTHOR },
    });
    expect(bare.status).toBe(201);
    const conflict = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${originalSiteId}/redesign`,
      body: { referenceIds: [bare.body.reference.id] },
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.category).toBe("conflict");

    const foreignPage = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${originalSiteId}/redesign`,
      body: { referenceIds: [referenceId], pageId: "page_fremd" },
    });
    expect(foreignPage.status).toBe(404);
  }, 30000);

  it("applies a collection as the reference set (E25 slice 3, R13)", async () => {
    // A collection with two ready references; the oldest leads.
    const created = await env.api.request<{ collection: { id: string } }>({
      method: "POST",
      path: "/api/reference-collections",
      body: {
        name: "Terminal Sets",
        description: "Set-Semantik-Test",
      },
    });
    expect(created.status).toBe(201);
    const collectionId = created.body.collection.id;
    const second = await env.api.request<{ reference: { id: string } }>({
      method: "POST",
      path: "/api/references/manual",
      body: {
        name: "Terminal Studio Zwei",
        documents: { design: DESIGN_DOC, guidelines: null, components: null },
        image: pngImage(1920, 1080),
        collectionId,
        author: TEST_AUTHOR,
      },
    });
    expect(second.status).toBe(201);
    const assigned = await env.api.request<{ reference: { id: string } }>({
      method: "PATCH",
      path: `/api/references/${referenceId}`,
      body: { collectionId },
    });
    expect(assigned.status).toBe(200);

    const result = await applyRedesign({
      store: env.engine.store,
      registry: env.registry,
      siteId: originalSiteId,
      collectionId,
      author: TEST_AUTHOR,
    });
    expect(result.record.referenceIds).toEqual([referenceId, second.body.reference.id]);

    // referenceIds and collectionId are mutually exclusive.
    const both = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${originalSiteId}/redesign`,
      body: { referenceIds: [referenceId], collectionId },
    });
    expect(both.status).toBe(400);

    // An empty collection is a conflict, not a silent no-op.
    const empty = await env.api.request<{ collection: { id: string } }>({
      method: "POST",
      path: "/api/reference-collections",
      body: { name: "Leere Sammlung" },
    });
    expect(empty.status).toBe(201);
    const conflict = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${originalSiteId}/redesign`,
      body: { collectionId: empty.body.collection.id },
    });
    expect(conflict.status).toBe(409);
  }, 60000);
});
