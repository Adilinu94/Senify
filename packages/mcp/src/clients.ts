import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SenifyError } from "@senify/core";

export type ClientId = "claude" | "cursor" | "opencode";

export type ClientTarget = {
  id: ClientId;
  label: string;
  configPath: string;
  format: "mcpServers" | "opencode";
};

export function clientTargets(home: string = homedir()): ClientTarget[] {
  return [
    {
      id: "claude",
      label: "Claude Code",
      configPath: join(home, ".claude.json"),
      format: "mcpServers",
    },
    {
      id: "cursor",
      label: "Cursor",
      configPath: join(home, ".cursor", "mcp.json"),
      format: "mcpServers",
    },
    {
      id: "opencode",
      label: "opencode",
      configPath: join(home, ".config", "opencode", "opencode.json"),
      format: "opencode",
    },
  ];
}

export function detectedClients(
  targets: ClientTarget[] = clientTargets(),
): ClientTarget[] {
  return targets.filter(
    (target) =>
      existsSync(target.configPath) || existsSync(dirname(target.configPath)),
  );
}

// The clients spawn plain Node on the launcher: it registers tsx (the
// registry ships .tsx components) and hands over to the CLI, so the config
// works without shell wrappers and regardless of the working directory.
export function launcherEntry(): string {
  return fileURLToPath(new URL("../launch.mjs", import.meta.url));
}

function serverEntry(
  target: ClientTarget,
  apiUrl: string,
  token: string,
): unknown {
  const command = process.execPath;
  const args = [launcherEntry(), "mcp", "serve"];
  if (target.format === "opencode") {
    return {
      type: "local",
      command: [command, ...args],
      environment: { SENIFY_API_URL: apiUrl, SENIFY_TOKEN: token },
      enabled: true,
    };
  }
  return {
    command,
    args,
    env: { SENIFY_API_URL: apiUrl, SENIFY_TOKEN: token },
  };
}

export function configSnippet(
  target: ClientTarget,
  apiUrl: string,
  token: string,
): unknown {
  const entry = serverEntry(target, apiUrl, token);
  return target.format === "opencode"
    ? { mcp: { senify: entry } }
    : { mcpServers: { senify: entry } };
}

export function configureClient(
  target: ClientTarget,
  apiUrl: string,
  token: string,
): string {
  let existing: Record<string, unknown> = {};
  if (existsSync(target.configPath)) {
    try {
      existing =
        (JSON.parse(readFileSync(target.configPath, "utf8")) as Record<
          string,
          unknown
        >) ?? {};
    } catch {
      throw new SenifyError(
        "validation",
        `Config file ${target.configPath} is not valid JSON`,
        {
          suggestion:
            "Fix or remove the file, then run `senify mcp configure` again.",
        },
      );
    }
  }
  const key = target.format === "opencode" ? "mcp" : "mcpServers";
  const current = (existing[key] ?? {}) as Record<string, unknown>;
  const next = {
    ...existing,
    [key]: { ...current, senify: serverEntry(target, apiUrl, token) },
  };
  mkdirSync(dirname(target.configPath), { recursive: true });
  writeFileSync(target.configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return target.configPath;
}

export function selectTargets(
  requested: string,
  targets: ClientTarget[] = clientTargets(),
): ClientTarget[] {
  if (requested === "all") return targets;
  const match = targets.find((target) => target.id === requested);
  if (!match) {
    throw new SenifyError("validation", `Unknown client "${requested}"`, {
      field: "client",
      suggestion: `Use one of: ${["all", ...targets.map((t) => t.id)].join(", ")}.`,
    });
  }
  return [match];
}
