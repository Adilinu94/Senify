import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { exportFramerSite } from "../src/framer-export.ts";
import { framerImportSource } from "../src/cli.ts";
import { toolByName } from "../src/tools.ts";
import type { EngineClient } from "../src/client.ts";

describe("FramerExport CLI adapter", () => {
  it("passes the URL and subpage option to the exporter and retains its output", async () => {
    const root = mkdtempSync(join(tmpdir(), "senify-export-cli-"));
    try {
      const cli = join(root, "export.cjs");
      writeFileSync(cli, 'const fs = require("node:fs"); const path = require("node:path"); fs.writeFileSync(path.join(process.argv[3], "index.html"), JSON.stringify(process.argv.slice(2)));');
      const outputDir = join(root, "output with spaces");
      const result = await exportFramerSite({ url: "https://example.test/", outputDir, subpages: true }, cli);
      expect(result).toBe(outputDir);
      expect(JSON.parse(readFileSync(join(outputDir, "index.html"), "utf8"))).toEqual([
        "https://example.test/", outputDir, "--no-update", "--subpages",
      ]);
      await expect(exportFramerSite({ url: "https://example.test/", outputDir, subpages: false }, cli)).rejects.toThrow(/existiert bereits/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an invalid URL before creating output", async () => {
    await expect(exportFramerSite({ url: "file:///private", outputDir: "unused", subpages: false })).rejects.toThrow(/HTTP oder HTTPS/);
  });

  it("accepts the generated folder as an import source", () => {
    const root = mkdtempSync(join(tmpdir(), "senify-import-cli-"));
    try {
      expect(framerImportSource(root)).toEqual({ rootDir: root });
      const htmlPath = join(root, "index.html");
      writeFileSync(htmlPath, "  <!doctype html><html></html>");
      expect(framerImportSource(htmlPath)).toEqual({ html: "  <!doctype html><html></html>" });
      expect(framerImportSource("https://example.test/")).toEqual({ url: "https://example.test/" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes the fidelity mode from MCP to the import route", async () => {
    const request = vi.fn().mockResolvedValue({});
    const tool = toolByName("import_framer_page");
    expect(tool).toBeDefined();
    await tool?.handler({ client: { request } as unknown as EngineClient }, {
      siteId: "site-1", rootDir: "export", sourcePagePath: "/blog/artikel", mode: "fidelity",
    });
    expect(request).toHaveBeenCalledWith("POST", "/api/sites/site-1/imports/framer", {
      source: { rootDir: "export", page: "/blog/artikel" }, mode: "fidelity",
    });
  });

  it("prepares a local export through MCP without claiming runtime freedom", async () => {
    const root = mkdtempSync(join(tmpdir(), "senify-prepare-mcp-"));
    try {
      const input = join(root, "input");
      const output = join(root, "output");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(input);
      writeFileSync(join(input, "index.html"), '<div id="main"><p>Hallo</p></div>');
      const result = await toolByName("prepare_framer_export")?.handler({ client: {} as EngineClient }, { rootDir: input, outputDir: output });
      expect(result).toMatchObject({ pages: 1, runtimeFreeVerified: false, failedAssets: 0 });
      expect(JSON.parse(readFileSync(join(output, "site-ir.json"), "utf8")).status).toBe("capture-only");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
