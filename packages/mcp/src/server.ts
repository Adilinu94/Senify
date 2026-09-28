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

// The one error shape every tool speaks (Fahrplan P3-3 Punkt 2, R8).
//
// The field that matters is `retryable`. Before it, an agent faced a category
// (`validation`, `guardrail`, `conflict`, `auth`, `not_found`) and had to guess
// whether trying again could help - and the wrong guess is expensive in both
// directions: retrying a validation burns a turn and changes nothing, while
// NOT retrying a 429 leaves a job unfinished. So the answer is stated, per
// category, once, from the engine's own five (see `ErrorCategory` in
// `@senify/core`):
//
//   - `validation`  the request itself is wrong. A retry sends the same wrong
//                   request. NOT retryable.
//   - `guardrail`   the engine refused on purpose - a colour outside the
//                   profile, a headline it will not ship. A retry with the same
//                   values hits the same wall. NOT retryable: the caller has to
//                   change something, and "try again" is not that.
//   - `not_found`   the id does not exist. A retry could only help after the
//                   caller created it, which makes the retry the caller's
//                   decision, not this server's promise. NOT retryable.
//   - `auth`        the token is missing, wrong or lacks the scope. A retry
//                   with the same token fails identically. NOT retryable -
//                   and saying so is the whole point: an agent that retries a
//                   401 in a loop looks like an attack.
//   - `conflict`    a stale `baseDraftVersion` or a claim someone else took. The
//                   engine hands back what it has now, so reading and retrying
//                   is exactly the right move. RETRYABLE.
//
// `rate_limit` is not one of the five: it arrives as an HTTP 429 with a
// `Retry-After`, and the engine's error object already carries the status. It
// is retryable by definition - waiting is the whole fix - so it is named here
// rather than left to the caller to recognise.
//
// `attempt` travels with every error after the first, so a client can tell a
// loop from a one-off without counting on its own.
export type McpErrorPayload = {
  category: string;
  message: string;
  field?: string;
  suggestion?: string;
  retryable: boolean;
  // How many times this call has already failed with these arguments.
  attempt?: number;
  // Set when the engine sent one: its own advice, in milliseconds.
  retryAfterMs?: number;
  // Set on `internal`: the raw detail, so a bug report can carry it. Without
  // it every internal error reads as "something went wrong".
  detail?: unknown;
};

// `conflict` and `rate_limit` are the two answers "yes, try again". Everything
// else means "change something first", and a retry is the wrong move.
const RETRYABLE_CATEGORIES: ReadonlySet<string> = new Set(["conflict", "rate_limit"]);

function errorPayload(error: unknown, attempt = 1): { error: McpErrorPayload } {
  if (error instanceof EngineApiError) {
    // The engine's own error object already carries a category; the MCP layer
    // adds only what a client needs to decide what to do next. Spreading
    // `detail` keeps `message` and `field` where they were, so nothing that
    // parsed the old shape breaks.
    const detail = error.detail as Record<string, unknown>;
    const category = typeof detail.category === "string" ? detail.category : "unknown";
    return {
      error: {
        ...detail,
        category,
        message: typeof detail.message === "string" ? detail.message : error.message,
        retryable: RETRYABLE_CATEGORIES.has(category),
        ...(attempt > 1 ? { attempt } : {}),
        ...(typeof detail.retryAfterMs === "number" ? { retryAfterMs: detail.retryAfterMs } : {}),
      },
    };
  }
  if (error instanceof SenifyError) {
    return {
      error: {
        category: error.category,
        message: error.message,
        retryable: RETRYABLE_CATEGORIES.has(error.category),
        ...(attempt > 1 ? { attempt } : {}),
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
      // Not retryable on purpose - see the table above. A retry that hides a
      // defect is how a defect ships.
      retryable: false,
      ...(attempt > 1 ? { attempt } : {}),
      ...(error === null || error === undefined
        ? {}
        : { detail: error instanceof Error ? error.message : String(error) }),
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
  "get_redesign_proposal: when the status is applied, applyResult names the new draft (siteId, pageId) and states what the run wrote. scope section-plan with sectionPlanApplied true means the confirm wrote the confirmed section plan itself — do not rebuild it by hand. scope scaffold-theme with sectionPlanApplied false means only theme and draft scaffold were written and the plan is still your handoff. While it is proposed, keep working on the source page or ask the operator.",
  "applyResult.warnings lists every media need the run could not cover (select, upload, generate). Each one is still open work on the new draft — resolve it there, and never copy reference media.",
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
        "5. When status is applied, take siteId and pageId from applyResult. If applyResult.scope is section-plan and sectionPlanApplied is true, the confirm already wrote the confirmed section plan — do not rebuild it by hand. If it is scaffold-theme with sectionPlanApplied false, only theme and draft scaffold were written and the plan is still your handoff: rebuild it with get_page → get_section → apply_mutations with baseDraftVersion.",
        "6. Whatever the scope, read applyResult.warnings: every media need the run could not cover (select, upload, generate) is still open work on the new draft. Resolve those there; reference media are never copied. Then get_design_report → diff_reference → create_preview, fix findings and repeat the checks.",
        "7. submit_for_review → get_review_feedback. Stop here unless the operator explicitly approves publish_release.",
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
    // Only the tools that declare an output schema advertise it. The MCP spec
    // ties `structuredContent` to this field, so a tool without one must not
    // receive structured content - a client that sees both would have no way to
    // tell whether the structure is guaranteed (P3-3, R8).
    ...(tool.outputSchema === undefined
      ? {}
      : { outputSchema: tool.outputSchema as Tool["outputSchema"] }),
    annotations: {
      readOnlyHint: tool.scope === "read",
      destructiveHint: DESTRUCTIVE_TOOLS.has(tool.name),
      idempotentHint: IDEMPOTENT_TOOLS.has(tool.name),
      openWorldHint: OPEN_WORLD_TOOLS.has(tool.name),
    },
  }));
}

