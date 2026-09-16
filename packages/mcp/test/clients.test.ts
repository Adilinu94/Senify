import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  clientTargets,
  configSnippet,
  configureClient,
} from "@senify/mcp";

const home = mkdtempSync(join(tmpdir(), "senify-home-"));

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("client configuration", () => {
  it("knows the config paths of the supported clients", () => {
    const targets = clientTargets(home);
    expect(targets.map((target) => target.id)).toEqual([
      "claude",
      "cursor",
      "opencode",
    ]);
    expect(targets[0]?.configPath).toBe(join(home, ".claude.json"));
    expect(targets[2]?.format).toBe("opencode");
  });

  it("merges the senify entry into an existing config file", () => {
    const target = clientTargets(home)[1];
    if (!target) throw new Error("cursor target missing");
    const path = configureClient(target, "http://127.0.0.1:4321", "snfy_demo");
    expect(path).toBe(target.configPath);
    const written = JSON.parse(readFileSync(path, "utf8")) as {
      mcpServers: { senify: { args: string[]; env: Record<string, string> } };
    };
    expect(written.mcpServers.senify.args.slice(-2)).toEqual(["mcp", "serve"]);
    // Spawned on plain Node via the launcher: node cannot load the registry's
    // .tsx files by itself, the launcher registers tsx first.
    expect(written.mcpServers.senify.args[0]?.replaceAll("\\", "/")).toMatch(
      /packages\/mcp\/launch\.mjs$/,
    );
    expect(written.mcpServers.senify.env.SENIFY_TOKEN).toBe("snfy_demo");

    const again = configureClient(target, "http://127.0.0.1:9999", "snfy_next");
    const updated = JSON.parse(readFileSync(again, "utf8")) as {
      mcpServers: { senify: { env: Record<string, string> } };
    };
    expect(updated.mcpServers.senify.env.SENIFY_API_URL).toBe(
      "http://127.0.0.1:9999",
    );
  });

  it("builds opencode snippets in the local-server shape", () => {
    const target = clientTargets(home)[2];
    if (!target) throw new Error("opencode target missing");
    const snippet = configSnippet(target, "http://127.0.0.1:4321", "snfy_demo") as {
      mcp: {
        senify: { type: string; command: string[]; environment: Record<string, string> };
      };
    };
    expect(snippet.mcp.senify.type).toBe("local");
    expect(snippet.mcp.senify.command.slice(-2)).toEqual(["mcp", "serve"]);
    expect(snippet.mcp.senify.command[1]?.replaceAll("\\", "/")).toMatch(
      /packages\/mcp\/launch\.mjs$/,
    );
    expect(snippet.mcp.senify.environment.SENIFY_TOKEN).toBe("snfy_demo");
  });
});
