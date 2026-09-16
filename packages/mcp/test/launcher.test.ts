import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { launcherEntry } from "@senify/mcp";

// Der Launcher, den die Agenten-Clients starten: reines Node plus tsx, damit
// die .tsx-Komponenten der Registry laden. Der Test spawnt den echten Prozess
// und faehrt den MCP-Handshake bis zur Tool-Liste; die Engine wird dafuer
// nicht gebraucht (nur Token/URL fuer die Konfiguration).

function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] =>
      entry[1] !== undefined
    ),
  );
}

describe("MCP launcher", () => {
  it("starts the stdio server on plain node and lists the tools", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [launcherEntry(), "mcp", "serve"],
      env: {
        ...cleanEnv(),
        SENIFY_API_URL: "http://127.0.0.1:9",
        SENIFY_TOKEN: "snfy_launcher_test",
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "launcher-test", version: "0.0.0" });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name);
      expect(names).toContain("list_sites");
      expect(names).toContain("submit_for_review");
      expect(names.length).toBeGreaterThanOrEqual(19);
    } finally {
      await client.close();
    }
  }, 30_000);

  it("fails with a clear message when no token is configured anywhere", async () => {
    const env = cleanEnv();
    delete env.SENIFY_TOKEN;
    delete env.SENIFY_API_URL;
    // An empty home prevents the config-file fallback (~/.senify/config.json);
    // Windows reads USERPROFILE, POSIX reads HOME.
    const emptyHome = mkdtempSync(join(tmpdir(), "senify-empty-home-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [launcherEntry(), "mcp", "serve"],
      env: { ...env, HOME: emptyHome, USERPROFILE: emptyHome },
      stderr: "pipe",
    });
    const client = new Client({ name: "launcher-test", version: "0.0.0" });
    try {
      await expect(client.connect(transport)).rejects.toThrow();
    } finally {
      rmSync(emptyHome, { recursive: true, force: true });
    }
  }, 30_000);
});
