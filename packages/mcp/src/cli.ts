import { Command } from "commander";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { startProgram, readProgramToken, programTokenPath } from "@senify/app";
import {
  createShortcut,
  disableStartup,
  enableStartup,
  removeShortcut,
  startupContext,
  startupStatus,
} from "@senify/app";
import { SenifyError } from "@senify/core";
import { skillReferenceFiles } from "@senify/docs-portal";
import { skillFiles } from "@senify/skills";
import { EngineClient } from "./client.ts";
import {
  configSnippet,
  configureClient,
  detectedClients,
  selectTargets,
} from "./clients.ts";
import { DEFAULT_API_URL, resolveDatabaseUrl } from "./config.ts";
import { doctorExitCode, formatDoctor, runDoctor } from "./doctor.ts";
import { serveStdio } from "./server.ts";

const SCOPES = ["read", "write", "publish"] as const;

type ApiOption = { api?: string };

type TokenEntry = {
  id: string;
  name: string;
  kind: string;
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

// Token management requires a human operator token. The CLI first uses an
// explicit environment token, then the token persisted by `senify start`.
function operator(options: ApiOption): EngineClient {
  const token = process.env.SENIFY_TOKEN ?? readProgramToken(programTokenPath())?.secret;
  if (!token) {
    throw new SenifyError("auth", "No operator token found", {
      suggestion: "Start `senify start` once or set `SENIFY_TOKEN` to a human operator token.",
    });
  }
  return new EngineClient({ apiUrl: resolveApiUrl(options), token });
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
    `kind=${token.kind}`,
    `scopes=${token.scopes.join(",")}`,
    `prefix=${token.prefix}`,
    `last=${token.lastUsedAt ?? "never"}`,
  ];
  if (token.expiresAt !== null) parts.push(`expires=${token.expiresAt.slice(0, 10)}`);
  if (token.revokedAt !== null) parts.push("REVOKED");
  return parts.join("  ");
}

