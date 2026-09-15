import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SenifyError } from "@senify/core";

export type McpConfig = {
  apiUrl: string;
  token: string;
};

export const DEFAULT_API_URL = "http://127.0.0.1:4321";

export function configPath(): string {
  return join(homedir(), ".senify", "config.json");
}

// The MCP process is a thin transport: it reads its engine URL and token
// from the environment first (written by `senify setup`), then from the
// local config file the CLI maintains.
export function resolveConfig(
  env: NodeJS.ProcessEnv = process.env,
): McpConfig {
  let fileConfig: Partial<McpConfig> = {};
  try {
    fileConfig = JSON.parse(readFileSync(configPath(), "utf8")) as Partial<McpConfig>;
  } catch {
    fileConfig = {};
  }
  const apiUrl = env.SENIFY_API_URL ?? fileConfig.apiUrl ?? DEFAULT_API_URL;
  const token = env.SENIFY_TOKEN ?? fileConfig.token;
  if (!token) {
    throw new SenifyError("auth", "No Senify token configured", {
      suggestion:
        "Run `senify setup` to create a token and wire the MCP client, or set SENIFY_TOKEN (and SENIFY_API_URL).",
    });
  }
  return { apiUrl: apiUrl.replace(/\/+$/, ""), token };
}