// The `structuredContent` a tool result carries, or `{}` when it must not carry
// any (P3-3, R8).
//
// Two conditions, both necessary:
//   1. the tool declares an `outputSchema` - otherwise the client has no
//      promise to check the structure against;
//   2. the value satisfies that schema - otherwise the structure and the text
//      block would disagree, and the client would believe the structure.
//
// Failing condition 2 is not an error: the call succeeded, and the text block
// still holds the truth. It is logged, because a schema that has drifted from
// the code is a real defect that must not stay invisible - it is exactly the
// drift that makes clients lose trust in the contract.
function structuredFor(tool: ToolDefinition, result: unknown): {
  structuredContent?: Record<string, unknown>;
} {
  if (tool.outputSchema === undefined) return {};
  if (result === null || typeof result !== "object" || Array.isArray(result)) return {};
  const value = result as Record<string, unknown>;
  if (!satisfiesSchema(value, tool.outputSchema)) {
    console.error(
      `[mcp] "${tool.name}" returned a value that does not match its outputSchema - ` +
        "structuredContent is omitted for this call.",
    );
    return {};
  }
  return { structuredContent: value };
}

// A deliberately small JSON Schema check: enough to keep the declared schemas
// honest (type, required, nested objects and arrays), and nothing more. A full
// validator would be a dependency and a second source of truth; the schemas
// here are written to be checkable by this much.
function satisfiesSchema(value: unknown, schema: Record<string, unknown>): boolean {
  const expected = schema.type;
  if (typeof expected === "string") {
    if (expected === "object") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    } else if (expected === "array") {
      if (!Array.isArray(value)) return false;
    } else if (expected === "null") {
      if (value !== null) return false;
    } else if (expected === "string" && typeof value !== "string") {
      return false;
    } else if (expected === "number" && typeof value !== "number") {
      return false;
    } else if (expected === "boolean" && typeof value !== "boolean") {
      return false;
    }
  }
  if (Array.isArray(value)) {
    const items = schema.items;
    if (items !== null && typeof items === "object") {
      const itemSchema = items as Record<string, unknown>;
      return value.every((entry) => satisfiesSchema(entry, itemSchema));
    }
    return true;
  }
  if (value === null || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (typeof key === "string" && !(key in record)) return false;
  }
  const properties = schema.properties;
  if (properties === null || typeof properties !== "object") return true;
  for (const [key, propertySchema] of Object.entries(properties as Record<string, unknown>)) {
    if (!(key in record)) continue;
    if (propertySchema === null || typeof propertySchema !== "object") continue;
    if (!satisfiesSchema(record[key], propertySchema as Record<string, unknown>)) return false;
  }
  return true;
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
  // Failed attempts per (tool, arguments), so an error can say "this is the
  // third time" and a client can tell a loop from a one-off (P3-3 Punkt 2).
  // Bounded so a client that keeps failing on fresh arguments cannot grow the
  // map without limit; the oldest entry is dropped, because the recent ones
  // are the ones a retry decision depends on.
  const attempts = new Map<string, number>();
  const MAX_TRACKED_ATTEMPTS = 200;

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
          // The structured twin of the text above, for the tools that promise a
          // shape (P3-3, R8). It is only sent when the tool declares an output
          // schema AND the value actually satisfies it: a schema the code does
          // not keep would teach the client to trust a promise that is not
          // there, and the text block stays the fallback either way.
          ...structuredFor(tool, result),
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
        // How often this exact call has failed before. Keyed by the tool AND
        // the arguments, so a second, different call does not inherit the
        // first one's history: "this is attempt 3" has to mean "three times
        // with these arguments", or a client would give up on a fresh call
        // because an old one looped. The counter only ever grows, and only for
        // calls that actually failed.
        const signature = `${tool.name}:${JSON.stringify(effective)}`;
        const attempt = (attempts.get(signature) ?? 0) + 1;
        // Insert-then-trim: Map preserves insertion order, so the first key is
        // the oldest. A client that fails on a thousand different arguments
        // must not turn the error counter into a memory leak.
        if (!attempts.has(signature) && attempts.size >= MAX_TRACKED_ATTEMPTS) {
          const oldest = attempts.keys().next();
          if (!oldest.done) attempts.delete(oldest.value);
        }
        attempts.set(signature, attempt);
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify(errorPayload(error, attempt)) }],
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
