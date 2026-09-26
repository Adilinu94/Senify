import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProgram, doctorExitCode, formatDoctor, runDoctor } from "@senify/mcp";
import { bootMcpEnv, createSite, type McpTestEnv } from "./helpers.ts";

function commandNames(program: ReturnType<typeof createProgram>): string[] {
  return program.commands.map((command) => command.name());
}

async function runCli(args: string[]): Promise<string[]> {
  const logs: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...entries: unknown[]) => {
    logs.push(entries.map((entry) => String(entry)).join(" "));
  });
  try {
    await createProgram().parseAsync(["node", "senify", ...args]);
  } finally {
    spy.mockRestore();
  }
  return logs;
}

describe("senify CLI skeleton", () => {
  it("exposes the skeleton commands", () => {
    const program = createProgram();
    expect(commandNames(program)).toEqual([
      "start",
      "startup",
      "shortcut",
      "setup",
      "deploy",
      "import",
      "doctor",
      "mcp",
      "tokens",
    ]);
  });

  it("nests the mcp and tokens commands", () => {
    const program = createProgram();
    const mcp = program.commands.find((command) => command.name() === "mcp");
    const tokens = program.commands.find((command) => command.name() === "tokens");
    expect(mcp?.commands.map((c) => c.name())).toEqual(["serve", "configure"]);
    expect(tokens?.commands.map((c) => c.name())).toEqual([
      "create",
      "list",
      "revoke",
    ]);
  });
});

describe("senify system integration CLI", () => {
  it("reports the status of launcher, startup entry and shortcut", async () => {
    const logs = await runCli(["startup", "--status"]);
    const output = logs.join("\n");
    expect(output).toContain("Launcher:");
    expect(output).toContain("System-Start:");
    expect(output).toContain("Verknüpfung:");
    const layout = await runCli(["shortcut", "--status"]);
    expect(layout.join("\n")).toContain("Verknüpfung:");
  });
});

describe("senify doctor", () => {
  let env: McpTestEnv;

  beforeAll(async () => {
    env = await bootMcpEnv();
    await createSite(env, "Doctor");
  });

  afterAll(async () => {
    await env.close();
  });

  it("reports per-capability status with fixes and honest unverified lines", async () => {
    const home = mkdtempSync(join(tmpdir(), "senify-doctor-"));
    try {
      mkdirSync(join(home, ".senify"), { recursive: true });
      writeFileSync(
        join(home, ".senify", "program-token.json"),
        JSON.stringify({ id: "program", secret: env.token }),
      );
      writeFileSync(
        join(home, ".senify", "config.json"),
        JSON.stringify({ databaseUrl: "postgres://example/senify" }),
      );
      const report = await runDoctor({
        apiUrl: env.origin,
        appUrl: "http://127.0.0.1:9",
        home,
      });
      const byId = new Map(report.checks.map((check) => [check.id, check]));
      expect(byId.get("engine")?.status).toBe("ok");
      expect(byId.get("database")?.status).toBe("ok");
      expect(byId.get("token")?.status).toBe("ok");
      expect(byId.get("data")?.status).toBe("ok");
      expect(byId.get("bake")?.status).toBe("ok");
      // No MCP client and no dashboard in the temp home: honest warnings.
      expect(byId.get("mcp")?.status).toBe("warn");
      expect(byId.get("mcp")?.fix).toBe("senify setup");
      expect(byId.get("dashboard")?.status).toBe("warn");
      const lines = formatDoctor(report).join("\n");
      expect(lines).toContain("✓ Engine");
      expect(lines).toContain("→ senify setup");
      expect(lines).toContain("ok ·");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 30000);

  it("stays honest without a token: unverified instead of green", async () => {
    const home = mkdtempSync(join(tmpdir(), "senify-doctor-empty-"));
    try {
      const report = await runDoctor({
        apiUrl: env.origin,
        appUrl: "http://127.0.0.1:9",
        home,
      });
      const byId = new Map(report.checks.map((check) => [check.id, check]));
      expect(byId.get("engine")?.status).toBe("ok");
      expect(byId.get("token")?.status).toBe("warn");
      expect(byId.get("database")?.status).toBe("unverified");
      expect(byId.get("bake")?.status).toBe("unverified");
      expect(doctorExitCode(report)).toBe(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 30000);
});

describe("senify tokens CLI", () => {
  let env: McpTestEnv;

  beforeAll(async () => {
    env = await bootMcpEnv();
    process.env.SENIFY_TOKEN = env.operatorToken;
  });

  afterAll(async () => {
    await env.close();
  });

  it("creates, lists and revokes a token against a running engine", async () => {
    const created = await runCli([
      "tokens",
      "create",
      "--name",
      "CLI Test",
      "--scopes",
      "read,write",
      "--api",
      env.origin,
    ]);
    const output = created.join("\n");
    expect(output).toContain('Token "CLI Test" created');
    const secret = /Secret \(shown once\): (snfy_\S+)/.exec(output)?.[1];
    expect(secret).toBeTruthy();

    const listed = await runCli(["tokens", "list", "--api", env.origin]);
    const listOutput = listed.join("\n");
    expect(listOutput).toContain("CLI Test");
    expect(listOutput).toContain("scopes=read,write");
    expect(listOutput).not.toContain(secret ?? "snfy_");

    const id = listOutput.split(/\s+/)[0];
    const revoked = await runCli(["tokens", "revoke", id ?? "", "--api", env.origin]);
    expect(revoked.join("\n")).toContain(`Token ${id} revoked`);

    const afterRevoke = await runCli(["tokens", "list", "--api", env.origin]);
    expect(afterRevoke.join("\n")).toContain("REVOKED");
  });

  it("rejects unknown scopes before calling the engine", async () => {
    await expect(
      runCli([
        "tokens",
        "create",
        "--name",
        "Bad",
        "--scopes",
        "read,admin",
        "--api",
        env.origin,
      ]),
    ).rejects.toThrow(/Unknown scope "admin"/);
  });

  it("prints client config snippets in dry-run mode", async () => {
    const logs = await runCli([
      "mcp",
      "configure",
      "--print",
      "--client",
      "claude",
      "--token",
      "snfy_demo",
      "--api",
      env.origin,
    ]);
    const output = logs.join("\n");
    expect(output).toContain("Claude Code");
    const snippet = JSON.parse(logs[1] ?? "{}") as {
      mcpServers: { senify: { args: string[]; env: Record<string, string> } };
    };
    expect(snippet.mcpServers.senify.args).toEqual([expect.any(String), "mcp", "serve"]);
    expect(snippet.mcpServers.senify.env.SENIFY_API_URL).toBe(env.origin);
    expect(snippet.mcpServers.senify.env.SENIFY_TOKEN).toBe("snfy_demo");
  });
});
