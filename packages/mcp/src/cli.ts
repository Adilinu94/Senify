import { Command } from "commander";
import { copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { startProgram } from "@senify/app";
import { SenifyError } from "@senify/core";
import { skillFiles } from "@senify/skills";
import { EngineClient } from "./client.ts";
import {
  configSnippet,
  configureClient,
  detectedClients,
  selectTargets,
} from "./clients.ts";
import { DEFAULT_API_URL, resolveDatabaseUrl } from "./config.ts";
import { serveStdio } from "./server.ts";

const SCOPES = ["read", "write", "publish"] as const;

type ApiOption = { api?: string };

type TokenEntry = {
  id: string;
  name: string;
  scopes: string[];
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function resolveApiUrl(options: ApiOption): string {
  const url = options.api ?? process.env.SENIFY_API_URL ?? DEFAULT_API_URL;
  return url.replace(/\/+$/, "");
}

// Token management is a local operator surface: the CLI talks to the engine
// without a bearer token (the engine binds to loopback by default).
function operator(options: ApiOption): EngineClient {
  return new EngineClient({ apiUrl: resolveApiUrl(options) });
}

function parseScopes(value: string): string[] {
  const scopes = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (scopes.length === 0) {
    throw new SenifyError("validation", "No scopes given", {
      field: "scopes",
      suggestion: `Use one or more of: ${SCOPES.join(", ")}.`,
    });
  }
  for (const scope of scopes) {
    if (!SCOPES.includes(scope as (typeof SCOPES)[number])) {
      throw new SenifyError("validation", `Unknown scope "${scope}"`, {
        field: "scopes",
        suggestion: `Use one or more of: ${SCOPES.join(", ")}.`,
      });
    }
  }
  return [...new Set(scopes)];
}

function formatToken(token: TokenEntry): string {
  const parts = [
    token.id,
    token.name,
    `scopes=${token.scopes.join(",")}`,
    `prefix=${token.prefix}`,
    `last=${token.lastUsedAt ?? "never"}`,
  ];
  if (token.expiresAt !== null) parts.push(`expires=${token.expiresAt.slice(0, 10)}`);
  if (token.revokedAt !== null) parts.push("REVOKED");
  return parts.join("  ");
}

function copySkills(): string {
  const target = join(homedir(), ".senify", "skills");
  mkdirSync(target, { recursive: true });
  for (const file of skillFiles()) {
    copyFileSync(file.path, join(target, file.name));
  }
  return target;
}

function printSnippets(
  targets: ReturnType<typeof selectTargets>,
  apiUrl: string,
  token: string,
): void {
  for (const target of targets) {
    console.log(`# ${target.label} — ${target.configPath}`);
    console.log(JSON.stringify(configSnippet(target, apiUrl, token), null, 2));
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("senify")
    .description("Senify — agent-native website platform (local)")
    .version("0.1.0");

  program
    .command("start")
    .description("Start the local engine and open the program in the browser")
    .option("--engine-port <port>", "engine port", "4321")
    .option("--app-port <port>", "dashboard port", "4322")
    .option("--no-open", "do not open the browser")
    .action(async (options) => {
      const running = await startProgram({
        databaseUrl: resolveDatabaseUrl(),
        enginePort: Number.parseInt(String(options.enginePort), 10) || undefined,
        appPort: Number.parseInt(String(options.appPort), 10) || undefined,
        openBrowser: options.open !== false,
      });
      console.log(`Senify läuft — Dashboard: ${running.dashboardUrl}`);
      console.log(
        `Engine: ${running.engineOrigin} · Beenden mit Strg+C`,
      );
      const shutdown = (): void => {
        void running
          .close()
          .then(() => process.exit(0))
          .catch(() => process.exit(1));
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });

  program
    .command("setup")
    .description("One-command agent onboarding: token, MCP config, skills")
    .option("--name <name>", "client name", "senify agent")
    .option("--scopes <scopes>", "comma-separated scopes", "read,write")
    .option("--client <client>", "claude | cursor | opencode | all", "all")
    .option("--print", "dry-run: print the config instead of writing it")
    .option("--api <url>")
    .action(async (options) => {
      const apiUrl = resolveApiUrl(options);
      const created = await operator(options).request<{
        token: TokenEntry;
        secret: string;
      }>("POST", "/api/tokens", {
        name: String(options.name),
        scopes: parseScopes(String(options.scopes)),
      });
      console.log(
        `Token "${created.token.name}" created (id ${created.token.id}, scopes ${created.token.scopes.join(",")}).`,
      );
      console.log(`Secret (shown once): ${created.secret}`);

      const skillsTarget = copySkills();
      console.log(`Skills: ${skillsTarget}`);

      const targets = selectTargets(String(options.client));
      if (options.print === true) {
        printSnippets(targets, apiUrl, created.secret);
      } else {
        const detected = detectedClients(targets);
        const toWrite = options.client === "all" ? detected : targets;
        if (toWrite.length === 0) {
          console.log("No agent client config found — paste one of these snippets:");
          printSnippets(targets, apiUrl, created.secret);
        } else {
          for (const target of toWrite) {
            const path = configureClient(target, apiUrl, created.secret);
            console.log(`Configured ${target.label}: ${path}`);
          }
        }
      }

      const client = new EngineClient({ apiUrl, token: created.secret });
      const who = await client.request<{ name: string; scopes: string[] }>(
        "GET",
        "/api/whoami",
      );
      const sites = await client.request<{ sites: unknown[] }>("GET", "/api/sites");
      console.log(
        `Check: token "${who.name}" (${who.scopes.join(", ")}) sees ${sites.sites.length} site(s) — arbeitsfähig ✓`,
      );
    });

  const mcp = program.command("mcp").description("MCP client integration");
  mcp
    .command("serve")
    .description("Run the stdio MCP server (called by the agent clients)")
    .action(async () => {
      await serveStdio();
    });
  mcp
    .command("configure")
    .description("Detect Claude Code / Cursor / opencode and write the MCP config")
    .option("--print", "dry-run: print the config instead of writing it")
    .option("--client <client>", "claude | cursor | opencode | all", "all")
    .option("--token <token>", "token secret (defaults to SENIFY_TOKEN)")
    .option("--api <url>")
    .action(async (options) => {
      const apiUrl = resolveApiUrl(options);
      const token = options.token ?? process.env.SENIFY_TOKEN;
      if (!token) {
        throw new SenifyError("auth", "No token given", {
          suggestion:
            "Run `senify setup` (it creates one) or pass `--token <secret>` / set SENIFY_TOKEN.",
        });
      }
      const targets = selectTargets(String(options.client));
      if (options.print === true) {
        printSnippets(targets, apiUrl, token);
        return;
      }
      const detected = detectedClients(targets);
      const toWrite = options.client === "all" ? detected : targets;
      if (toWrite.length === 0) {
        console.log("No agent client config found — paste one of these snippets:");
        printSnippets(targets, apiUrl, token);
        return;
      }
      for (const target of toWrite) {
        const path = configureClient(target, apiUrl, token);
        console.log(`Configured ${target.label}: ${path}`);
      }
      for (const target of targets.filter((entry) => !toWrite.includes(entry))) {
        console.log(
          `Skipped ${target.label} (no config found; use --client ${target.id} to create one)`,
        );
      }
    });

  const tokens = program.command("tokens").description("Manage scoped API tokens");
  tokens
    .command("create")
    .description("Create a scoped token (read, write, publish)")
    .requiredOption("--name <name>", 'client name, e.g. "Claude Code"')
    .option("--scopes <scopes>", "comma-separated scopes", "read,write")
    .option("--expires <expires>", "expiry in days, e.g. 90d")
    .option("--api <url>")
    .action(async (options) => {
      const created = await operator(options).request<{
        token: TokenEntry;
        secret: string;
      }>("POST", "/api/tokens", {
        name: String(options.name),
        scopes: parseScopes(String(options.scopes)),
        ...(options.expires === undefined
          ? {}
          : { expires: String(options.expires) }),
      });
      console.log(
        `Token "${created.token.name}" created (id ${created.token.id}, scopes ${created.token.scopes.join(",")}).`,
      );
      console.log(`Secret (shown once): ${created.secret}`);
      console.log(
        "Store it in your agent client or run `senify mcp configure --token <secret>`.",
      );
    });
  tokens
    .command("list")
    .description("List tokens with last usage")
    .option("--api <url>")
    .action(async (options) => {
      const listed = await operator(options).request<{ tokens: TokenEntry[] }>(
        "GET",
        "/api/tokens",
      );
      if (listed.tokens.length === 0) {
        console.log(
          'No tokens yet. Create one with: senify tokens create --name "Claude Code"',
        );
        return;
      }
      for (const token of listed.tokens) {
        console.log(formatToken(token));
      }
    });
  tokens
    .command("revoke <id>")
    .description("Revoke a token immediately")
    .option("--api <url>")
    .action(async (id: string, options) => {
      await operator(options).request("DELETE", `/api/tokens/${id}`);
      console.log(`Token ${id} revoked — it stops working immediately.`);
    });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    if (error instanceof SenifyError) {
      console.error(`Error (${error.category}): ${error.message}`);
      if (error.suggestion !== undefined) {
        console.error(`Hint: ${error.suggestion}`);
      }
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
