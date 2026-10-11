import { listenReachable } from "@senify/core/net";
import { createServer, type Server } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createApiHarness, loadBakedSite, runWorkflow } from "@senify/core/testing";

describe("seam 1 — engine api harness", () => {
  let server: Server | undefined;

  afterAll(() => {
    server?.close();
  });

  it("performs json round trips against a real http server", async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ method: req.method, path: req.url, body: raw ? JSON.parse(raw) : null }));
      });
    });
    const port = await new Promise<number>((resolve) => {
      void listenReachable(server!, 0, "127.0.0.1").then(() => {
        const address = server?.address();
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });

    const api = createApiHarness(`http://127.0.0.1:${port}`);
    const response = await api.request<{ method: string; path: string; body: unknown }>({
      method: "POST",
      path: "/sites",
      body: { name: "Demo" },
    });

    expect(response.status).toBe(200);
    expect(response.body.method).toBe("POST");
    expect(response.body.path).toBe("/sites");
    expect(response.body.body).toEqual({ name: "Demo" });
  });
});

describe("seam 2 — bake output harness", () => {
  it("reads baked artefacts from a directory", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "senify-bake-"));
    await writeFile(join(rootDir, "index.html"), "<html><body>ok</body></html>", "utf8");
    await writeFile(join(rootDir, "llms.txt"), "# Demo", "utf8");

    const site = loadBakedSite(rootDir);
    expect(await site.exists("index.html")).toBe(true);
    expect(await site.exists("missing.html")).toBe(false);
    expect(await site.read("llms.txt")).toBe("# Demo");
    expect(await site.read("index.html")).toContain("ok");
  });
});

describe("seam 3 — mcp workflow harness", () => {
  it("runs tool steps sequentially", async () => {
    const calls: string[] = [];
    const result = await runWorkflow(
      async (tool, args) => {
        calls.push(`${tool}:${JSON.stringify(args)}`);
        return { tool };
      },
      [
        { tool: "create_page", args: { path: "/" } },
        { tool: "apply_mutations", args: { dry_run: true } },
      ],
    );
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      'create_page:{"path":"/"}',
      'apply_mutations:{"dry_run":true}',
    ]);
  });

  it("stops at the first failing step", async () => {
    const result = await runWorkflow(
      async (tool) => {
        if (tool === "apply_mutations") throw new Error("guardrail: too many pins");
        return { tool };
      },
      [
        { tool: "get_page", args: {} },
        { tool: "apply_mutations", args: {} },
        { tool: "create_preview", args: {} },
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]?.error).toContain("guardrail");
  });
});