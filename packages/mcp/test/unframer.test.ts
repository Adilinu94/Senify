import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { snapshotUnframer, type UnframerConnection } from "../src/unframer.ts";
import { summarizeArgs } from "../src/server.ts";

function fakeConnection(): UnframerConnection {
  return {
    connect: async () => {},
    close: async () => {},
    call: async (name, args) => {
      let text = "";
      if (name === "getProjectWebsiteUrl") text = JSON.stringify({ production: { url: "https://example.test" } });
      if (name === "getProjectXml") text = '<Pages><Page nodeId="p1" path="/" /></Pages><Components><Component nodeId="c1" name="Button" /></Components>';
      if (name === "getNodeXml") text = `<Node id="${String(args["nodeId"])}" />`;
      if (name === "getCMSCollections") text = `Documentation\n${JSON.stringify({ collections: [{ id: "cms1", name: "Articles" }] })}`;
      if (name === "getCMSItems") {
        const skip = Number(args["skip"]);
        const items = Array.from({ length: Math.min(100, 101 - skip) }, (_, index) => ({ id: `item-${skip + index}` }));
        text = JSON.stringify({ pagination: { total: 101 }, items });
      }
      return { content: [{ type: "text", text }] };
    },
  };
}

describe("Unframer snapshot", () => {
  it("saves matching project structure and every CMS page without the access secret", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "senify-unframer-"));
    try {
      const client = fakeConnection();
      const call = vi.spyOn(client, "call");
      const result = await snapshotUnframer({
        secretUrl: "https://mcp.unframer.co/mcp?id=project&secret=private-value",
        sourceUrl: "https://example.test/",
        outputDir,
      }, () => client);
      const saved = readFileSync(result.path, "utf8");
      const snapshot = JSON.parse(saved) as { pages: unknown[]; components: unknown[]; cms: { items: unknown[] }[] };
      expect(snapshot.pages).toHaveLength(1);
      expect(snapshot.components).toHaveLength(1);
      expect(snapshot.cms[0]?.items).toHaveLength(101);
      expect(call).toHaveBeenCalledWith("getCMSItems", { collectionId: "cms1", skip: 100, limit: 100 });
      expect(saved).not.toContain("private-value");
      expect(summarizeArgs({ secretUrl: "https://mcp.unframer.co/mcp?secret=private-value" })).toEqual({ secretUrl: "[redacted]" });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects a different project before writing anything", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "senify-unframer-"));
    try {
      await expect(snapshotUnframer({ secretUrl: "https://mcp.unframer.co/mcp?secret=private-value", sourceUrl: "https://other.test/", outputDir }, fakeConnection)).rejects.toThrow(/stimmen nicht/);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("does not connect to another MCP host or expose the secret on errors", async () => {
    const factory = vi.fn(fakeConnection);
    await expect(snapshotUnframer({ secretUrl: "https://other.test/mcp?secret=private-value", sourceUrl: "https://example.test/", outputDir: "." }, factory)).rejects.toThrow(/Ungültiger/);
    expect(factory).not.toHaveBeenCalled();
    const client = fakeConnection();
    client.connect = async () => { throw new Error("private-value"); };
    await expect(snapshotUnframer({ secretUrl: "https://mcp.unframer.co/mcp?secret=private-value", sourceUrl: "https://example.test/", outputDir: "." }, () => client)).rejects.toThrow("Unframer-Snapshot konnte nicht erstellt werden");
  });
});