// The persisted operator token of the running installation; deploy needs the
// publish scope, so the token-less operator surface is not enough.
function programTokenSecret(): string | undefined {
  return readProgramToken(programTokenPath())?.secret;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function copySkills(): string {
  const target = join(homedir(), ".senify", "skills");
  mkdirSync(target, { recursive: true });
  for (const file of skillFiles()) {
    copyFileSync(file.path, join(target, file.name));
  }
  // Generated references come from the same pipeline as the docs portal and
  // are refreshed on every setup — no hand-maintained drift.
  for (const file of skillReferenceFiles()) {
    writeFileSync(join(target, file.name), file.content);
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
    .option("--no-open", "override Autostart: do not open the browser")
    .action(async (options) => {
      const running = await startProgram({
        databaseUrl: resolveDatabaseUrl(),
        enginePort: Number.parseInt(String(options.enginePort), 10) || undefined,
        appPort: Number.parseInt(String(options.appPort), 10) || undefined,
        // Without --no-open the Autostart setting decides (default off).
        openBrowser: options.open === false ? false : undefined,
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
    .command("startup")
    .description("System-Start: Eintrag im Windows-Autostartordner anlegen, entfernen oder zeigen")
    .option("--remove", "Eintrag entfernen")
    .option("--status", "nur anzeigen")
    .action(async (options) => {
      const context = startupContext();
      if (options.status === true) {
        const status = startupStatus(context);
        console.log(`Launcher:    ${status.launcher ? "vorhanden" : "fehlt"} · ${status.paths.launcher}`);
        console.log(`System-Start: ${status.startupEntry ? "aktiv" : "inaktiv"} · ${status.paths.startupEntry}`);
        console.log(`Verknüpfung: ${status.shortcut ? "vorhanden" : "fehlt"} · ${status.paths.shortcut}`);
        return;
      }
      if (options.remove === true) {
        const { removed } = disableStartup(context);
        console.log(
          removed.length === 0 ? "Nichts zu entfernen." : `Entfernt: ${removed.join(", ")}`,
        );
        return;
      }
      const { entry } = enableStartup(context);
      console.log(`System-Start aktiv — Eintrag: ${entry}`);
    });

  program
    .command("shortcut")
    .description("Desktop-Verknüpfung anlegen, entfernen oder zeigen")
    .option("--remove", "Verknüpfung entfernen")
    .option("--status", "nur anzeigen")
    .action(async (options) => {
      const context = startupContext();
      if (options.status === true) {
        const status = startupStatus(context);
        console.log(`Verknüpfung: ${status.shortcut ? "vorhanden" : "fehlt"} · ${status.paths.shortcut}`);
        return;
      }
      if (options.remove === true) {
        const { removed } = removeShortcut(context);
        console.log(removed ? "Verknüpfung entfernt." : "Keine Verknüpfung gefunden.");
        return;
      }
      const { shortcut } = createShortcut(context);
      console.log(`Verknüpfung angelegt: ${shortcut}`);
    });

  program
    .command("setup")
    .description("One-command agent onboarding: token, MCP config, skills")
    .option("--name <name>", "client name", "senify agent")
    .option("--scopes <scopes>", "comma-separated scopes", "read,write")
    .option("--expires <expires>", 'expiry in days, e.g. 30d, or "never"', "90d")
    .option("--client <client>", "claude | cursor | opencode | all", "all")
    .option("--print", "dry-run: print the config instead of writing it")
    .option("--api <url>")
    .action(async (options) => {
      const apiUrl = resolveApiUrl(options);
      // The secret lands in plain text in the agent client's config file (and
      // sometimes in a project's .mcp.json), so it expires by default.
      const expires = String(options.expires);
      const created = await operator(options).request<{
        token: TokenEntry;
        secret: string;
      }>("POST", "/api/tokens", {
        name: String(options.name),
        kind: "agent",
        scopes: parseScopes(String(options.scopes)),
        ...(expires === "never" ? {} : { expires }),
      });
      console.log(
        `Token "${created.token.name}" created (id ${created.token.id}, kind ${created.token.kind}, scopes ${created.token.scopes.join(",")}).`,
      );
      console.log(
        `Expires: ${created.token.expiresAt === null ? "never" : created.token.expiresAt.slice(0, 10)}${created.token.expiresAt === null ? "" : " (renew with `senify setup`)"}`,
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

  program
    .command("deploy")
    .description(
      "Den aktiven Release in ein Zielverzeichnis deployen (statischer Deploy)",
    )
    .requiredOption("--site <siteId>", "Projekt-Id")
    .requiredOption("--target <dir>", "Zielverzeichnis (absoluter Pfad)")
    .option("--api <url>")
    .action(async (options) => {
      // Deploy braucht den publish-Scope: der CLI-Weg nutzt das Programm-Token
      // der laufenden Installation (der Dashboard-Proxy tut dasselbe).
      const secret = programTokenSecret();
      if (secret === undefined) {
        throw new SenifyError("validation", "Kein Programm-Token gefunden", {
          suggestion:
            "Starte das Programm einmal (senify start), damit ~/.senify/program-token.json entsteht.",
        });
      }
      const client = new EngineClient({
        apiUrl: resolveApiUrl(options),
        token: secret,
      });
      const result = await client.request<{
        deployment: {
          id: string;
          status: string;
          target: string;
          fileCount: number;
          byteSize: number;
          error: string | null;
        };
      }>("POST", `/api/sites/${String(options.site)}/deployments`, {
        provider: "static",
        targetDir: String(options.target),
      });
      const deployment = result.deployment;
      if (deployment.status === "succeeded") {
        console.log(
          `Deploy ${deployment.id}: ${deployment.fileCount} Dateien (${formatBytes(deployment.byteSize)}) — ${deployment.target}`,
        );
      } else {
        console.error(
          `Deploy ${deployment.id} fehlgeschlagen: ${deployment.error ?? "unbekannt"}`,
        );
        process.exitCode = 1;
      }
    });

  program
    .command("import")
    .description("Import-Werkzeuge (Framer)")
    .command("framer")
    .description(
      "Eine Framer-Seite importieren: URL, lokaler Mirror-Ordner oder HTML-Datei. Ohne --write nur Dry-Run (Bericht).",
    )
    .argument("<quelle>", "URL, Mirror-Ordner oder HTML-Datei")
    .requiredOption("--site <siteId>", "Projekt-Id")
    .option("--page-path <path>", "Zielpfad der Seite", "/")
    .option("--write", "Ergebnis als eine Revision schreiben (Default: Dry-Run)")
    .option("--page-id <pageId>", "In diese bestehende Seite schreiben statt neue anzulegen")
    .option("--base-draft-version <version>", "Aktuelle Draft-Version der Zielseite")
    .option("--apply-theme", "Theme-Font-Patch mit übernehmen")
    .option("--report", "Vollen Bericht als JSON ausgeben")
    .option("--api <url>")
    .action(async (quelle, options) => {
      const secret = programTokenSecret();
      if (secret === undefined) {
        throw new SenifyError("validation", "Kein Programm-Token gefunden", {
          suggestion:
            "Starte das Programm einmal (senify start), damit ~/.senify/program-token.json entsteht.",
        });
      }
      const client = new EngineClient({
        apiUrl: resolveApiUrl(options),
        token: secret,
      });
      const source = /^https?:\/\//i.test(quelle)
        ? { url: quelle }
        : readFileSync(quelle, "utf8").startsWith("<")
          ? { html: readFileSync(quelle, "utf8") }
          : { rootDir: quelle };
      const write = options.write === true;
      const body: Record<string, unknown> = {
        source,
        pagePath: String(options.pagePath),
        write,
        ...(options.pageId === undefined ? {} : { pageId: String(options.pageId) }),
        ...(options.baseDraftVersion === undefined
          ? {}
          : { baseDraftVersion: Number.parseInt(String(options.baseDraftVersion), 10) }),
        ...(options.applyTheme === true ? { applyTheme: true } : {}),
      };
      const answer = await client.request<{
        job: { id: string; status: string; dryRun: boolean };
        report: {
          irHash: string;
          score: number;
          counts: { nodes: number; mapped: number; placeholders: number };
          declarations: { total: number; carried: number; dropped: number };
          assets: { downloaded: number; deduped: number; failed: number; fonts: number };
          findings: { kind: string; severity: string; message: string }[];
          marqueeCandidates: { nodeKey: string | null; reason: string }[];
          steps: string[];
          pageId: string | null;
          newDraftVersion: number | null;
        };
      }>("POST", `/api/sites/${String(options.site)}/imports/framer`, body);
      const report = answer.report;
      if (options.report === true) {
        console.log(JSON.stringify({ job: answer.job, report }, null, 2));
        return;
      }
      console.log(
        `Import ${answer.job.id} (${write ? "geschrieben" : "Dry-Run"}) — Score ${report.score}`,
      );
      console.log(
        `Knoten: ${report.counts.mapped}/${report.counts.nodes} · Deklarationen: ${report.declarations.carried}/${report.declarations.total} (gedroppt ${report.declarations.dropped}) · Assets: ${report.assets.downloaded} geladen, ${report.assets.deduped} dedupliziert, ${report.assets.fonts} Fonts, ${report.assets.failed} fehlgeschlagen`,
      );
      console.log(`IR-Hash: ${report.irHash}`);
      if (write) {
        console.log(
          `Seite: ${report.pageId ?? "-"} (Draft-Version ${report.newDraftVersion ?? "-"})`,
        );
      }
      for (const finding of report.findings) {
        console.log(`  [${finding.severity}] ${finding.kind}: ${finding.message}`);
      }
      for (const candidate of report.marqueeCandidates) {
        console.log(`  [marquee] ${candidate.nodeKey ?? "-"}: ${candidate.reason}`);
      }
    });

  program
    .command("doctor")
    .description(
      "Status je Fähigkeit (Engine, Dashboard, Datenbank, Token, MCP, Daten, Bake) mit Fix-Befehl",
    )
    .option("--api <url>")
    .option("--app <url>", "Dashboard-URL", "http://127.0.0.1:4322")
    .option("--json", "Maschinenlesbar ausgeben")
    .action(async (options) => {
      const report = await runDoctor({
        apiUrl: resolveApiUrl(options),
        appUrl: String(options.app),
      });
      if (options.json === true) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        for (const line of formatDoctor(report)) console.log(line);
      }
      process.exitCode = doctorExitCode(report);
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
    .option("--kind <kind>", "human | agent (default agent)", "agent")
    .option("--scopes <scopes>", "comma-separated scopes", "read,write")
    .option("--expires <expires>", "expiry in days, e.g. 90d")
    .option("--api <url>")
    .action(async (options) => {
      const kind = String(options.kind);
      if (kind !== "human" && kind !== "agent") {
        throw new SenifyError("validation", `Unknown token kind "${kind}"`, {
          field: "kind",
          suggestion: 'Use "human" or "agent".',
        });
      }
      const created = await operator(options).request<{
        token: TokenEntry;
        secret: string;
      }>("POST", "/api/tokens", {
        name: String(options.name),
        kind,
        scopes: parseScopes(String(options.scopes)),
        ...(options.expires === undefined
          ? {}
          : { expires: String(options.expires) }),
      });
      console.log(
        `Token "${created.token.name}" created (id ${created.token.id}, kind ${created.token.kind}, scopes ${created.token.scopes.join(",")}).`,
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
    // Entity ids may start with "-" (ids.ts alphabet); without this commander rejects them as unknown options.
    .allowUnknownOption()
    .option("--api <url>")
    .action(async (id: string, options) => {
      // allowUnknownOption lets a mistyped flag land here; token ids are newEntityId() (14 chars).
      if (!/^[0-9A-Za-z_-]{14}$/.test(id)) {
        throw new SenifyError("validation", `"${id}" is not a token id`, {
          field: "id",
          suggestion: "Copy the id from `senify tokens list`; check option spelling (e.g. --api).",
        });
      }
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
