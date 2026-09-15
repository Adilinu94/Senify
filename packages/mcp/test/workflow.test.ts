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
      "apply_mutations",
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
  }, 90000);

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

  it("records every tool call in the server-side audit log", async () => {
    const audited = await env.api.request<{
      entries: { tool: string; client: string; result: string; tokenId: string | null }[];
    }>({ method: "GET", path: "/api/mcp/audit?limit=50" });
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
