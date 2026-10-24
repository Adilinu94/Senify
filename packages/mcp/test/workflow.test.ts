import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer, EngineClient, type ToolContext } from "@senify/mcp";
import { runImageJobOnce, type ImageProvider } from "@senify/engine";
import {
  bootMcpEnv,
  createSite,
  createToken,
  type McpTestEnv,
} from "./helpers.ts";

type Json = Record<string, unknown>;

// Der Engine-Bake gibt sich selbst 180 s (`packages/renderer/src/bake.ts`), der
// MCP-Client trennt aber nach 60 s ohne Antwort. Aufrufe, die eine Seite
// veroeffentlichen oder eine Vorschau backen, dürfen deshalb an der Testgrenze
// nicht scheitern: das Limit muss mindestens das Budget dessen sein, was es
// prueft, sonst misst der Test den Client statt die Engine. Auf einer ruhigen
// Maschine liegt so ein Bake bei 1-3 s.
const MCP_REQUEST_TIMEOUT_MS = 300_000;

// Header-only PNG: the engine reads width/height from the IHDR chunk.
function pngBytes(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

// Same header with the complete 8-byte PNG signature: the reference library
// sniffs the full magic (the media upload only reads the first four bytes).
function referencePng(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
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

// Elicitation-capable session (E4 slice 2): the client declares the form
// capability and answers elicitation/create with the given handler.
type ElicitAnswer =
  | { action: "accept"; content: Record<string, string> }
  | { action: "decline" };

async function connectEliciting(
  origin: string,
  token: string,
  answer: (message: string) => Promise<ElicitAnswer>,
): Promise<McpSession> {
  const context: ToolContext = {
    client: new EngineClient({ apiUrl: origin, token }),
  };
  const server = createMcpServer({ context, onError: () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client(
    { name: "senify-elicits", version: "0.0.0" },
    { capabilities: { elicitation: { form: {} } } },
  );
  client.setRequestHandler(ElicitRequestSchema, async (request) =>
    answer(request.params.message),
  );
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
  const result = await session.client.callTool(
    { name, arguments: args },
    undefined,
    { timeout: MCP_REQUEST_TIMEOUT_MS },
  );
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
      "create_site",
      "duplicate_site",
      "list_pages",
      "get_page",
      "get_nodes",
      "list_sections",
      "get_section",
      "get_theme",
      "list_widgets",
      "get_widget",
      "search_docs",
      "read_docs",
      "apply_mutations",
      "undo_batch",
      "set_motion",
      "clear_motion",
      "list_components",
      "get_component",
      "set_component_override",
      "set_component_variant",
      "bump_component_version",
      "update_component_instances",
      "set_styles",
      "create_style_rule",
      "create_page",
      "set_page_template",
      "update_theme",
      "create_preview",
      "submit_for_review",
      "get_review_feedback",
      "publish_release",
      "rollback_release",
      "list_releases",
      "get_release",
      "list_bake_jobs",
      "deploy_site",
      "get_deploy_settings",
      "set_deploy_settings",
      "list_deployments",
      "restore_revision",
      "delete_page",
      "list_assets",
      "upload_asset",
      "update_asset",
      "replace_asset",
      "delete_asset",
      "restore_asset",
      "generate_image",
      "get_image_job",
      "list_image_jobs",
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
      "search_references",
      "find_duplicate_references",
      "get_reference",
      "apply_reference",
      "list_reference_collections",
      "create_reference_collection",
      "assign_reference_to_collection",
      "get_reference_brief",
      "plan_redesign",
      "create_redesign_proposal",
      "get_redesign_proposal",
      "apply_redesign",
      "import_design_system",
      "get_design_report",
      "diff_reference",
      "get_reference_docs",
      "update_reference_doc",
      "create_manual_reference",
      "update_reference",
      "delete_reference",
      "edit_reference_profile",
      "list_reference_revisions",
      "unassign_reference",
      "reference_tick",
      "update_reference_collection",
      "delete_reference_collection",
      "get_reference_settings",
      "set_reference_settings",
      "get_design_contract",
      "set_design_contract",
      "list_library_components",
      "get_library_component",
      "promote_to_library",
      "install_library_component",
      "uninstall_library_component",
      "update_library_component",
      "update_library_instances",
      "library_audit",
      "reattach_library_component",
      "find_similar_library_components",
      "import_framer_page",
      "get_import_report",
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

  // P3-3 (R8): the reading tools promise a shape, and the promise has to be
  // kept. Two halves: the catalog declares `outputSchema`, and the result
  // actually carries `structuredContent`. A schema the code does not keep is
  // worse than none - the client stops parsing text and starts trusting a
  // structure that may be wrong.
  it("declares an output schema on the reading tools and sends structured content", async () => {
    const listed = await session.client.listTools();
    const byName = new Map(listed.tools.map((tool) => [tool.name, tool]));

    // The tools that promise a shape. Only the reading ones: a write's result
    // is a confirmation whose fields depend on which write it was.
    for (const name of [
      "list_sites",
      "get_site",
      "list_pages",
      "get_page",
      "list_assets",
      "list_references",
    ]) {
      const schema = byName.get(name)?.outputSchema as
        | { type?: string; required?: string[] }
        | undefined;
      expect(schema, `${name} has no outputSchema`).toBeDefined();
      expect(schema?.type).toBe("object");
      expect(Array.isArray(schema?.required)).toBe(true);
      expect((schema?.required ?? []).length).toBeGreaterThan(0);
    }

    // And the result carries the structure the schema described.
    const result = await session.client.callTool({ name: "list_sites", arguments: {} });
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as
      | { sites?: { id?: string }[] }
      | undefined;
    expect(structured, "list_sites sent no structuredContent").toBeDefined();
    expect(Array.isArray(structured?.sites)).toBe(true);
    for (const site of structured?.sites ?? []) {
      // The very promise the schema makes: an addressable id per entry.
      expect(typeof site.id).toBe("string");
    }

    // A tool WITHOUT a schema must not receive structure: a client could not
    // tell whether the shape is guaranteed.
    const withoutSchema = await session.client.callTool({
      name: "whoami",
      arguments: {},
    });
    expect(withoutSchema.isError).not.toBe(true);
    expect(withoutSchema.structuredContent).toBeUndefined();
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
    expect(byName.get("undo_batch")?.annotations?.destructiveHint).toBe(true);
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

  it("undoes a batch over the MCP client (E17 slice 2)", async () => {
    const siteId = await createSite(env, "MCP Undo");
    const created = await call(session, "create_page", { siteId, title: "Start" });
    const pageId = created.data.id as string;
    const rootNodeId = (created.data.draft as { rootNodeId: string }).rootNodeId;
    await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: 1,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: { type: "hero", props: { headline: "Vorher" } },
        },
      ],
    });
    const outline = await call(session, "get_page", { pageId });
    const nodeId = (outline.data.sections as { id: string }[])[0]?.id as string;
    const updated = await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: 2,
      mutations: [
        { op: "updateNodeProps", id: nodeId, patch: { headline: "Nachher" } },
      ],
    });
    expect(updated.ok).toBe(true);
    expect(updated.data.newDraftVersion).toBe(3);

    const undone = await call(session, "undo_batch", {
      pageId,
      baseDraftVersion: 3,
      steps: 1,
    });
    expect(undone.ok).toBe(true);
    expect(undone.data.newDraftVersion).toBe(4);
    const undoneBatches = undone.data.undone as { batchId: string; mutations: string[] }[];
    expect(undoneBatches).toHaveLength(1);
    expect(undoneBatches[0]?.batchId).toBe(updated.data.undoBatchId);
    expect(undoneBatches[0]?.mutations).toEqual(["updateNodeProps"]);

    const restored = await call(session, "get_page", { pageId });
    const sections = restored.data.sections as { summary: string }[];
    expect(sections[0]?.summary).toContain("headline: Vorher");

    // The undo itself is audited; a stale precondition is a conflict.
    const staleUndo = await call(session, "undo_batch", {
      pageId,
      baseDraftVersion: 3,
      steps: 1,
    });
    expect(staleUndo.ok).toBe(false);
    expect((staleUndo.data.error as Json).category).toBe("conflict");
  });

  it("describes widgets and writes styles over the MCP client (ticket 02 point 7)", async () => {
    const siteId = await createSite(env, "MCP Styles");
    const created = await call(session, "create_page", { siteId, title: "Start" });
    const pageId = created.data.id as string;
    const rootNodeId = (created.data.draft as { rootNodeId: string }).rootNodeId;
    await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: 1,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: { type: "hero", props: { headline: "Stil" } },
        },
      ],
    });
    const outline = await call(session, "get_page", { pageId });
    const nodeId = (outline.data.sections as { id: string }[])[0]?.id as string;

    // The widget catalog: list, then one schema with controls and the style
    // surface of its groups.
    const widgets = await call(session, "list_widgets");
    expect(widgets.ok).toBe(true);
    const types = (widgets.data.widgets as { type: string }[]).map((widget) => widget.type);
    expect(types).toContain("heading");
    expect(types).toContain("frame");

    const heading = await call(session, "get_widget", { type: "heading" });
    expect(heading.ok).toBe(true);
    expect(heading.data.container).toBe(false);
    const controls = heading.data.controls as { key: string; kind: string }[];
    expect(controls.some((control) => control.key === "text")).toBe(true);
    const styleProperties = heading.data.styleProperties as { property: string }[];
    expect(styleProperties.some((spec) => spec.property === "fontSize")).toBe(true);

    const unknown = await call(session, "get_widget", { type: "gibtsnicht" });
    expect(unknown.ok).toBe(false);
    expect((unknown.data.error as Json).category).toBe("not_found");

    // set_styles writes the node's scoped rule, device and state included.
    const styled = await call(session, "set_styles", {
      siteId,
      pageId,
      nodeId,
      styles: { fontSize: { $token: "type.body.size" }, letterSpacing: "2px" },
      device: "mobile",
      state: "hover",
    });
    expect(styled.ok).toBe(true);
    expect(styled.data.kind).toBe("scoped");
    expect(styled.data.scope).toEqual({ type: "node", nodeId, role: "module-style" });
    expect((styled.data.states as Json).hover).toEqual({
      fontSize_mobile: { $token: "type.body.size" },
      letterSpacing_mobile: "2px",
    });

    // A second call merges instead of clashing (one scoped rule per node).
    const merged = await call(session, "set_styles", {
      siteId,
      pageId,
      nodeId,
      styles: { color: { $token: "accent" } },
    });
    expect(merged.ok).toBe(true);
    expect((merged.data.styles as Json).color).toEqual({ $token: "accent" });
    expect((merged.data.states as Json).hover).toBeDefined();

    // The schema guardrail: the open CSS space stays human.
    const open = await call(session, "set_styles", {
      siteId,
      pageId,
      nodeId,
      styles: { scrollSnapType: "x mandatory" },
    });
    expect(open.ok).toBe(false);
    expect((open.data.error as Json).category).toBe("validation");

    // The token fence of the engine stays in force for agents.
    const literal = await call(session, "set_styles", {
      siteId,
      pageId,
      nodeId,
      styles: { color: "#006092" },
    });
    expect(literal.ok).toBe(false);
    expect(String((literal.data.error as Json).suggestion)).toContain("$token");

    // create_style_rule: a class rule for reuse.
    const rule = await call(session, "create_style_rule", {
      siteId,
      name: "cta-band",
      styles: { background: { $token: "accent" } },
      states: { hover: { opacity: 0.8 } },
    });
    expect(rule.ok).toBe(true);
    expect(rule.data.kind).toBe("class");
    expect(rule.data.name).toBe("cta-band");
    expect((rule.data.states as Json).hover).toEqual({ opacity: 0.8 });

    // Without a name and without a node there is nothing to create.
    const nameless = await call(session, "create_style_rule", {
      siteId,
      styles: { color: "#fff" },
    });
    expect(nameless.ok).toBe(false);
    expect((nameless.data.error as Json).category).toBe("validation");
  });

  it("lists, reads and overrides components (ticket 04)", async () => {
    const siteId = await createSite(env, "MCP Components");
    const created = await call(session, "create_page", { siteId, title: "Start" });
    const pageId = created.data.id as string;
    const rootNodeId = (created.data.draft as { rootNodeId: string }).rootNodeId;
    // The definition is ordinary page data: a container with a block and a
    // slot, plus one instance under the root.
    const applied = await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: 1,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: {
            id: "def-card-01",
            type: "__component",
            props: {
              name: "Karte",
              variants: { groß: { "def-head-01": { headline: "Groß" } } },
            },
          },
        },
        {
          op: "insertNode",
          parent: { nodeId: "def-card-01" },
          node: { id: "def-head-01", type: "hero", props: { headline: "Titel" } },
        },
        {
          op: "insertNode",
          parent: { nodeId: "def-head-01" },
          node: { id: "def-slot-01", type: "__component_slot", props: { name: "inhalt" } },
        },
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: {
            id: "inst-01",
            type: "__component_instance",
            props: { componentId: "def-card-01" },
          },
        },
      ],
    });
    expect(applied.ok).toBe(true);

    // list_components: name, part count, slot names, instance count and ids.
    const list = await call(session, "list_components", { pageId });
    expect(list.ok).toBe(true);
    const components = list.data.components as Json[];
    expect(components).toHaveLength(1);
    expect(components[0]?.name).toBe("Karte");
    expect(components[0]?.parts).toBe(1);
    expect(components[0]?.slots).toEqual(["inhalt"]);
    expect(components[0]?.instances).toBe(1);
    expect(components[0]?.instanceIds).toEqual(["inst-01"]);
    expect(components[0]?.version).toBe(1);
    expect(components[0]?.outdated).toBe(0);
    expect(components[0]?.variants).toEqual(["groß"]);

    // get_component: part ids are the override keys, slots and instances come
    // with their current state.
    const detail = await call(session, "get_component", {
      pageId,
      componentId: "def-card-01",
    });
    expect(detail.ok).toBe(true);
    const parts = detail.data.parts as { id: string; type: string; props: Json }[];
    expect(parts.map((part) => part.id)).toEqual(["def-head-01"]);
    expect(parts[0]?.type).toBe("hero");
    expect(parts[0]?.props.headline).toBe("Titel");
    expect(detail.data.slots).toEqual([{ id: "def-slot-01", name: "inhalt" }]);
    expect(detail.data.version).toBe(1);
    expect(detail.data.drift).toEqual([]);
    expect(detail.data.variants).toEqual({
      groß: { "def-head-01": { headline: "Groß" } },
    });
    expect(detail.data.instances).toEqual([
      { id: "inst-01", componentVersion: 1, outdated: false, variants: [], overrides: {} },
    ]);

    const missing = await call(session, "get_component", {
      pageId,
      componentId: "gibtsnicht",
    });
    expect(missing.ok).toBe(false);
    expect((missing.data.error as Json).category).toBe("not_found");

    // set_component_override writes only the instance's bag; the definition
    // part keeps its own value.
    const overridden = await call(session, "set_component_override", {
      pageId,
      instanceId: "inst-01",
      partId: "def-head-01",
      key: "headline",
      value: "Eigene Karte",
      baseDraftVersion: list.data.draftVersion,
    });
    expect(overridden.ok).toBe(true);
    expect(overridden.data.overrides).toEqual({
      "def-head-01": { headline: "Eigene Karte" },
    });
    const afterWrite = await call(session, "get_component", {
      pageId,
      componentId: "def-card-01",
    });
    expect((afterWrite.data.instances as Json[])[0]?.overrides).toEqual({
      "def-head-01": { headline: "Eigene Karte" },
    });
    expect(
      (afterWrite.data.parts as { id: string; props: Json }[]).find(
        (part) => part.id === "def-head-01",
      )?.props.headline,
    ).toBe("Titel");

    // `value: null` clears the key and prunes the empty bag entirely.
    const cleared = await call(session, "set_component_override", {
      pageId,
      instanceId: "inst-01",
      partId: "def-head-01",
      key: "headline",
      value: null,
      baseDraftVersion: overridden.data.newDraftVersion,
    });
    expect(cleared.ok).toBe(true);
    expect(cleared.data.overrides).toBeNull();
    const stored = await call(session, "get_nodes", { pageId, nodeIds: ["inst-01"] });
    expect((stored.data.nodes as { props: Json }[])[0]?.props.overrides).toBeUndefined();

    // Guardrails: unknown part, unknown instance and a missing value.
    const version = cleared.data.newDraftVersion;
    const badPart = await call(session, "set_component_override", {
      pageId,
      instanceId: "inst-01",
      partId: "nope",
      key: "headline",
      value: "x",
      baseDraftVersion: version,
    });
    expect(badPart.ok).toBe(false);
    expect((badPart.data.error as Json).category).toBe("not_found");
    expect(String((badPart.data.error as Json).suggestion)).toContain("def-head-01");

    const badInstance = await call(session, "set_component_override", {
      pageId,
      instanceId: "def-head-01",
      partId: "def-head-01",
      key: "headline",
      value: "x",
      baseDraftVersion: version,
    });
    expect(badInstance.ok).toBe(false);
    expect((badInstance.data.error as Json).category).toBe("not_found");

    const noValue = await call(session, "set_component_override", {
      pageId,
      instanceId: "inst-01",
      partId: "def-head-01",
      key: "headline",
      baseDraftVersion: version,
    });
    expect(noValue.ok).toBe(false);
    expect((noValue.data.error as Json).category).toBe("validation");

    // Variants: the definition declares one, the instance activates it. The
    // activation lands on the instance, the overlays stay in the definition.
    const activated = await call(session, "set_component_variant", {
      pageId,
      instanceId: "inst-01",
      variant: "groß",
      active: true,
      baseDraftVersion: version,
    });
    expect(activated.ok).toBe(true);
    expect(activated.data.variants).toEqual(["groß"]);
    const withVariant = await call(session, "get_component", {
      pageId,
      componentId: "def-card-01",
    });
    expect((withVariant.data.instances as Json[])[0]?.variants).toEqual(["groß"]);
    expect(withVariant.data.variants).toEqual({
      groß: { "def-head-01": { headline: "Groß" } },
    });

    // Deactivating clears the list again; an unknown variant is refused.
    const deactivated = await call(session, "set_component_variant", {
      pageId,
      instanceId: "inst-01",
      variant: "groß",
      active: false,
      baseDraftVersion: activated.data.newDraftVersion,
    });
    expect(deactivated.ok).toBe(true);
    expect(deactivated.data.variants).toEqual([]);

    const unknownVariant = await call(session, "set_component_variant", {
      pageId,
      instanceId: "inst-01",
      variant: "weg",
      active: true,
      baseDraftVersion: deactivated.data.newDraftVersion,
    });
    expect(unknownVariant.ok).toBe(false);
    expect((unknownVariant.data.error as Json).category).toBe("not_found");
    expect(String((unknownVariant.data.error as Json).suggestion)).toContain("groß");

    // Versions: the definition starts at v1 and the instance pins v1. A bump
    // creates drift, the update tool resolves it in one batch.
    const bumped = await call(session, "bump_component_version", {
      pageId,
      componentId: "def-card-01",
      baseDraftVersion: deactivated.data.newDraftVersion,
    });
    expect(bumped.ok).toBe(true);
    expect(bumped.data.version).toBe(2);
    const drifted = await call(session, "get_component", {
      pageId,
      componentId: "def-card-01",
    });
    expect(drifted.data.version).toBe(2);
    expect(drifted.data.drift).toEqual([
      { instanceId: "inst-01", componentId: "def-card-01", pinned: 1, current: 2 },
    ]);
    expect((drifted.data.instances as Json[])[0]?.outdated).toBe(true);

    const updated = await call(session, "update_component_instances", {
      pageId,
      componentId: "def-card-01",
      baseDraftVersion: bumped.data.newDraftVersion,
    });
    expect(updated.ok).toBe(true);
    expect(updated.data.updated).toBe(1);
    expect(updated.data.version).toBe(2);

    const clean = await call(session, "get_component", {
      pageId,
      componentId: "def-card-01",
    });
    expect(clean.data.drift).toEqual([]);
    expect((clean.data.instances as Json[])[0]?.componentVersion).toBe(2);

    // A second update finds nothing to do (no mutation, no draft change).
    const again = await call(session, "update_component_instances", {
      pageId,
      componentId: "def-card-01",
      baseDraftVersion: updated.data.newDraftVersion,
    });
    expect(again.ok).toBe(true);
    expect(again.data.updated).toBe(0);

    // An unknown definition is refused.
    const noComponent = await call(session, "bump_component_version", {
      pageId,
      componentId: "gibtsnicht",
      baseDraftVersion: updated.data.newDraftVersion,
    });
    expect(noComponent.ok).toBe(false);
    expect((noComponent.data.error as Json).category).toBe("not_found");
  });

  it("blocks write tools for read-only tokens with an actionable error", async () => {    const siteId = await createSite(env, "Read Only");
    const readOnly = await createToken(env, "read-only", ["read"]);
    const reader = await connect(env.origin, readOnly);
    try {
      const page = await call(reader, "create_page", { siteId, title: "Nope" });
      expect(page.ok).toBe(false);
      const error = page.data.error as Json;
      expect(error.category).toBe("auth");
      expect(String(error.suggestion)).toContain("write");
      // A 401 is not retryable with the same token, and an agent that keeps
      // trying looks like an attack. The payload says so instead of leaving the
      // client to work it out (P3-3 Punkt 2).
      expect(error.retryable).toBe(false);
    } finally {
      await reader.close();
    }
  });

  // P3-3 Punkt 2 (R8): every error answers the same question - "would the same
  // call succeed if I tried again?" - and the answer comes from the category,
  // not from the caller guessing. These four cases are the whole table.
  it("stamps every error with retryable, and gets the answer right per category", async () => {
    const siteId = await createSite(env, "Fehlerformen");

    // `validation`: the request is wrong. Retrying sends the same wrong
    // request.
    const missing = await call(session, "get_site", {});
    expect(missing.ok).toBe(false);
    const validation = missing.data.error as Json;
    expect(validation.category).toBe("validation");
    expect(validation.retryable).toBe(false);

    // `not_found`: the id does not exist. A retry could only help after the
    // caller created it, which is the caller's decision, not a promise here.
    const gone = await call(session, "get_site", { siteId: "gibt-es-nicht" });
    expect(gone.ok).toBe(false);
    const notFound = gone.data.error as Json;
    expect(notFound.category).toBe("not_found");
    expect(notFound.retryable).toBe(false);

    // `conflict`: a stale baseDraftVersion. The engine hands back the current
    // version, so reading and retrying is the right move. The mutation itself
    // is a no-op on a fresh page (delete the root's only child that does not
    // exist is refused), so what fails first is the VERSION check - which is
    // exactly the case under test.
    const created = await call(session, "create_page", { siteId, title: "Konflikt" });
    expect(created.ok).toBe(true);
    const page = created.data as { id: string };
    const stale = await call(session, "apply_mutations", {
      pageId: page.id,
      baseDraftVersion: 999,
      author: OPERATOR,
      mutations: [{ op: "deleteNode", id: "gibt-es-nicht" }],
    });
    expect(stale.ok).toBe(false);
    const conflict = stale.data.error as Json;
    expect(conflict.category).toBe("conflict");
    // The one category where "try again" is the answer.
    expect(conflict.retryable).toBe(true);
  });

  it("counts attempts per call, so a loop is distinguishable from a one-off", async () => {
    // The counter lives in the server, which serves every test in this file -
    // so an earlier test that called the same thing already moved it. The
    // assertion is therefore about the DIFFERENCE between two calls, not an
    // absolute number: that is what a client actually relies on, and it is
    // also the only form of this assertion that survives another test being
    // added above.
    //
    // Each call gets its own argument, so the two signatures differ and the
    // second must start from the first's value plus one.
    const stamp = Date.now();
    const first = await call(session, "get_site", { siteId: `fehlt-a-${stamp}` });
    expect(first.ok).toBe(false);
    const second = await call(session, "get_site", { siteId: `fehlt-a-${stamp}` });
    expect(second.ok).toBe(false);
    const firstAt = (first.data.error as Json).attempt;
    const secondAt = (second.data.error as Json).attempt;
    expect(firstAt).toBeUndefined();
    expect(secondAt).toBe(2);

    // A DIFFERENT call starts over: the counter belongs to (tool, arguments),
    // not to the tool. Otherwise an old loop would make a fresh call look
    // exhausted.
    const other = await call(session, "get_site", { siteId: `fehlt-b-${stamp}` });
    expect(other.ok).toBe(false);
    expect((other.data.error as Json).attempt).toBeUndefined();
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

    // Release manifest + re-bake visibility (E2/E12): list/get and the job list
    // are readable tools.
    const releases = await call(session, "list_releases", { siteId });
    expect(releases.ok).toBe(true);
    const listed = releases.data.releases as {
      id: string;
      manifest: { buildHash: string } | null;
    }[];
    expect(listed[0]?.id).toBe(release.id);
    expect(listed[0]?.manifest?.buildHash).toMatch(/^[0-9a-f]{64}$/);
    const fetched = await call(session, "get_release", { releaseId: release.id });
    expect(fetched.ok).toBe(true);
    expect(
      (fetched.data.manifest as { rendererVersion: string }).rendererVersion,
    ).toMatch(/^\d+\.\d+\.\d+$/);
    const jobs = await call(session, "list_bake_jobs", { siteId });
    expect(jobs.ok).toBe(true);
    expect(Array.isArray(jobs.data.jobs)).toBe(true);

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
    expect(Array.isArray(feedback.data.importReports)).toBe(true);

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
    expect(
      (
        rollback.data.release as {
          manifest: { restoredFrom?: string } | null;
        }
      ).manifest?.restoredFrom,
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
        // Die optionalen Felder des Uploads: ohne sie blieben ihre Zweige
        // (Zeilen 97-103) ungetestet. `decorative: false` ist absichtlich
        // gesetzt - der Zweig prueft auf !== undefined, nicht auf Wahrheit.
        decorative: false,
        tags: ["hero"],
        idempotencyKey: "media-upload-1",
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
        siteId,
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
        siteId,
        assetId,
        filePath: replacementPath,
      });
      expect(replaced.ok).toBe(true);
      const replacement = replaced.data.asset as { id: string; height: number | null };
      expect(replacement.id).toBe(assetId);
      expect(replacement.height).toBe(400);

      const trashed = await call(session, "delete_asset", { siteId, assetId });
      expect(trashed.ok).toBe(true);
      const trashList = await call(session, "list_assets", {
        siteId,
        status: "trashed",
      });
      expect(
        (trashList.data.assets as { id: string }[]).map((asset) => asset.id),
      ).toEqual([assetId]);

      const restored = await call(session, "restore_asset", { siteId, assetId });
      expect(restored.ok).toBe(true);
      expect(restored.data.status).toBe("ready");

      // Fehlerpfad 1 (Zeile 137): ein Update ohne ein einziges Metadatenfeld
      // waere ein stiller Leerlauf. Der Werkzeug-Vertrag verlangt stattdessen
      // einen benannten Fehler mit Hinweis, welches Feld fehlt.
      const leer = await call(session, "update_asset", { siteId, assetId });
      expect(leer.ok).toBe(false);
      // `call` legt den Fehlerkoerper nach `data`, nicht nach `error`.
      expect(JSON.stringify(leer.data)).toContain("No asset metadata to update");

      // Fehlerpfad 2 (Zeile 173): nach einem Austausch ohne altText endet der
      // Aufruf nach dem Upload. Genau dieser fruehe Ausstieg war ungetestet -
      // ohne ihn liefe ein zweiter PATCH mit leerem Rumpf.
      const ohneAlt = await call(session, "replace_asset", {
        siteId,
        assetId,
        filePath: replacementPath,
      });
      expect(ohneAlt.ok).toBe(true);
      // Der Austausch antwortet mit `asset` (wie `upload_asset`); der Typ ist
      // im Test absichtlich offen, deshalb der Zugriff ueber `unknown`.
      const ohneAltAsset = ohneAlt.data.asset as { id?: string } | undefined;
      expect(ohneAltAsset?.id ?? (ohneAlt.data.id as string | undefined)).toBe(assetId);

      // Die andere Haelfte derselben Verzweigung: MIT altText folgt dem Upload
      // ein zweiter PATCH, und der Text steht danach am Asset.
      const mitAlt = await call(session, "replace_asset", {
        siteId,
        assetId,
        filePath: replacementPath,
        altText: "Werkstatt aussen",
      });
      expect(mitAlt.ok).toBe(true);
      expect(mitAlt.data.altText).toBe("Werkstatt aussen");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);

  it("generates an image: job → worker → asset (S2)", async () => {
    const siteId = await createSite(env, "Bildgenerierung");
    const generated = await call(session, "generate_image", {
      siteId,
      prompt: "a red teapot on a wooden table",
      width: 512,
      height: 512,
      steps: 5,
      altText: "Rote Teekanne",
      tags: ["hero"],
      // Die optionalen Felder des Bildauftrags (Zeilen 245-263). Sie werden
      // nur geschrieben, wenn sie da sind - also muessen sie hier stehen.
      provider: "image-use",
      filename: "teekanne.png",
      decorative: false,
      idempotencyKey: "image-job-1",
    });
    expect(generated.ok).toBe(true);
    expect(generated.data.status).toBe("queued");
    expect(generated.data.provider).toBe("image-use");
    const jobId = String(generated.data.jobId);

    const queued = await call(session, "get_image_job", { jobId });
    expect(queued.ok).toBe(true);
    expect(queued.data.status).toBe("queued");

    // The worker runs one claim-and-run cycle with a stub provider, so no real
    // ComfyUI and no subscription is touched.
    const bytes = pngBytes(512, 512);
    const provider: ImageProvider = {
      health: async () => ({ ok: true, built: true }),
      generate: async () => ({
        bytes,
        mime: "image/png",
        width: 512,
        height: 512,
        seed: 5,
      }),
    };
    const job = await runImageJobOnce({
      context: {
        store: env.engine.store,
        dataDir: env.engine.dataDir,
        maxUploadBytes: env.engine.maxUploadBytes,
        providers: () => ({ "image-use": provider }),
      },
    });
    expect(job?.status).toBe("succeeded");
    expect(job?.assetId).toBeTruthy();

    const done = await call(session, "get_image_job", { jobId });
    expect(done.data.status).toBe("succeeded");
    expect(done.data.providerUsed).toBe("image-use");
    expect(done.data.assetId).toBe(job?.assetId);

    const listed = await call(session, "list_image_jobs", {
      siteId,
      status: "succeeded",
    });
    expect((listed.data.jobs as unknown[]).length).toBeGreaterThan(0);

    const assets = await call(session, "list_assets", { siteId, tag: "hero" });
    const items = assets.data.assets as { id: string; altText: string | null }[];
    expect(items.some((asset) => asset.id === done.data.assetId)).toBe(true);
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
      // Deckt den Limit-Zweig ab (Zeile 615).
      limit: 10,
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

  it("marks page templates and assigns layouts (O14)", async () => {
    const siteId = await createSite(env, "Vorlagen-Workflow");
    const layout = await call(session, "create_page", {
      siteId,
      title: "Rahmen",
      path: "/rahmen",
    });
    expect(layout.ok).toBe(true);
    const layoutId = layout.data.id as string;
    const content = await call(session, "create_page", {
      siteId,
      title: "Inhalt",
      path: "/inhalt",
    });
    expect(content.ok).toBe(true);
    const contentId = content.data.id as string;

    const marked = await call(session, "set_page_template", {
      pageId: layoutId,
      kind: "layout",
    });
    expect(marked.ok).toBe(true);
    const markedPage = marked.data.page as {
      template: { kind: string; label: string } | null;
    };
    expect(markedPage.template?.kind).toBe("layout");
    // The label shown in lists is the page title (no stored label of its own).
    expect(markedPage.template?.label).toBe("Rahmen");

    const assigned = await call(session, "set_page_template", {
      pageId: contentId,
      layoutId,
    });
    expect(assigned.ok).toBe(true);
    expect((assigned.data.page as { layoutId: string | null }).layoutId).toBe(
      layoutId,
    );

    // Entry template with a real collection; the mark needs at least one id.
    const collection = await env.api.request<{ id: string }>({
      method: "POST",
      path: `/api/sites/${siteId}/collections/from-fields`,
      body: {
        name: "Blog",
        supports: ["search"],
        fields: [
          {
            key: "headline",
            label: "Überschrift",
            type: "text",
            description: "Titel des Beitrags.",
          },
        ],
      },
    });
    expect(collection.status).toBe(201);
    const entry = await call(session, "set_page_template", {
      pageId: contentId,
      kind: "collection",
      collectionIds: [collection.body.id],
    });
    expect(entry.ok).toBe(true);
    expect((entry.data.page as { template: { kind: string } }).template.kind).toBe(
      "collection",
    );
    const missing = await call(session, "set_page_template", {
      pageId: contentId,
      kind: "collection",
    });
    expect(missing.ok).toBe(false);

    // Removal keeps the page and drops only the mark.
    const removed = await call(session, "set_page_template", {
      pageId: layoutId,
      kind: "none",
    });
    expect(removed.ok).toBe(true);
    expect((removed.data.page as { template: unknown }).template).toBeNull();

    const pages = await call(session, "list_pages", { siteId });
    const listed = (
      pages.data.pages as { id: string; layoutId: string | null }[]
    ).find((page) => page.id === contentId);
    expect(listed?.layoutId).toBe(layoutId);
  }, 60000);

  it("deploys the active release into a static target (E14)", async () => {
    const siteId = await createSite(env, "Deploy-Workflow");
    const created = await call(session, "create_page", { siteId, title: "Start" });
    const pageId = created.data.id as string;
    const rootNodeId = (created.data.draft as { rootNodeId: string }).rootNodeId;
    const inserted = await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: 1,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: { id: "hero-0001", type: "hero", props: { headline: "Deploy" } },
        },
      ],
    });
    expect(inserted.ok).toBe(true);
    const published = await call(session, "publish_release", { siteId, note: "deploy" });
    expect(published.ok).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), "senify-mcp-deploy-"));
    try {
      const deployed = await call(session, "deploy_site", { siteId, targetDir: dir });
      expect(deployed.ok).toBe(true);
      const deployment = deployed.data.deployment as {
        id: string;
        status: string;
        fileCount: number;
        byteSize: number;
      };
      expect(deployment.status).toBe("succeeded");
      expect(deployment.fileCount).toBeGreaterThan(0);
      expect(deployment.byteSize).toBeGreaterThan(0);
      expect(existsSync(join(dir, "index.html"))).toBe(true);

      const listed = await call(session, "list_deployments", { siteId });
      expect(listed.ok).toBe(true);
      expect((listed.data.deployments as { id: string }[])[0]?.id).toBe(
        deployment.id,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(`${dir}.senify-staging`, { recursive: true, force: true });
      rmSync(`${dir}.senify-previous`, { recursive: true, force: true });
    }
  }, 120000);

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

  it("plans a redesign, duplicates the site and writes the derived theme", async () => {
    const siteId = await createSite(env, "Redesign Quelle");
    const created = await call(session, "create_page", { siteId, title: "Werkstatt" });
    expect(created.ok).toBe(true);
    const pageId = created.data.id as string;
    const rootNodeId = (created.data.draft as { rootNodeId: string }).rootNodeId;
    const inserted = await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: created.data.draftVersion as number,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: { type: "hero", variant: "centered", props: { headline: "Unsere Werkstatt" } },
        },
      ],
    });
    expect(inserted.ok).toBe(true);

    const snapshotReference = async (name: string, html: string): Promise<string> => {
      const analyzed = await call(session, "analyze_reference", {
        url: `https://${name.toLowerCase().replace(/[^a-z]+/g, "-")}.test`,
        name,
        snapshot: { html },
      });
      expect(analyzed.ok).toBe(true);
      return (analyzed.data.reference as { id: string }).id;
    };
    const darkId = await snapshotReference(
      "Dunkle Referenz",
      `<style>
        body { background: #101418; color: #f5f7fa; font-family: 'Sora', sans-serif; font-size: 16px }
        h1 { font-size: 56px; line-height: 1.05; font-weight: 700 }
      </style>
      <section class="hero"><h1>Dunkle Referenz</h1></section>`,
    );
    const lightId = await snapshotReference(
      "Helle Referenz",
      `<style>
        body { background: #fbf7f0; color: #2b2118; font-family: 'Fraunces', serif; font-size: 19px }
        h1 { font-size: 72px; line-height: 1.1; font-weight: 400 }
      </style>
      <section class="hero"><h1>Helle Referenz</h1></section>`,
    );

    const plan = await call(session, "plan_redesign", {
      pageId,
      referenceIds: [darkId, lightId],
    });
    expect(plan.ok).toBe(true);
    const targets = plan.data.targets as {
      reference: { name: string };
      themePatch: { scales: Record<string, unknown> };
      verification: { ok: boolean };
    }[];
    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.reference.name)).toEqual([
      "Dunkle Referenz",
      "Helle Referenz",
    ]);
    expect(targets.every((target) => target.verification.ok)).toBe(true);
    expect(targets[0]?.themePatch.scales["brand"]).toBeTruthy();
    expect(targets[0]?.themePatch.scales["brand"]).not.toBe(
      targets[1]?.themePatch.scales["brand"],
    );
    const outline = (plan.data.source as { outline: { type: string; text: Json }[] }).outline;
    expect(outline.map((entry) => [entry.type, entry.text["headline"]])).toEqual([
      ["hero", "Unsere Werkstatt"],
    ]);
    // The package now hands out the human direction step, not the old manual
    // duplicate/update_theme pair.
    expect((plan.data.steps as string[])[0]).toContain("create_redesign_proposal");
    expect((plan.data.steps as string[]).join(" ")).not.toContain("duplicate_site");

    // The copy brings the content and takes the derived theme.
    const copy = await call(session, "duplicate_site", {
      siteId,
      name: "Werkstatt im Dunklen",
    });
    expect(copy.ok).toBe(true);
    const copyId = copy.data.id as string;
    expect(copy.data.name).toBe("Werkstatt im Dunklen");
    const copyPages = await call(session, "list_pages", { siteId: copyId });
    expect((copyPages.data.pages as { title: string }[]).map((entry) => entry.title)).toEqual([
      "Werkstatt",
    ]);

    const themed = await call(session, "update_theme", {
      siteId: copyId,
      theme: targets[0]?.themePatch as Json,
    });
    expect(themed.ok).toBe(true);
    expect((themed.data.theme as { scales: Record<string, unknown> }).scales["brand"]).toBe(
      targets[0]?.themePatch.scales["brand"],
    );

    // A brand-new project works without a source site as well.
    const fresh = await call(session, "create_site", { name: "Leeres Projekt" });
    expect(fresh.ok).toBe(true);
    expect(fresh.data.slug).toBe("leeres-projekt");

    const withoutReferences = await call(session, "plan_redesign", { pageId, referenceIds: [] });
    expect(withoutReferences.ok).toBe(false);
  }, 60000);

  it("applies a redesign over MCP (E25 slice 2)", async () => {
    // A documented reference: the profile is read out of design.md, no capture.
    const created = await call(session, "create_manual_reference", {
      name: "Redesign-Vorbild",
      image: referencePng(1200, 800).toString("base64"),
      documents: {
        design: [
          "# Redesign-Vorbild",
          "",
          "## Colors",
          "| Token | Value |",
          "|---|---|",
          "| brand | #7c5cff |",
          "| bg | #141414 |",
          "",
          "## Typography",
          "Font family: **Sora, Inter**",
          "",
          "| Style | Size | Weight |",
          "|---|---|---|",
          "| Body | 15px | 400 |",
        ].join("\n"),
      },
    });
    expect(created.ok).toBe(true);
    const referenceId = (created.data.reference as { id: string }).id;

    const siteId = await createSite(env, "Redesign-Ziel");
    const page = await call(session, "create_page", { siteId, title: "Start" });
    expect(page.ok).toBe(true);

    const applied = await call(session, "apply_redesign", {
      siteId,
      referenceIds: [referenceId],
    });
    expect(applied.ok).toBe(true);
    const result = applied.data as {
      siteId: string;
      duplicated: boolean;
      themeVersion: number;
      pages: { sections: { type: string }[] }[];
      record: { referenceIds: string[]; verificationOk: boolean; steps: string[] };
    };
    expect(result.duplicated).toBe(true);
    expect(result.siteId).not.toBe(siteId);
    expect(result.record.referenceIds).toEqual([referenceId]);
    expect(result.record.verificationOk).toBe(true);
    expect(result.record.steps).toContain("update_theme (abgeleiteter Patch)");
    const startPage = result.pages.find((entry) => entry.sections.length > 0);
    expect(startPage?.sections.map((section) => section.type)).toEqual([
      "hero",
      "content",
      "cta",
    ]);

    // The copy really carries the derived theme (hex is normalized).
    const theme = await call(session, "get_theme", { siteId: result.siteId });
    expect(theme.ok).toBe(true);
    expect(
      String((theme.data.theme as { scales: Record<string, unknown> }).scales["brand"]).toUpperCase(),
    ).toBe("#7C5CFF");

    // Validation errors keep their fields.
    const missing = await call(session, "apply_redesign", { siteId });
    expect(missing.ok).toBe(false);
    expect((missing.data.error as { field?: string }).field).toBe("referenceIds");
    const conflict = await call(session, "apply_redesign", {
      siteId,
      referenceIds: ["ref_ohne_profil"],
    });
    expect(conflict.ok).toBe(false);
  }, 60000);

  it("manages the reference library over MCP (E24 slice 4)", async () => {
    // A manual reference with documents: the profile is read out of design.md,
    // so no capture and no network are involved.
    const created = await call(session, "create_manual_reference", {
      name: "Handbuch Studio",
      image: referencePng(1200, 800).toString("base64"),
      sourceUrl: "https://handbuch.test",
      documents: {
        design: [
          "# Handbuch Studio",
          "",
          "## Colors",
          "| Token | Value |",
          "|---|---|",
          "| brand | #2f6f4e |",
          "| bg | #f4f1ea |",
          "",
          "## Typography",
          "Font family: **Inter, Sora**",
          "",
          "| Style | Size | Weight |",
          "|---|---|---|",
          "| Body | 17px | 400 |",
          "| Display | 58px | 700 |",
          "",
          "## Shape",
          "| Token | Radius |",
          "|---|---|",
          "| card | 12px |",
          "",
          "## Layout",
          "Base spacing unit: 8px",
        ].join("\n"),
      },
    });
    expect(created.ok).toBe(true);
    const referenceId = (created.data.reference as { id: string }).id;

    const docs = await call(session, "get_reference_docs", { referenceId });
    expect(docs.ok).toBe(true);
    expect((docs.data.documents as { design: string }).design).toContain(
      "# Handbuch Studio",
    );
    const designOnly = await call(session, "get_reference_docs", {
      referenceId,
      kind: "design",
    });
    expect(Object.keys(designOnly.data.documents as Json)).toEqual(["design"]);

    // One document kind updates in place; the other kinds keep their text.
    const guidelines = await call(session, "update_reference_doc", {
      referenceId,
      kind: "guidelines",
      content: "## Do's\n- Use the 8px grid\n\n## Don'ts\n- Never use gradients",
    });
    expect(guidelines.ok).toBe(true);
    const after = await call(session, "get_reference_docs", { referenceId });
    expect((after.data.documents as { design: string }).design).toContain(
      "# Handbuch Studio",
    );
    expect((after.data.documents as { guidelines: string }).guidelines).toContain(
      "Never use gradients",
    );

    const updated = await call(session, "update_reference", {
      referenceId,
      name: "Handbuch Studio 2",
      note: "Aus dem Ordner-Import",
    });
    expect(updated.ok).toBe(true);
    expect((updated.data.reference as { name: string }).name).toBe(
      "Handbuch Studio 2",
    );

    // The profile edit is append-only: a second revision appears.
    const edited = await call(session, "edit_reference_profile", {
      referenceId,
      vocabulary: ["grid", "paper", "quiet"],
    });
    expect(edited.ok).toBe(true);
    const revisions = await call(session, "list_reference_revisions", {
      referenceId,
    });
    expect(
      (revisions.data.revisions as unknown[]).length,
    ).toBeGreaterThanOrEqual(2);

    // House DNA and preferences are readable and writable.
    const written = await call(session, "set_reference_settings", {
      dna: {
        name: "Haus",
        description: "Ruhige Flaechen, ein Akzent.",
        constants: ["8px-Raster"],
        never: ["Gradienten"],
      },
    });
    expect(written.ok).toBe(true);
    const settings = await call(session, "get_reference_settings", {});
    expect((settings.data.dna as { name: string }).name).toBe("Haus");
    expect((settings.data.dna as { never: string[] }).never).toContain("Gradienten");

    const collection = await call(session, "create_reference_collection", {
      name: "Handbuecher",
    });
    const collectionId = (collection.data.collection as { id: string }).id;
    const renamed = await call(session, "update_reference_collection", {
      collectionId,
      description: "Sammlung fuer Handbuecher",
    });
    expect(renamed.ok).toBe(true);
    expect(
      (renamed.data.collection as { description: string }).description,
    ).toBe("Sammlung fuer Handbuecher");
    const removedCollection = await call(session, "delete_reference_collection", {
      collectionId,
    });
    expect(removedCollection.ok).toBe(true);

    const siteId = await createSite(env, "Bibliothek");
    const applied = await call(session, "apply_reference", { siteId, referenceId });
    expect(applied.ok).toBe(true);
    const unassigned = await call(session, "unassign_reference", {
      siteId,
      referenceId,
    });
    expect(unassigned.ok).toBe(true);
    expect((unassigned.data as { removed: boolean }).removed).toBe(true);

    const tick = await call(session, "reference_tick", {});
    expect(tick.ok).toBe(true);

    const deleted = await call(session, "delete_reference", {
      referenceId,
      force: true,
    });
    expect(deleted.ok).toBe(true);
  }, 60000);

  it("derives a theme draft out of design.md (E27)", async () => {
    const siteId = await createSite(env, "Design-System");
    const created = await call(session, "create_manual_reference", {
      name: "System Studio",
      image: referencePng(1200, 800).toString("base64"),
      documents: {
        design: [
          "# System Studio",
          "",
          "## Colors",
          "| Token | Value |",
          "|---|---|",
          "| brand | #2f6f4e |",
          "| bg | #f4f1ea |",
          "",
          "## Typography",
          "Font family: **Inter, Sora**",
          "",
          "| Style | Size | Weight |",
          "|---|---|---|",
          "| Body | 17px | 400 |",
          "| Display | 58px | 700 |",
          "",
          "## Shape",
          "| Token | Radius |",
          "|---|---|",
          "| card | 12px |",
          "",
          "## Layout",
          "Base spacing unit: 8px",
        ].join("\n"),
      },
    });
    expect(created.ok).toBe(true);
    const referenceId = (created.data.reference as { id: string }).id;

    const imported = await call(session, "import_design_system", {
      referenceId,
      siteId,
    });
    expect(imported.ok).toBe(true);
    const patch = imported.data.patch as {
      scales: Record<string, unknown>;
      fonts: { display?: { family: string }; body?: { family: string } };
      motion: Record<string, unknown>;
    };
    expect(patch.scales["brand"]).toBe("#2F6F4E");
    expect(patch.scales["typeBase"]).toBe(17);
    expect(patch.scales["spacingBase"]).toBe(8);
    expect(patch.scales["radiusBase"]).toBe("12px");
    expect(patch.fonts.display?.family).toBe("Inter");
    expect(patch.fonts.body?.family).toBe("Sora");

    // Every value carries its evidence level and Belegstelle.
    const evidence = imported.data.evidence as {
      field: string;
      value: string;
      level: string;
      source: string;
    }[];
    const brand = evidence.find((entry) => entry.field === "scales.brand");
    expect(brand?.value).toBe("#2F6F4E");
    expect(brand?.level).toBe("observed");
    expect(brand?.source).toContain("design.md#colors");
    expect(evidence.every((entry) => entry.source !== "")).toBe(true);

    // The document covers color, type, shape and layout; motion is the gap.
    const gaps = imported.data.gaps as { field: string }[];
    expect(gaps.map((gap) => gap.field)).toContain("motion");
    expect((imported.data.reference as { reduced: boolean }).reduced).toBe(false);

    // Both families are open fonts, so no licence suggestion is needed.
    const fonts = imported.data.fonts as {
      slot: string;
      family: string;
      open: boolean | null;
    }[];
    expect(fonts.map((font) => [font.family, font.open])).toEqual([
      ["Inter", true],
      ["Sora", true],
    ]);

    // The draft differs from the current theme: the conflicts name both sides.
    const conflicts = imported.data.conflicts as {
      field: string;
      current: string;
      next: string;
    }[];
    const brandConflict = conflicts.find((entry) => entry.field === "scales.brand");
    expect(brandConflict?.next).toBe("#2F6F4E");
    expect(brandConflict?.current).not.toBe("#2F6F4E");
    expect((imported.data.verification as { ok: boolean }).ok).toBe(true);
  }, 60000);

  it("scores a generic page as slop and stays reproducible (E26)", async () => {
    const siteId = await createSite(env, "Slop-Test");
    const created = await call(session, "create_page", {
      siteId,
      title: "Landing",
    });
    expect(created.ok).toBe(true);
    const pageId = created.data.id as string;
    const rootNodeId = (created.data.draft as { rootNodeId: string }).rootNodeId;
    const inserted = await call(session, "apply_mutations", {
      pageId,
      baseDraftVersion: created.data.draftVersion as number,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: { type: "hero", variant: "centered", props: { headline: "Willkommen" } },
        },
        { op: "insertNode", parent: { nodeId: rootNodeId }, node: { type: "features" } },
        { op: "insertNode", parent: { nodeId: rootNodeId }, node: { type: "features" } },
        { op: "insertNode", parent: { nodeId: rootNodeId }, node: { type: "features" } },
        {
          op: "insertNode",
          parent: { nodeId: rootNodeId },
          node: { type: "cta", props: { headline: "Jetzt starten" } },
        },
        { op: "insertNode", parent: { nodeId: rootNodeId }, node: { type: "testimonials" } },
      ],
    });
    expect(inserted.ok).toBe(true);

    const first = await call(session, "get_design_report", { siteId });
    expect(first.ok).toBe(true);
    const report = first.data as {
      score: number;
      verdict: string;
      penalty: number;
      dimensions: { max: number; score: number }[];
      findings: { code: string; suggestion?: string }[];
    };
    const sum = report.dimensions.reduce(
      (total, dimension) => total + dimension.score,
      0,
    );
    expect(report.score).toBe(sum - report.penalty);
    expect(report.dimensions.reduce((total, d) => total + d.max, 0)).toBe(100);
    const codes = report.findings.map((finding) => finding.code);
    expect(codes).toContain("S1-section-monotony");
    expect(codes).toContain("S2-card-only");
    expect(codes).toContain("S9-centred-slop");
    // The generic combination falls through the standard threshold.
    expect(report.score).toBeLessThan(60);
    expect(report.verdict).toBe("gate");

    // Reproducible: the same tree yields the same score.
    const second = await call(session, "get_design_report", { siteId });
    expect((second.data as { score: number }).score).toBe(report.score);
  }, 60000);

  it("wires diff_reference with validation (E26 slice 2)", async () => {
    // Unknown references fail before any bake or capture runs.
    const unknown = await call(session, "diff_reference", {
      referenceId: "ref_gibt_es_nicht",
      siteId: "site_gibt_es_nicht",
    });
    expect(unknown.ok).toBe(false);
    const error = unknown.data.error as { category: string; field?: string };
    expect(error.category).toBe("not_found");
    expect(error.field).toBe("referenceId");

    // Missing required parameters keep their validation error.
    const missing = await call(session, "diff_reference", {
      referenceId: "ref_gibt_es_nicht",
    });
    expect(missing.ok).toBe(false);
    expect(
      (missing.data.error as { field?: string }).field,
    ).toBe("siteId");
  });

  it("serves the four journey prompts with argument validation (E4 slice 2)", async () => {
    const listed = await session.client.listPrompts();
    expect(listed.prompts.map((prompt) => prompt.name).sort()).toEqual([
      "content-pflege",
      "referenz-uebernehmen",
      "review-und-release",
      "site-aus-brief",
    ]);
    const got = await session.client.getPrompt({
      name: "site-aus-brief",
      arguments: { brief: "Landingpage für Tischlerei" },
    });
    expect(got.messages).toHaveLength(1);
    const firstMessage = got.messages[0];
    expect(firstMessage?.role).toBe("user");
    const text = (
      firstMessage?.content as { type: string; text: string } | undefined
    )?.text;
    expect(text).toContain("Landingpage für Tischlerei");
    expect(text).toContain("apply_mutations");
    const optional = await session.client.getPrompt({
      name: "content-pflege",
      arguments: { siteId: "site_x" },
    });
    expect(
      (
        optional.messages[0]?.content as
          | { type: string; text: string }
          | undefined
      )?.text,
    ).toContain("site_x");
    await expect(
      session.client.getPrompt({ name: "site-aus-brief" }),
    ).rejects.toThrow(/brief/);
    const redesignPrompt = await session.client.getPrompt({
      name: "referenz-uebernehmen",
      arguments: { siteId: "site_x", pageId: "page_x", referenceIds: "ref_x" },
    });
    const redesignText = (
      redesignPrompt.messages[0]?.content as
        | { type: string; text: string }
        | undefined
    )?.text ?? "";
    for (const tool of [
      "plan_redesign",
      "create_redesign_proposal",
      "get_redesign_proposal",
      "get_page",
      "get_section",
      "apply_mutations",
      "diff_reference",
      "get_design_report",
      "create_preview",
      "submit_for_review",
    ]) {
      expect(redesignText).toContain(tool);
    }
    expect(redesignText).toContain("idempotencyKey");
    // The human decides: the journey names the wait, not an agent-side apply.
    expect(redesignText).toContain("there is no confirm tool");
    expect(redesignText).toContain("publish_release");
    await expect(
      session.client.getPrompt({
        name: "referenz-uebernehmen",
        arguments: { siteId: "site_x" },
      }),
    ).rejects.toThrow(/pageId/);
    await expect(
      session.client.getPrompt({ name: "gibt-es-nicht" }),
    ).rejects.toThrow();
  });

  it("serves docs pages and the site theme as resources (E4 slice 2)", async () => {
    const listed = await session.client.listResources();
    const uris = listed.resources.map((resource) => resource.uri);
    expect(uris).toContain("senify://docs/reference/tools");
    expect(uris).toContain("senify://docs/getting-started");
    expect(
      listed.resources.every(
        (resource) => resource.mimeType === "text/markdown",
      ),
    ).toBe(true);

    const read = await session.client.readResource({
      uri: "senify://docs/reference/tools",
    });
    const markdown =
      (read.contents[0] as { text?: string }).text ?? "";
    expect(markdown).toContain("# Tools");
    expect(markdown).toContain("get_theme");

    const templates = await session.client.listResourceTemplates();
    expect(
      templates.resourceTemplates.map((template) => template.uriTemplate),
    ).toContain("senify://theme/{siteId}");

    const siteId = await createSite(env, "Ressourcen");
    const theme = await session.client.readResource({
      uri: `senify://theme/${siteId}`,
    });
    const payload = JSON.parse(
      (theme.contents[0] as { text?: string }).text ?? "{}",
    );
    const viaTool = await call(session, "get_theme", { siteId });
    expect(viaTool.ok).toBe(true);
    expect(payload).toEqual(viaTool.data);

    await expect(
      session.client.readResource({ uri: "senify://docs/gibt-es-nicht" }),
    ).rejects.toThrow();
    await expect(
      session.client.readResource({ uri: "senify://fremd/x" }),
    ).rejects.toThrow();
  });

  it("elicits missing required parameters when the client supports it (E4 slice 2)", async () => {
    const siteId = await createSite(env, "Elicitation");
    let asked = 0;
    const eliciting = await connectEliciting(
      env.origin,
      env.token,
      async (message) => {
        asked += 1;
        expect(message).toContain("siteId");
        return { action: "accept", content: { siteId } };
      },
    );
    try {
      const result = await eliciting.client.callTool({
        name: "get_theme",
        arguments: {},
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(
        (result.content as { type: string; text?: string }[])[0]?.text ??
          "{}",
      );
      const viaTool = await call(session, "get_theme", { siteId });
      expect(data).toEqual(viaTool.data);
      expect(asked).toBe(1);
    } finally {
      await eliciting.close();
    }
  });

  it("keeps the validation error when elicitation is declined (E4 slice 2)", async () => {
    const eliciting = await connectEliciting(env.origin, env.token, async () => ({
      action: "decline",
    }));
    try {
      const result = await eliciting.client.callTool({
        name: "get_theme",
        arguments: {},
      });
      expect(result.isError).toBe(true);
      const data = JSON.parse(
        (result.content as { type: string; text?: string }[])[0]?.text ??
          "{}",
      );
      expect(data.error.field).toBe("siteId");
    } finally {
      await eliciting.close();
    }
  });

  it("elicits the brief source for get_reference_brief (E4 slice 2)", async () => {
    const created = await call(session, "create_reference_collection", {
      name: "Elicit-Sammlung",
      vocabulary: ["klar", "ruhig"],
    });
    expect(created.ok).toBe(true);
    const collectionId = (created.data.collection as { id: string }).id;
    const messages: string[] = [];
    const eliciting = await connectEliciting(
      env.origin,
      env.token,
      async (message) => {
        messages.push(message);
        return { action: "accept", content: { collectionId } };
      },
    );
    try {
      const result = await eliciting.client.callTool({
        name: "get_reference_brief",
        arguments: {},
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(
        (result.content as { type: string; text?: string }[])[0]?.text ??
          "{}",
      ) as { brief: { text: string; collectionId: string } };
      expect(data.brief.collectionId).toBe(collectionId);
      expect(data.brief.text).toContain("Collection: Elicit-Sammlung");
      expect(
        messages.some((message) => message.includes("get_reference_brief")),
      ).toBe(true);
    } finally {
      await eliciting.close();
    }
  });

  it("reads and writes the design contract over MCP (E26 slice 3)", async () => {
    const siteId = await createSite(env, "Dna-Mcp");
    const set = await call(session, "set_design_contract", {
      siteId,
      never: ["Nie Gradienten ohne Funktion"],
      constants: ["Immer 8px-Raster"],
    });
    expect(set.ok).toBe(true);
    expect((set.data as { never: string[] }).never).toEqual([
      "Nie Gradienten ohne Funktion",
    ]);
    const read = await call(session, "get_design_contract", { siteId });
    expect(read.ok).toBe(true);
    expect((read.data as { source: string }).source).toBe("manual");

    // An agent write that violates the rule is blocked with the rule named.
    const page = await call(session, "create_page", { siteId, title: "Start" });
    expect(page.ok).toBe(true);
    const blocked = await call(session, "apply_mutations", {
      pageId: page.data.id,
      baseDraftVersion: page.data.draftVersion,
      mutations: [
        {
          op: "insertNode",
          parent: { nodeId: (page.data.draft as { rootNodeId: string }).rootNodeId },
          node: {
            type: "hero",
            props: { sub: "linear-gradient(90deg, #111, #222)" },
          },
        },
      ],
    });
    expect(blocked.ok).toBe(false);
    expect(String((blocked.data.error as { message?: string }).message)).toContain(
      "Design-DNA verletzt",
    );

    // Clearing the contract frees the write path again.
    const cleared = await call(session, "set_design_contract", { siteId });
    expect(cleared.ok).toBe(true);
    expect(cleared.data).toBeNull();
  }, 60000);

  it("searches the library and finds duplicates over MCP (E24, L42)", async () => {
    const created = await call(session, "create_manual_reference", {
      name: "Raster Werk",
      image: referencePng(1200, 800).toString("base64"),
      documents: {
        design: "# Raster Werk\nStrenges Spaltenraster als Leitmotiv.",
        guidelines: null,
        components: null,
      },
    });
    expect(created.ok).toBe(true);
    const search = await call(session, "search_references", { q: "spaltenraster" });
    expect(search.ok).toBe(true);
    const hits = (search.data as { hits: { reference: { name: string } }[] }).hits;
    expect(hits.some((hit) => hit.reference.name === "Raster Werk")).toBe(true);

    const dupes = await call(session, "find_duplicate_references", {});
    expect(dupes.ok).toBe(true);
    expect(Array.isArray((dupes.data as { duplicates: unknown[] }).duplicates)).toBe(true);
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
