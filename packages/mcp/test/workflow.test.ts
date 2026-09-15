import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
