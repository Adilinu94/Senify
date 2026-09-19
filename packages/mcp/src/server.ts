import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type ListToolsResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { SenifyError } from "@senify/core";
import { EngineApiError, EngineClient } from "./client.ts";
import { resolveConfig } from "./config.ts";
import {
  TOOLS,
  toolByName,
  toolNames,
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
  "rollback_release",
  "restore_asset",
  "restore_entry",
  "restore_entry_version",
  "restore_revision",
]);

const IDEMPOTENT_TOOLS = new Set([
  "update_theme",
  "update_asset",
  "replace_asset",
  "set_motion",
  "clear_motion",
  "upload_asset",
  "delete_page",
  "delete_entry",
  "delete_asset",
  "restore_asset",
  "restore_entry",
  "restore_entry_version",
  "restore_revision",
]);

const OPEN_WORLD_TOOLS = new Set(["analyze_reference"]);

// The workflow the tools are meant to be used in; the MCP initialize result
// carries it as a soft guideline for the client (E4 slice 0).
const SERVER_INSTRUCTIONS = [
  "Senify is a local website builder. Typical workflow:",
  "list_sites → list_pages/get_page → get_section (golden props) → apply_mutations",
  "→ create_preview → submit_for_review → publish_release.",
  "Read tools work with the read scope; write tools need write, publish tools publish.",
  "apply_mutations is atomic per page and honors baseDraftVersion (on 409 reload the page and retry).",
  "Prefer theme tokens over literal values; set_motion validates against the preset registry.",
].join(" ");

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
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (): Promise<ListToolsResult> => ({ tools: toolListing() }),
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
      const startedAt = Date.now();
      try {
        const result = await tool.handler(options.context, args);
        await audit(options, tool, args, "ok", startedAt, tool.entity?.(args, result));
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        await audit(
          options,
          tool,
          args,
          "error",
          startedAt,
          tool.entity?.(args, undefined),
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
