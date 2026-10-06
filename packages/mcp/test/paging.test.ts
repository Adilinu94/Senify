import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, EngineClient, type ToolContext } from "@senify/mcp";
import { bootMcpEnv, createSite, type McpTestEnv } from "./helpers.ts";

// Die Engine begrenzt jede Liste auf eine Seite (Standard 50, Kappe 200; Fahrplan
// P3-3 Punkt 3). Ein MCP-Werkzeug, das `limit` und `offset` nicht annimmt, lässt
// einen Agenten nach Eintrag 50 stehen: er sieht `hasMore: true` und kann nichts
// damit tun. Diese Datei hält fest, dass die paginierten Listenwerkzeuge beide
// Eingaben an die Engine weiterreichen.

type Json = Record<string, unknown>;

async function connect(env: McpTestEnv): Promise<{ client: Client; close(): Promise<void> }> {
  const context: ToolContext = {
    client: new EngineClient({ apiUrl: env.origin, token: env.token }),
  };
  const server = createMcpServer({ context, onError: () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "senify-paging-tests", version: "0.0.0" });
  await client.connect(clientTransport);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

describe("MCP-Listenwerkzeuge blättern mit limit und offset", () => {
  let env: McpTestEnv;
  let session: Awaited<ReturnType<typeof connect>>;

  async function call(name: string, args: Json): Promise<{ ok: boolean; data: Json }> {
    const result = await session.client.callTool({ name, arguments: args });
    const first = (result.content as { type: string; text?: string }[])[0];
    return { ok: result.isError !== true, data: JSON.parse(first?.text ?? "{}") as Json };
  }

  beforeAll(async () => {
    env = await bootMcpEnv();
    session = await connect(env);
  });

  afterAll(async () => {
    await session.close();
    await env.close();
  });

  it("list_sites liefert Seite für Seite alle Sites ohne Lücke", async () => {
    for (const name of ["Eins", "Zwei", "Drei"]) await createSite(env, name);

    const all = await call("list_sites", {});
    const allIds = (all.data["sites"] as { id: string }[]).map((site) => site.id);
    expect(allIds).toHaveLength(3);

    const first = await call("list_sites", { limit: 2 });
    expect((first.data["sites"] as unknown[]).length).toBe(2);
    expect(first.data["hasMore"]).toBe(true);
    expect(first.data["total"]).toBe(3);

    const second = await call("list_sites", { limit: 2, offset: 2 });
    expect((second.data["sites"] as unknown[]).length).toBe(1);
    expect(second.data["hasMore"]).toBe(false);

    const paged = [...(first.data["sites"] as { id: string }[]), ...(second.data["sites"] as { id: string }[])];
    expect(paged.map((site) => site.id)).toEqual(allIds);
  });

  it("jedes paginierte Listenwerkzeug reicht limit und offset an die Engine weiter", async () => {
    const siteId = await createSite(env, "Seitenzähler");
    for (const name of [
      "list_pages",
      "list_releases",
      "list_bake_jobs",
      "list_assets",
      "list_entries",
      "list_image_jobs",
    ]) {
      const result = await call(name, { siteId, limit: 7, offset: 3 });
      expect(result.ok, `${name}: ${JSON.stringify(result.data)}`).toBe(true);
      // Die Engine spiegelt die Seite zurück, die sie tatsächlich geliefert hat.
      expect(result.data["page"], `${name} hat limit/offset nicht weitergegeben`).toEqual({
        limit: 7,
        offset: 3,
      });
    }
  });

  it("eine zu große Seite wird von der Engine abgelehnt, nicht gekürzt", async () => {
    const refused = await call("list_sites", { limit: 500 });
    expect(refused.ok).toBe(false);
    expect(JSON.stringify(refused.data)).toContain("200");
  });
});
