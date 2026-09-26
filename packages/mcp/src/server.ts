import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type CallToolResult,
  type GetPromptResult,
  type ListPromptsResult,
  type ListResourceTemplatesResult,
  type ListResourcesResult,
  type ListToolsResult,
  type ReadResourceResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { SenifyError } from "@senify/core";
import { EngineApiError, EngineClient } from "./client.ts";
import { resolveConfig } from "./config.ts";
import {
  TOOLS,
  toolByName,
  toolNames,
  type ElicitRequest,
  type ToolContext,
  type ToolDefinition,
} from "./tools.ts";

export type McpServerOptions = {
  context: ToolContext;
  onError?: (message: string, error: unknown) => void;
};

function errorPayload(error: unknown): { error: Record<string, unknown> } {
  if (error instanceof EngineApiError) {
    return { error: { ...error.detail } };
  }
  if (error instanceof SenifyError) {
    return {
      error: {
        category: error.category,
        message: error.message,
        ...(error.field === undefined ? {} : { field: error.field }),
        ...(error.suggestion === undefined
          ? {}
          : { suggestion: error.suggestion }),
      },
    };
  }
  return {
    error: {
      category: "internal",
      message: error instanceof Error ? error.message : "Unknown MCP error",
    },
  };
}

// Audit entries are short: long strings and arrays are summarised, secrets
// are redacted engine-side.
function summarizeArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      summary[key] = value.length > 120 ? `${value.slice(0, 119)}…` : value;
    } else if (Array.isArray(value)) {
      summary[key] = `[${value.length} items]`;
    } else if (value && typeof value === "object") {
      const json = JSON.stringify(value);
      summary[key] = json.length > 200 ? `${json.slice(0, 199)}…` : value;
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

async function clientName(context: ToolContext): Promise<string> {
  try {
    return await context.client.tokenName();
  } catch {
    return "unknown";
  }
}

async function audit(
  options: McpServerOptions,
  tool: ToolDefinition,
  args: Record<string, unknown>,
  result: "ok" | "error",
  startedAt: number,
  entity: string | undefined,
): Promise<void> {
  try {
    await options.context.client.request("POST", "/api/mcp/audit", {
      client: await clientName(options.context),
      tool: tool.name,
      args: summarizeArgs(args),
      result,
      ...(entity === undefined ? {} : { entity }),
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    // Auditing must never break a tool call; surface it on stderr instead.
    (options.onError ?? defaultErrorHandler)("audit failed", error);
  }
}

function defaultErrorHandler(message: string, error: unknown): void {
  console.error(`[senify mcp] ${message}`, error);
}

// Tool annotations are a client promise (E4 slice 0): the MCP spec defaults
// are pessimistic (destructive and open world), so every hint is set
// explicitly. Destructive covers only operations that remove or overwrite
// state; open world only the web capture. `idempotentHint` mirrors the
// server-side idempotency work of ticket 18.
const DESTRUCTIVE_TOOLS = new Set([
  "delete_page",
  "delete_entry",
  "delete_asset",
  "delete_reference",
  "delete_reference_collection",
  "rollback_release",
  "restore_asset",
  "restore_entry",
  "restore_entry_version",
  "restore_revision",
  "undo_batch",
]);

const IDEMPOTENT_TOOLS = new Set([
  "update_theme",
  "update_asset",
  "replace_asset",
  "set_motion",
  "clear_motion",
  "upload_asset",
  "import_framer_page",
  "delete_page",
  "delete_entry",
  "delete_asset",
  "delete_reference",
  "delete_reference_collection",
  "restore_asset",
  "restore_entry",
  "restore_entry_version",
  "restore_revision",
  "update_reference",
  "update_reference_doc",
  "update_reference_collection",
  "set_reference_settings",
  "unassign_reference",
  "set_design_contract",
  // Pure computations with deterministic results (heatmaps are overwritten).
  "diff_reference",
]);

const OPEN_WORLD_TOOLS = new Set(["analyze_reference", "import_framer_page"]);

const REFERENCE_REDESIGN_WORKFLOW = [
  "Vault first: search_references/list_references → get_reference and read the profile, documents, rules and brief.",
  "plan_redesign on the source page with one to three candidates; it is read-only and returns a target per reference.",
  "create_redesign_proposal with the same pageId and the candidate reference ids. The server derives the Direction Cards and their section plan itself; you never send cards, section mappings, media or a decision. Pass a stable idempotencyKey.",
  "Stop here and wait: a human picks one Direction Card in the program. There is no confirm tool — an agent cannot decide the direction.",
  "get_redesign_proposal: when the status is applied, applyResult names the new draft (siteId, pageId) and states scope scaffold-theme with sectionPlanApplied false — the confirm wrote theme and draft scaffold, not the sections. While it is proposed, keep working on the source page or ask the operator.",
  "The confirmed card's sectionPlan is the binding build scope: per source section it names the registered target type, the target variant with its full preset, preserved content keys and the media needs. Rebuild exactly that plan with get_page → get_section → apply_mutations, keep content, and never copy reference media.",
  "Per draft page: get_page → get_section → apply_mutations with baseDraftVersion. Keep content, change the design through registered sections and theme tokens.",
  "Verify with get_design_report and diff_reference, then create_preview and submit_for_review. After any change, repeat the checks.",
  "publish_release only after explicit human approval. Never copy reference copy, logos, photos or a 1:1 layout; never modify the active release during the redesign run.",
].join(" ");

// The workflow the tools are meant to be used in; the MCP initialize result
// carries it as a soft guideline for the client (E4 slice 0).
const SERVER_INSTRUCTIONS = [
  "Senify is a local website builder. Typical workflow:",
  "list_sites → list_pages/get_page → get_section (golden props) → apply_mutations",
  "→ create_preview → submit_for_review → publish_release.",
  "Read tools work with the read scope; write tools need write, publish tools publish.",
  "apply_mutations is atomic per page and honors baseDraftVersion (on 409 reload the page and retry).",
  "undo_batch reverts the newest mutation batches of a page server-side (agent undo); only the newest remaining batches can be undone.",
  "Components live on the page: list_components/get_component read definitions, instances and parts; set_component_override changes one instance without touching the definition. A definition carries a version (`props.version`), each instance pins the version it was placed with; bump_component_version moves the definition ahead and update_component_instances pulls drifting instances up in one batch.",
  "Prefer theme tokens over literal values; set_motion validates against the preset registry.",
  "Reference path: import_design_system derives a patch from design.md with evidence and gaps.",
  REFERENCE_REDESIGN_WORKFLOW,
  "search_references first (vault-first), then analyze: find_duplicate_references prevents double captures. The design contract (get/set_design_contract) carries the project's never-rules — agent writes that violate them are blocked.",
  "Journey prompts (site-aus-brief, referenz-uebernehmen, review-und-release, content-pflege) encode these workflows as agent instructions.",
  "Docs pages are exposed as senify://docs resources and every site theme as senify://theme/{siteId}; missing required tool parameters are elicited from the user when the client supports form elicitation.",
].join(" ");

// Journey prompts (E4 slice 2): the four standard workflows as reusable
// agent instructions. Tools stay authoritative — prompts only orchestrate
// them, and every required prompt argument is validated.
type PromptDefinition = {
  name: string;
  description: string;
  arguments: { name: string; description: string; required?: boolean }[];
  build: (args: Record<string, string>) => string;
};

const PROMPTS: PromptDefinition[] = [
  {
    name: "site-aus-brief",
    description:
      "Build a Senify site from a client brief: create the site, apply the brand theme, build the pages section by section, preview, review, release.",
    arguments: [
      {
        name: "brief",
        description: "The client brief: brand, pages, content and goals.",
        required: true,
      },
    ],
    build: (args) => [
      `Build a Senify site from this client brief: ${args.brief}`,
      "",
      "Workflow:",
      "1. list_sites (or create_site) — pick or create the site.",
      "2. create_page for every page in the brief, starting with the start page; use speaking paths.",
      "3. get_theme → update_theme with the brand (scales, semantic roles, fonts, motion).",
      "4. Per page: get_section for the golden props, then apply_mutations in one batch per section (baseDraftVersion from get_page; dry_run first when unsure).",
      "5. Adjust tablet/mobile with set_styles breakpoint overrides; prefer token references over literals.",
      "6. Optional: set_motion from the preset registry, upload_asset/generate_image for media.",
      "7. create_preview → hand the signed URL to the operator; submit_for_review when asked; publish_release only after approval.",
      "Ground rules: drafts first, tokens before literals, the registry is law, warnings are hints, every error carries a suggestion.",
    ].join("\n"),
  },
  {
    name: "referenz-uebernehmen",
    description:
      "Redesign a source page from one or more design references: plan candidates, choose a direction, create a draft site, rebuild sections, verify, preview and review.",
    arguments: [
      {
        name: "siteId",
        description: "Source site id whose page should be redesigned.",
        required: true,
      },
      {
        name: "pageId",
        description: "Source page id used as the redesign outline.",
        required: true,
      },
      {
        name: "referenceIds",
        description:
          "Optional comma-separated reference ids from the vault. A new URL is analyzed only when no suitable reference exists.",
      },
      {
        name: "url",
        description:
          "Optional new reference URL. Use find_duplicate_references and search_references first.",
      },
    ],
    build: (args) => {
      const source =
        args.referenceIds === undefined
          ? `analyze the new reference at ${args.url}`
          : `use vault reference(s) ${args.referenceIds}`;
      return [
        `Redesign page ${args.pageId} on site ${args.siteId} and ${source}.`,
        "",
        "Workflow:",
        `1. ${source}; then search_references/find_duplicate_references and get_reference. Read the profile, documents, rules and brief.`,
        "2. plan_redesign for pageId with one to three candidates. This step is read-only.",
        "3. create_redesign_proposal with the same pageId and the candidate ids plus a stable idempotencyKey. You send no cards, no section mapping and no decision — the server derives them.",
        "4. Wait for the human: they pick one Direction Card in the program. Poll get_redesign_proposal instead of guessing; there is no confirm tool.",
        "5. When status is applied, take siteId and pageId from applyResult. applyResult.scope is scaffold-theme: the confirm wrote theme and draft scaffold, not the sections.",
        "6. Rebuild the confirmed card's sectionPlan exactly: per page get_page → get_section → apply_mutations with baseDraftVersion. Keep content, change the design through registered sections and theme tokens; a variant change must materialise its full preset, and reference media are never copied.",
        "7. get_design_report → diff_reference → create_preview. Fix findings and repeat the checks.",
        "8. submit_for_review → get_review_feedback. Stop here unless the operator explicitly approves publish_release.",
        "Ground rules: drafts first, tokens before literals, evidence over guessing, reference copy/assets/layout are not copied, and the active release stays untouched.",
      ].join("\n");
    },
  },
  {
    name: "review-und-release",
    description:
      "Review the current drafts of a site with a human and publish them as a release.",
    arguments: [
      { name: "siteId", description: "Site whose drafts to review.", required: true },
    ],
    build: (args) => [
      `Review the current drafts of the site ${args.siteId} and publish them.`,
      "",
      "Workflow:",
      "1. get_design_report for the site — fix blocking slop findings first.",
      "2. create_preview → hand the signed URL to the operator and collect feedback.",
      "3. Apply the feedback via apply_mutations (atomic batches, baseDraftVersion from get_page).",
      "4. submit_for_review when the operator asks for a formal review round.",
      "5. publish_release only after explicit approval — publishing is the operator's decision.",
      "Ground rules: never publish unreviewed drafts; every error carries a suggestion.",
    ].join("\n"),
  },
  {
    name: "content-pflege",
    description:
      "Maintain collection content of a site: list entries, update them, publish.",
    arguments: [
      {
        name: "siteId",
        description: "Site owning the collection.",
        required: true,
      },
      {
        name: "collectionId",
        description:
          "Collection to maintain; when omitted, list_collections first and ask.",
      },
    ],
    build: (args) => [
      `Maintain the collection content${args.collectionId === undefined ? "" : ` of ${args.collectionId}`} on the site ${args.siteId}.`,
      "",
      "Workflow:",
      "1. list_collections (when the collection is unknown) → get_collection for the field definitions.",
      "2. list_entries to see the current state; update_entry per entry (cells keyed by field id, slug changes are recorded as 301).",
      "3. publish_entry per finished entry; required fields are validated at publish time.",
      "Ground rules: drafts first; every error carries a suggestion.",
    ].join("\n"),
  },
];

// Form elicitation (E4 slice 2): ask the client for missing parameters.
// Only active when the client declared the form elicitation capability;
// declined, cancelled or failed elicitations resolve to undefined and the
// tool's own validation error stands.
function createElicitor(
  server: Server,
): (request: ElicitRequest) => Promise<Record<string, unknown> | undefined> {
  return async (request) => {
    if (server.getClientCapabilities()?.elicitation?.form === undefined) {
      return undefined;
    }
    try {
      const properties: Record<string, { type: "string"; description: string }> =
        {};
      const required: string[] = [];
      for (const field of request.fields) {
        properties[field.name] = {
          type: "string",
          description: field.description,
        };
        if (field.required === true) {
          required.push(field.name);
        }
      }
      const result = await server.elicitInput({
        mode: "form",
        message: request.message,
        requestedSchema: { type: "object", properties, required },
      });
      if (result.action !== "accept" || result.content === undefined) {
        return undefined;
      }
      const content: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result.content)) {
        if (typeof value === "string" && value !== "") {
          content[key] = value;
        } else if (
          typeof value === "number" ||
          typeof value === "boolean" ||
          Array.isArray(value)
        ) {
          content[key] = value;
        }
      }
      return content;
    } catch {
      return undefined;
    }
  };
}

function toolListing(): Tool[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema as Tool["inputSchema"],
    annotations: {
      readOnlyHint: tool.scope === "read",
      destructiveHint: DESTRUCTIVE_TOOLS.has(tool.name),
      idempotentHint: IDEMPOTENT_TOOLS.has(tool.name),
      openWorldHint: OPEN_WORLD_TOOLS.has(tool.name),
    },
  }));
}

