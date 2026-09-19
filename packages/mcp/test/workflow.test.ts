import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, EngineClient, type ToolContext } from "@senify/mcp";
import {
  bootMcpEnv,
  createSite,
  createToken,
  type McpTestEnv,
} from "./helpers.ts";

type Json = Record<string, unknown>;

// Header-only PNG: the engine reads width/height from the IHDR chunk.
function pngBytes(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

const OPERATOR = { kind: "human", id: "operator", label: "Operator" } as const;

type McpSession = {
  client: Client;
  close(): Promise<void>;
};

async function connect(origin: string, token: string): Promise<McpSession> {
  const context: ToolContext = {
    client: new EngineClient({ apiUrl: origin, token }),
  };
  const server = createMcpServer({ context, onError: () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "senify-tests", version: "0.0.0" });
  await client.connect(clientTransport);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

async function call(
  session: McpSession,
  name: string,
  args: Json = {},
): Promise<{ ok: boolean; data: Json }> {
  const result = await session.client.callTool({ name, arguments: args });
  const first = (result.content as { type: string; text?: string }[])[0];
  return {
    ok: result.isError !== true,
    data: JSON.parse(first?.text ?? "{}") as Json,
  };
}

describe("mcp workflow (Prüfstelle 3)", () => {
  let env: McpTestEnv;
  let session: McpSession;

  beforeAll(async () => {
    env = await bootMcpEnv();
    session = await connect(env.origin, env.token);
  });

  afterAll(async () => {
    await session.close();
    await env.close();
  });

  it("declares the full tool catalog with JSON schemas", async () => {
    const listed = await session.client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toEqual([
      "whoami",
      "list_sites",
      "get_site",
      "list_pages",
      "get_page",
      "get_nodes",
      "list_sections",
      "get_section",
      "get_theme",
      "search_docs",
      "read_docs",
      "apply_mutations",
      "set_motion",
      "clear_motion",
      "create_page",
      "update_theme",
      "create_preview",
      "submit_for_review",
      "get_review_feedback",
      "publish_release",
      "rollback_release",
      "restore_revision",
      "delete_page",
      "list_assets",
      "upload_asset",
      "update_asset",
      "replace_asset",
      "delete_asset",
      "restore_asset",
      "list_collections",
      "get_collection",
      "list_entries",
      "get_entry",
      "create_entry",
      "update_entry",
      "publish_entry",
      "delete_entry",
      "restore_entry",
      "restore_entry_version",
      "search_entries",
      "list_submissions",
      "analyze_reference",
      "list_references",
      "get_reference",
      "apply_reference",
      "list_reference_collections",
      "create_reference_collection",
      "assign_reference_to_collection",
      "get_reference_brief",
    ]);
    for (const tool of listed.tools) {
      expect(tool.description?.length ?? 0).toBeGreaterThan(30);
      expect((tool.inputSchema as { type?: string }).type).toBe("object");
    }
    const applyTool = listed.tools.find((tool) => tool.name === "apply_mutations");
    expect(applyTool?.annotations?.readOnlyHint).toBe(false);
    const readTool = listed.tools.find((tool) => tool.name === "get_page");
    expect(readTool?.annotations?.readOnlyHint).toBe(true);
  });

  it("sets the full annotation matrix (E4 slice 0)", async () => {
    const listed = await session.client.listTools();
    const byName = new Map(listed.tools.map((tool) => [tool.name, tool]));
    for (const tool of listed.tools) {
      // Every hint is explicit; the MCP defaults are pessimistic.
      expect(typeof tool.annotations?.readOnlyHint).toBe("boolean");
      expect(typeof tool.annotations?.destructiveHint).toBe("boolean");
      expect(typeof tool.annotations?.idempotentHint).toBe("boolean");
      expect(typeof tool.annotations?.openWorldHint).toBe("boolean");
      // Read tools are never destructive.
      if (tool.annotations?.readOnlyHint === true) {
        expect(tool.annotations?.destructiveHint).toBe(false);
      }
    }
    // Destructive only where state is removed or overwritten.
    expect(byName.get("delete_page")?.annotations?.destructiveHint).toBe(true);
    expect(byName.get("rollback_release")?.annotations?.destructiveHint).toBe(true);
    expect(byName.get("create_page")?.annotations?.destructiveHint).toBe(false);
    expect(byName.get("upload_asset")?.annotations?.destructiveHint).toBe(false);
    // Open world only for the web capture.
    expect(byName.get("analyze_reference")?.annotations?.openWorldHint).toBe(true);
    expect(byName.get("list_sites")?.annotations?.openWorldHint).toBe(false);
    expect(byName.get("apply_mutations")?.annotations?.openWorldHint).toBe(false);
    // Idempotency mirrors the server-side semantics.
    expect(byName.get("update_theme")?.annotations?.idempotentHint).toBe(true);
    expect(byName.get("create_page")?.annotations?.idempotentHint).toBe(false);
    expect(byName.get("apply_mutations")?.annotations?.idempotentHint).toBe(false);
    // The create tools accept the opt-in key (ticket 18, slice 2); without it
    // the call stays non-idempotent, so the hint remains false.
    for (const name of [
      "create_page",
      "create_entry",
      "upload_asset",
      "create_reference_collection",
    ]) {
      const schema = byName.get(name)?.inputSchema as {
        properties?: Record<string, unknown>;
      };
      expect(schema.properties?.idempotencyKey).toBeDefined();
    }
  });

  it("serves the documentation tools", async () => {
    const search = await call(session, "search_docs", {
      query: "apply_mutations baseDraftVersion",
    });
    expect(search.ok).toBe(true);
    const hits = search.data.results as { path: string; title: string }[];
    expect(hits.some((hit) => hit.path === "/reference/tools")).toBe(true);

    const page = await call(session, "read_docs", { path: "/reference/tools" });
    expect(page.ok).toBe(true);
    expect(page.data.markdown as string).toContain("# Tools");

    const missing = await call(session, "read_docs", { path: "/nope" });
    expect(missing.ok).toBe(false);
    expect((missing.data.error as { category: string }).category).toBe(
      "not_found",
    );
  });

  it("runs create page → insert section → inspect over the MCP client", async () => {
    const siteId = await createSite(env, "MCP Workflow");

    const who = await call(session, "whoami");
    expect(who.ok).toBe(true);
    expect(who.data.name).toBe("mcp-tests");
    expect(who.data.scopes).toEqual(["read", "write", "publish"]);

    const sites = await call(session, "list_sites");
    const siteIds = (sites.data.sites as { id: string }[]).map((site) => site.id);
    expect(siteIds).toContain(siteId);

    const hero = await call(session, "get_section", { type: "hero" });
    expect(hero.ok).toBe(true);
    expect(hero.data.type).toBe("hero");
    const heroProps = hero.data.goldenProps as Json;
    expect(typeof heroProps.headline).toBe("string");

    const created = await call(session, "create_page", {
      siteId,
      title: "Start",
    });
    expect(created.ok).toBe(true);
    const pageId = created.data.id as string;
    expect(created.data.path).toBe("/");
    const rootNodeId = (created.data.draft as { rootNodeId: string }).rootNodeId;
    expect(typeof rootNodeId).toBe("string");

    const empty = await call(session, "get_page", { pageId });
    expect(empty.data.draftVersion).toBe(1);
    expect(empty.data.sections).toEqual([]);

    const dry = await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: 1,
      dry_run: true,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: { type: "hero", props: { headline: "Hallo Welt" } },
        },
      ],
    });
    expect(dry.ok).toBe(true);
    expect(dry.data.newDraftVersion).toBe(1);
    expect(dry.data.undoBatchId).toBeNull();

    const inserted = await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: 1,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: {
            type: "hero",
            variant: "centered",
            props: { headline: "Hallo Welt" },
          },
        },
      ],
    });
    expect(inserted.ok).toBe(true);
    expect(inserted.data.newDraftVersion).toBe(2);
    expect(inserted.data.warnings).toEqual([]);

    const outline = await call(session, "get_page", { pageId });
    expect(outline.data.draftVersion).toBe(2);
    const sections = outline.data.sections as {
      id: string;
      type: string;
      variant?: string;
      summary: string;
    }[];
    expect(sections).toHaveLength(1);
    expect(sections[0]?.type).toBe("hero");
    expect(sections[0]?.variant).toBe("centered");
    expect(sections[0]?.summary).toContain("headline: Hallo Welt");
    const nodeId = sections[0]?.id as string;
    expect(typeof nodeId).toBe("string");

    const nodes = await call(session, "get_nodes", { pageId, nodeIds: [nodeId] });
    const full = (nodes.data.nodes as { props: Json }[])[0];
    expect(full?.props.headline).toBe("Hallo Welt");

    const updated = await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: 2,
      mutations: [
        { op: "updateNodeProps", id: nodeId, patch: { headline: "Hallo Senify" } },
      ],
    });
    expect(updated.ok).toBe(true);
    expect(updated.data.newDraftVersion).toBe(3);

    const stale = await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: 2,
      mutations: [{ op: "deleteNode", id: nodeId }],
    });
    expect(stale.ok).toBe(false);
    const staleError = stale.data.error as Json;
    expect(staleError.category).toBe("conflict");
    expect(String(staleError.suggestion).toLowerCase()).toContain("reload");
  });

  it("blocks write tools for read-only tokens with an actionable error", async () => {
    const siteId = await createSite(env, "Read Only");
    const readOnly = await createToken(env, "read-only", ["read"]);
    const reader = await connect(env.origin, readOnly);
    try {
      const page = await call(reader, "create_page", { siteId, title: "Nope" });
      expect(page.ok).toBe(false);
      const error = page.data.error as Json;
      expect(error.category).toBe("auth");
      expect(String(error.suggestion)).toContain("write");
    } finally {
      await reader.close();
    }
  });

  it("passes an idempotency key through create_page and reuses the first result", async () => {
    const siteId = await createSite(env, "MCP Idempotenz");
    const first = await call(session, "create_page", {
      siteId,
      title: "Einmalig",
      idempotencyKey: "mcp-key-1",
    });
    expect(first.ok).toBe(true);

    const retry = await call(session, "create_page", {
      siteId,
      title: "Einmalig",
      idempotencyKey: "mcp-key-1",
    });
    expect(retry.ok).toBe(true);
    expect(retry.data.id).toBe(first.data.id);

    const pages = await call(session, "list_pages", { siteId });
    const ids = (pages.data.pages as { id: string }[]).map((page) => page.id);
    expect(ids.filter((id) => id === first.data.id)).toHaveLength(1);
  });

  it("runs the review loop: publish → submit → request changes → fix → approve", async () => {
    const siteId = await createSite(env, "Review Loop");
    const created = await call(session, "create_page", { siteId, title: "Start" });
    expect(created.ok).toBe(true);
    const pageId = created.data.id as string;
    const rootNodeId = (created.data.draft as { rootNodeId: string }).rootNodeId;

    const inserted = await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: 1,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: { id: "hero-0001", type: "hero", props: { headline: "V1" } },
        },
      ],
    });
    expect(inserted.ok).toBe(true);

    const published = await call(session, "publish_release", { siteId, note: "Basis" });
    expect(published.ok).toBe(true);
    const release = published.data.release as {
      id: string;
      pageRevisions: { pageId: string; revisionId: string }[];
    };
    expect(release.pageRevisions).toHaveLength(1);

    const version = (await call(session, "get_page", { pageId })).data
      .draftVersion as number;
    await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: version,
      mutations: [
        { op: "updateNodeProps", id: "hero-0001", patch: { headline: "V2" } },
      ],
    });
    const submitted = await call(session, "submit_for_review", {
      siteId,
      note: "Bitte prüfen",
    });
    expect(submitted.ok).toBe(true);
    const reviewId = (submitted.data.review as { id: string }).id;
    const preview = submitted.data.preview as { id: string; token: string };
    expect(preview.token.length).toBeGreaterThan(10);

    const requested = await env.api.request({
      method: "POST",
      path: `/api/reviews/${reviewId}/request-changes`,
      body: { author: OPERATOR, note: "Kürzer bitte" },
    });
    expect(requested.status).toBe(200);

    const feedback = await call(session, "get_review_feedback", { reviewId });
    expect(feedback.ok).toBe(true);
    expect(feedback.data.status).toBe("changes_requested");
    const thread = feedback.data.thread as { note: string }[];
    expect(thread.at(-1)?.note).toBe("Kürzer bitte");

    const version2 = (await call(session, "get_page", { pageId })).data
      .draftVersion as number;
    await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: version2,
      mutations: [
        { op: "updateNodeProps", id: "hero-0001", patch: { headline: "Kurz" } },
      ],
    });
    const approved = await env.api.request<{
      review: { status: string };
      release: { id: string };
    }>({
      method: "POST",
      path: `/api/reviews/${reviewId}/approve`,
      body: { author: OPERATOR, note: "Passt" },
    });
    expect(approved.status).toBe(200);
    expect(approved.body.review.status).toBe("approved");

    const rollback = await call(session, "rollback_release", {
      siteId,
      releaseId: release.id,
      note: "zurück",
    });
    expect(rollback.ok).toBe(true);
    expect(
      (rollback.data.release as { basisReleaseId: string }).basisReleaseId,
    ).toBe(release.id);

    const restored = await call(session, "restore_revision", {
      pageId: release.pageRevisions[0]?.pageId,
      revisionId: release.pageRevisions[0]?.revisionId,
    });
    expect(restored.ok).toBe(true);
    const outline = await call(session, "get_page", { pageId });
    expect(JSON.stringify(outline.data)).toContain("V1");
  }, 180000);

  it("runs the media library: upload → update → replace → trash → restore", async () => {
    const siteId = await createSite(env, "Media Library");
    const dir = mkdtempSync(join(tmpdir(), "senify-mcp-media-"));
    const filePath = join(dir, "motiv.png");
    const replacementPath = join(dir, "motiv-neu.png");
    writeFileSync(filePath, pngBytes(320, 200));
    writeFileSync(replacementPath, pngBytes(640, 400));
    try {
      const uploaded = await call(session, "upload_asset", {
        siteId,
        filePath,
        altText: "Werkstatt am Morgen",
      });
      expect(uploaded.ok).toBe(true);
      const upload = uploaded.data as {
        asset: { id: string; width: number | null; height: number | null };
        deduped: boolean;
      };
      expect(upload.deduped).toBe(false);
      expect(upload.asset.width).toBe(320);
      const assetId = upload.asset.id;

      const updated = await call(session, "update_asset", {
        assetId,
        altText: "Werkstatt innen",
        tags: ["hero"],
      });
      expect(updated.ok).toBe(true);
      expect(updated.data.altText).toBe("Werkstatt innen");
      expect(updated.data.tags).toEqual(["hero"]);

      const listed = await call(session, "list_assets", { siteId, tag: "hero" });
      expect(
        (listed.data.assets as { id: string }[]).map((asset) => asset.id),
      ).toEqual([assetId]);

      const replaced = await call(session, "replace_asset", {
        assetId,
        filePath: replacementPath,
      });
      expect(replaced.ok).toBe(true);
      const replacement = replaced.data.asset as { id: string; height: number | null };
      expect(replacement.id).toBe(assetId);
      expect(replacement.height).toBe(400);

      const trashed = await call(session, "delete_asset", { assetId });
      expect(trashed.ok).toBe(true);
      const trashList = await call(session, "list_assets", {
        siteId,
        status: "trashed",
      });
      expect(
        (trashList.data.assets as { id: string }[]).map((asset) => asset.id),
      ).toEqual([assetId]);

      const restored = await call(session, "restore_asset", { assetId });
      expect(restored.ok).toBe(true);
      expect(restored.data.status).toBe("ready");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);

  it("runs the content workflow: collection → entry → publish → search", async () => {
    const siteId = await createSite(env, "Content Workflow");
    // The schema is the operator's side: create_collection is not an agent
    // tool in v1 (review-pflichtig), so the test creates it via the API.
    const collection = await env.api.request<{
      id: string;
      fields: { id: string; description: string }[];
      supports: string[];
    }>({
      method: "POST",
      path: `/api/sites/${siteId}/collections`,
      body: {
        name: "Beiträge",
        slug: "beitraege",
        fields: [
          {
            id: "body",
            key: "body",
            label: "Inhalt",
            type: "richtext",
            description: "Markdown-Body des Beitrags (Suchgewicht C).",
          },
        ],
      },
    });
    expect(collection.status).toBe(201);
    const collectionId = collection.body.id;
    expect(collection.body.supports).toContain("scheduling");

    const listedCollections = await call(session, "list_collections", { siteId });
    expect(listedCollections.ok).toBe(true);
    const collections = listedCollections.data.collections as { id: string }[];
    expect(collections.map((item) => item.id)).toEqual([collectionId]);

    const schema = await call(session, "get_collection", { collectionId });
    expect(schema.ok).toBe(true);
    // The built-in title field is always there and agent-readable.
    const fields = schema.data.fields as { id: string; description: string }[];
    expect(fields.map((field) => field.id)).toEqual(["title", "body"]);
    expect(fields.every((field) => field.description.length > 10)).toBe(true);

    const created = await call(session, "create_entry", {
      siteId,
      collectionId,
      cells: { title: "Erster Beitrag", body: "Ein Text über Senify." },
    });
    expect(created.ok).toBe(true);
    const entryId = created.data.id as string;
    expect(created.data.status).toBe("draft");
    expect(created.data.slug).toBe("erster-beitrag");
    expect(created.data.version).toBe(1);

    const updated = await call(session, "update_entry", {
      entryId,
      baseVersion: 1,
      cells: { body: "Ein längerer Text über Senify." },
    });
    expect(updated.ok).toBe(true);
    expect(updated.data.version).toBe(2);
    expect((updated.data.cells as Json).title).toBe("Erster Beitrag");

    const stale = await call(session, "update_entry", {
      entryId,
      baseVersion: 1,
      cells: { title: "Zurückgesetzt" },
    });
    expect(stale.ok).toBe(false);
    const staleError = stale.data.error as Json;
    expect(staleError.category).toBe("conflict");
    expect(String(staleError.suggestion).toLowerCase()).toContain("reload");

    // Autosave-style writes never create versions; the publish does.
    const versionsBefore = await env.api.request<{ versions: unknown[] }>({
      method: "GET",
      path: `/api/entries/${entryId}/versions`,
    });
    expect(versionsBefore.body.versions).toEqual([]);

    const published = await call(session, "publish_entry", {
      entryId,
      baseVersion: 2,
    });
    expect(published.ok).toBe(true);
    expect(published.data.entry).toMatchObject({
      id: entryId,
      status: "published",
    });
    expect(
      (published.data.version as { versionNumber: number }).versionNumber,
    ).toBe(1);
    expect((published.data.rebake as Json).queued).toBe(true);

    const search = await call(session, "search_entries", {
      siteId,
      q: "Erster",
    });
    expect(search.ok).toBe(true);
    const hits = search.data.results as {
      entry: { id: string };
      score: number;
    }[];
    expect(hits[0]?.entry.id).toBe(entryId);
    expect(hits[0]?.score).toBeGreaterThan(0);

    const publishedList = await call(session, "list_entries", {
      siteId,
      status: "published",
    });
    expect(
      (publishedList.data.entries as { id: string }[]).map((entry) => entry.id),
    ).toEqual([entryId]);

    const trashed = await call(session, "delete_entry", { entryId });
    expect(trashed.ok).toBe(true);
    const trashList = await call(session, "list_entries", {
      siteId,
      trashed: true,
    });
    expect(
      (trashList.data.entries as { id: string }[]).map((entry) => entry.id),
    ).toEqual([entryId]);

    const restored = await call(session, "restore_entry", { entryId });
    expect(restored.ok).toBe(true);
    expect(restored.data.deletedAt).toBeNull();

    const versions = await env.api.request<{ versions: { id: string }[] }>({
      method: "GET",
      path: `/api/entries/${entryId}/versions`,
    });
    // Autosave-style edits never create versions: the publish made exactly one.
    expect(versions.body.versions).toHaveLength(1);

    const current = await call(session, "get_entry", { entryId });
    const draftEdit = await call(session, "update_entry", {
      entryId,
      baseVersion: current.data.version as number,
      cells: { body: "Nur im Draft." },
    });
    expect(draftEdit.ok).toBe(true);

    // Restoring the published version brings its cells back into the draft.
    const restoredVersion = await call(session, "restore_entry_version", {
      entryId,
      versionId: versions.body.versions[0]?.id,
    });
    expect(restoredVersion.ok).toBe(true);
    expect((restoredVersion.data.cells as Json).body).toBe(
      "Ein längerer Text über Senify.",
    );
  }, 60000);

  it("lists submissions over the entry-based inbox view", async () => {
    const siteId = await createSite(env, "Submissions");
    const collection = await env.api.request<{
      id: string;
      fields: { id: string; key: string }[];
    }>({
      method: "POST",
      path: `/api/sites/${siteId}/collections/from-fields`,
      body: {
        name: "Kontaktanfragen",
        supports: ["search"],
        fields: [
          { key: "name", label: "Name", type: "text", description: "Name." },
          { key: "email", label: "E-Mail", type: "email", description: "Adresse." },
        ],
      },
    });
    expect(collection.status).toBe(201);
    const collectionId = collection.body.id;
    // Cells are keyed by field id; the collection route derives ids and keys.
    const fieldId = (key: string): string =>
      collection.body.fields.find((field) => field.key === key)?.id ?? "";

    const created = await call(session, "create_entry", {
      siteId,
      collectionId,
      cells: {
        title: "Anfrage",
        [fieldId("name")]: "Anna Beispiel",
        [fieldId("email")]: "anna@beispiel.de",
      },
    });
    expect(created.ok).toBe(true);

    const submissions = await call(session, "list_submissions", {
      siteId,
      collectionId,
    });
    expect(submissions.ok).toBe(true);
    const columns = submissions.data.columns as { key: string; label: string }[];
    expect(columns.map((column) => column.key)).toContain("email");
    const rows = submissions.data.rows as {
      entryId: string;
      values: { key: string; value: string }[];
    }[];
    expect(rows).toHaveLength(1);
    expect(
      rows[0]?.values.find((value) => value.key === "email")?.value,
    ).toBe("anna@beispiel.de");
    // The same data stays reachable through the entry tools.
    const entries = await call(session, "list_entries", { siteId, collectionId });
    expect((entries.data.entries as { id: string }[]).map((entry) => entry.id)).toContain(
      rows[0]?.entryId,
    );
  }, 30000);

  it("runs the reference → profile → theme draft workflow", async () => {
    const siteId = await createSite(env, "Referenz-Workflow");
    // Deterministic snapshot fallback (research/29 §2): no browser, no network.
    const snapshot = {
      html: `<style>
        body { background: #0b0b0f; color: #f5f5f7; font-family: 'Inter', sans-serif; font-size: 17px; line-height: 1.6; font-weight: 400 }
        h1 { font-family: 'Sora', sans-serif; font-size: 64px; line-height: 1.05; font-weight: 700 }
        h2 { font-family: 'Sora', sans-serif; font-size: 40px; line-height: 1.15; font-weight: 600 }
        .btn { background: #7c5cff; border-radius: 999px }
        a { color: #7c5cff }
        @media (min-width: 1024px) { body { font-size: 18px } }
      </style>
      <nav><a href="/" class="btn">Kontakt</a></nav>
      <section class="hero"><h1>Studio Nord</h1></section>`,
      breakpoints: [1440, 810, 390],
      computedSamples: [
        {
          breakpoint: "desktop",
          kind: "color",
          role: "icon",
          value: "#7c5cff",
          where: ".btn",
          source: "runtime",
        },
        {
          breakpoint: "desktop",
          kind: "color",
          role: "bg",
          value: "#0b0b0f",
          where: "body",
          source: "runtime",
        },
      ],
    };

    const analyzed = await call(session, "analyze_reference", {
      url: "https://studio-nord.test",
      name: "Studio Nord",
      snapshot,
    });
    expect(analyzed.ok).toBe(true);
    const reference = analyzed.data.reference as {
      id: string;
      status: string;
      revision: number;
      profile: { reduced: boolean; motion: { preset: string | null }[] };
    };
    expect(reference.status).toBe("ready");
    expect(reference.revision).toBe(1);
    expect(reference.profile.reduced).toBe(true);
    const referenceId = reference.id;

    const listed = await call(session, "list_references", {
      q: "studio",
      status: "ready",
    });
    expect(listed.ok).toBe(true);
    expect(
      (listed.data.references as { id: string }[]).map((entry) => entry.id),
    ).toContain(referenceId);

    const fetched = await call(session, "get_reference", { referenceId });
    expect(fetched.ok).toBe(true);
    expect(fetched.data.styleBrief as string).toContain(
      "https://studio-nord.test",
    );
    expect(
      reference.profile.motion.every(
        (recipe) => typeof recipe.preset === "string" || recipe.preset === null,
      ),
    ).toBe(true);

    const applied = await call(session, "apply_reference", {
      siteId,
      referenceId,
    });
    expect(applied.ok).toBe(true);
    const draft = applied.data.draft as {
      scales: { brand?: string; typeBase?: number };
      fonts: { body?: { family: string } };
    };
    expect(draft.scales.brand).toBe("#7c5cff");
    expect(draft.scales.typeBase).toBe(17);
    expect(draft.fonts.body?.family).toBe("Inter");
    expect((applied.data.verification as { ok: boolean }).ok).toBe(true);
    // Assigning a reference derives a draft, it never touches the bake.
    expect((applied.data.unchanged as { unchanged: boolean }).unchanged).toBe(
      true,
    );
  }, 30000);

  it("requires the write scope for analyze/apply and allows read-only listing", async () => {
    const readOnly = await createToken(env, "ref-reader", ["read"]);
    const reader = await connect(env.origin, readOnly);
    try {
      const denied = await call(reader, "analyze_reference", {
        url: "https://blocked.test",
      });
      expect(denied.ok).toBe(false);
      const error = denied.data.error as Json;
      expect(error.category).toBe("auth");
      expect(String(error.suggestion)).toContain("write");

      const listed = await call(reader, "list_references", {});
      expect(listed.ok).toBe(true);
      expect(Array.isArray(listed.data.references)).toBe(true);

      // The collection tools follow the same rule: read is open, write is not.
      const collections = await call(reader, "list_reference_collections", {});
      expect(collections.ok).toBe(true);
      expect(Array.isArray(collections.data.collections)).toBe(true);

      const deniedCreate = await call(reader, "create_reference_collection", {
        name: "Kein Schreibrecht",
      });
      expect(deniedCreate.ok).toBe(false);
      expect((deniedCreate.data.error as Json).category).toBe("auth");
    } finally {
      await reader.close();
    }
  }, 30000);

  it("runs the collection, assignment and brief workflow", async () => {
    const listed = await call(session, "list_reference_collections", {});
    expect(listed.ok).toBe(true);
    const catalog = listed.data.styleCatalog as { total: number; license: string };
    // The style guide ships with the 18 families of the reference library.
    expect(catalog.total).toBe(18);
    expect(catalog.license).toContain("MIT");

    const created = await call(session, "create_reference_collection", {
      name: "Editorial Studio",
      description: "A different point of view. Saved for the right project.",
      deployFor: "Portfolios and studio sites",
      vocabulary: ["restraint", "tight tracking", "muted accent"],
      risk: "A direction to explore: get too quiet and it reads as unfinished.",
      accent: "#6346d7",
      imageStyle: "Editorial portrait of [SUBJECT], soft neutral ground.",
    });
    expect(created.ok).toBe(true);
    const collection = created.data.collection as {
      id: string;
      kind: string;
      referenceCount: number;
      vocabulary: string[];
    };
    expect(collection.kind).toBe("collection");
    expect(collection.referenceCount).toBe(0);
    const collectionId = collection.id;

    // A style family is the same record with kind=style (the style guide).
    const style = await call(session, "create_reference_collection", {
      name: "Neo Brutalism",
      kind: "style",
      recognize: ["raw edges", "loud type"],
    });
    expect(style.ok).toBe(true);
    const styleId = (style.data.collection as { id: string }).id;

    const analyzed = await call(session, "analyze_reference", {
      url: "https://collection-workflow.test",
      name: "Collection Workflow",
      snapshot: {
        html: `<style>
          body { background: #f6f5f9; color: #292333; font-family: 'Inter', sans-serif; font-size: 17px }
          h1 { font-size: 56px; line-height: 1.05; font-weight: 700 }
        </style>
        <section class="hero"><h1>Collection Workflow</h1></section>`,
      },
    });
    expect(analyzed.ok).toBe(true);
    const referenceId = (analyzed.data.reference as { id: string }).id;

    const assigned = await call(session, "assign_reference_to_collection", {
      referenceId,
      collectionId,
    });
    expect(assigned.ok).toBe(true);
    const reference = assigned.data.reference as {
      collectionId: string | null;
      collection: { name: string } | null;
    };
    expect(reference.collectionId).toBe(collectionId);
    expect(reference.collection?.name).toBe("Editorial Studio");

    // The counter of the sidebar and the collection filter see the assignment.
    const withCount = await call(session, "list_reference_collections", {
      kind: "collection",
    });
    const counted = (
      withCount.data.collections as { id: string; referenceCount: number }[]
    ).find((entry) => entry.id === collectionId);
    expect(counted?.referenceCount).toBe(1);

    const filtered = await call(session, "list_references", {
      collection: collectionId,
      sort: "name",
    });
    expect(
      (filtered.data.references as { id: string }[]).map((entry) => entry.id),
    ).toEqual([referenceId]);
    expect((filtered.data.footer as { inView: number }).inView).toBe(1);

    // The single brief carries the collection as the aesthetic fallback.
    const single = await call(session, "get_reference_brief", { referenceId });
    expect(single.ok).toBe(true);
    const singleBrief = single.data.brief as { kind: string; text: string; status: string };
    expect(singleBrief.kind).toBe("reference");
    expect(singleBrief.text).toContain("Reference: Collection Workflow");
    // The collection travels with the brief (the analysed family leads it).
    expect(singleBrief.text).toMatch(/Aesthetic: .*Editorial Studio/);
    // Without an own recipe the collection image direction steps in.
    expect(singleBrief.text).toContain(
      "Image recipe: Editorial portrait of [SUBJECT], soft neutral ground.",
    );
    // Default: the House DNA is off, so the status line says so.
    expect(singleBrief.status).toBe("Reference-led brief · House DNA is off.");

    // Several references become a reference set, not a blend.
    const combined = await call(session, "get_reference_brief", {
      referenceIds: [referenceId],
    });
    expect(combined.ok).toBe(true);
    expect(
      (combined.data.brief as { referenceIds: string[] }).referenceIds,
    ).toEqual([referenceId]);

    const collectionBrief = await call(session, "get_reference_brief", {
      collectionId,
    });
    expect(collectionBrief.ok).toBe(true);
    expect((collectionBrief.data.brief as { kind: string }).kind).toBe("collection");
    expect(collectionBrief.data.vocabulary).toBe(
      "restraint, tight tracking, muted accent",
    );

    const styleBrief = await call(session, "get_reference_brief", { collectionId: styleId });
    expect(styleBrief.ok).toBe(true);
    expect((styleBrief.data.brief as { text: string }).text).toContain(
      "Aesthetic: Neo Brutalism",
    );

    const ambiguous = await call(session, "get_reference_brief", {
      referenceId,
      collectionId,
    });
    expect(ambiguous.ok).toBe(false);
    expect((ambiguous.data.error as Json).category).toBe("validation");

    const detached = await call(session, "assign_reference_to_collection", {
      referenceId,
      collectionId: null,
    });
    expect(detached.ok).toBe(true);
    expect((detached.data.reference as { collectionId: string | null }).collectionId).toBe(
      null,
    );
  }, 60000);

  it("records every tool call in the server-side audit log", async () => {
    const audited = await env.api.request<{
      entries: { tool: string; client: string; result: string; tokenId: string | null }[];
    // The suite records more than 50 calls now (reference workflow included):
    // widen the window instead of asserting against a truncated page.
    }>({ method: "GET", path: "/api/mcp/audit?limit=200" });
    const tools = audited.body.entries.map((entry) => entry.tool);
    expect(tools).toContain("whoami");
    expect(tools).toContain("apply_mutations");
    expect(tools).toContain("get_section");
    const okEntry = audited.body.entries.find(
      (item) => item.tool === "apply_mutations" && item.result === "ok",
    );
    expect(okEntry?.client).toBe("mcp-tests");
    expect(okEntry?.tokenId).toBeTruthy();
    const errorEntry = audited.body.entries.find(
      (item) => item.tool === "apply_mutations" && item.result === "error",
    );
    expect(errorEntry).toBeDefined();
  });
});