export function createMcpServer(options: McpServerOptions): Server {
  const server = new Server(
    { name: "senify", version: "0.1.0" },
    {
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: SERVER_INSTRUCTIONS,
    },
  );
  // The elicitor rides on the tool context so every handler — including the
  // generic missing-parameter fill below — can ask the client (E4 slice 2).
  const context: ToolContext = {
    ...options.context,
    elicit: createElicitor(server),
  };

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (): Promise<ListToolsResult> => ({ tools: toolListing() }),
  );

  server.setRequestHandler(
    ListPromptsRequestSchema,
    async (): Promise<ListPromptsResult> => ({
      prompts: PROMPTS.map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
      })),
    }),
  );

  server.setRequestHandler(
    GetPromptRequestSchema,
    async (request): Promise<GetPromptResult> => {
      const prompt = PROMPTS.find(
        (entry) => entry.name === request.params.name,
      );
      if (!prompt) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Unknown prompt "${request.params.name}"`,
        );
      }
      const provided = request.params.arguments ?? {};
      const values: Record<string, string> = {};
      for (const declared of prompt.arguments) {
        const value = provided[declared.name];
        if (value === undefined || value === "") {
          if (declared.required === true) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Prompt "${prompt.name}" needs argument "${declared.name}"`,
            );
          }
          continue;
        }
        values[declared.name] = value;
      }
      if (
        prompt.name === "referenz-uebernehmen" &&
        values.referenceIds === undefined &&
        values.url === undefined
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Prompt "referenz-uebernehmen" needs "referenceIds" or "url"',
        );
      }
      return {
        description: prompt.description,
        messages: [
          { role: "user", content: { type: "text", text: prompt.build(values) } },
        ],
      };
    },
  );

  // Resources (E4 slice 2): the docs portal as senify://docs pages, every
  // site theme as senify://theme/{siteId}. Tools stay authoritative — the
  // theme resource returns the same payload as the get_theme tool.
  const DOCS_SCHEME = "senify://docs";

  async function docsPages() {
    // Lazy import breaks the package cycle (docs-portal reads the tool
    // catalog from this package).
    const { portalPages } = await import("@senify/docs-portal");
    return portalPages();
  }

  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (): Promise<ListResourcesResult> => ({
      resources: (await docsPages()).map((page) => ({
        uri: `${DOCS_SCHEME}${page.path}`,
        name: page.title,
        description: page.description,
        mimeType: "text/markdown",
      })),
    }),
  );

  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (): Promise<ListResourceTemplatesResult> => ({
      resourceTemplates: [
        {
          uriTemplate: "senify://theme/{siteId}",
          name: "Site theme",
          description:
            "Design tokens of a site (same payload as the get_theme tool).",
          mimeType: "application/json",
        },
      ],
    }),
  );

  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request): Promise<ReadResourceResult> => {
      const uri = request.params.uri;
      if (uri.startsWith(`${DOCS_SCHEME}/`)) {
        const { pageMarkdown, readDoc } = await import("@senify/docs-portal");
        const page = readDoc(await docsPages(), uri.slice(DOCS_SCHEME.length));
        if (!page) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Unknown docs resource "${uri}"`,
          );
        }
        return {
          contents: [
            { uri, mimeType: "text/markdown", text: pageMarkdown(page) },
          ],
        };
      }
      const themeMatch = /^senify:\/\/theme\/([^/]+)$/.exec(uri);
      if (themeMatch) {
        const theme = await options.context.client.request(
          "GET",
          `/api/sites/${themeMatch[1]}/theme`,
        );
        return {
          contents: [
            { uri, mimeType: "application/json", text: JSON.stringify(theme, null, 2) },
          ],
        };
      }
      throw new McpError(ErrorCode.InvalidParams, `Unknown resource "${uri}"`);
    },
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      const tool = toolByName(request.params.name);
      if (!tool) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: {
                  category: "not_found",
                  message: `Unknown tool "${request.params.name}"`,
                  suggestion: `Available tools: ${toolNames().join(", ")}.`,
                },
              }),
            },
          ],
        };
      }
      // Missing required parameters: ask the client first (E4 slice 2).
      // Without the form capability — or when the user declines — the
      // tool's own validation error below stands.
      const required = Array.isArray(tool.inputSchema.required)
        ? tool.inputSchema.required.filter(
            (field): field is string => typeof field === "string",
          )
        : [];
      const missing = required.filter((field) => {
        const value = args[field];
        return value === undefined || value === "";
      });
      let effective = args;
      if (missing.length > 0) {
        const content = await context.elicit?.({
          message: `The "${tool.name}" tool needs ${missing.length > 1 ? "these values" : "this value"}: ${missing.join(", ")}.`,
          fields: missing.map((field) => ({
            name: field,
            description: `Value for "${field}" (tool ${tool.name}).`,
            required: true,
          })),
        });
        if (content !== undefined) {
          effective = { ...args, ...content };
        }
      }
      const startedAt = Date.now();
      try {
        const result = await tool.handler(context, effective);
        await audit(options, tool, effective, "ok", startedAt, tool.entity?.(effective, result));
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        await audit(
          options,
          tool,
          effective,
          "error",
          startedAt,
          tool.entity?.(effective, undefined),
        );
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify(errorPayload(error)) }],
        };
      }
    },
  );

  return server;
}

export async function serveStdio(): Promise<void> {
  const config = resolveConfig();
  const context: ToolContext = { client: new EngineClient(config) };
  const server = createMcpServer({ context });
  await server.connect(new StdioServerTransport());
}
