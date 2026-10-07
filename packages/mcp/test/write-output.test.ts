import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, EngineClient, type ToolContext } from "@senify/mcp";
import { bootMcpEnv, type McpTestEnv } from "./helpers.ts";

// P3-3 (R8), Rest: Ein Agent, der eine Seite anlegt oder ein Release
// veröffentlicht, braucht die neue ID, ohne den Textblock zu parsen. Die
// Schreibwerkzeuge, deren Antwort eine feste Form hat, deklarieren deshalb ein
// `outputSchema` und schicken `structuredContent`. Der Server schickt die
// Struktur nur, wenn der Wert das Schema erfüllt - dieser Test hält fest, dass
// das für die echten Engine-Antworten der Fall ist, nicht nur für erfundene.

type Json = Record<string, unknown>;

const WRITE_TOOLS_WITH_SCHEMA = [
  "create_site",
  "create_page",
  "create_preview",
  "submit_for_review",
  "publish_release",
  "rollback_release",
] as const;

async function connect(env: McpTestEnv): Promise<{ client: Client; close(): Promise<void> }> {
  const context: ToolContext = {
    client: new EngineClient({ apiUrl: env.origin, token: env.token }),
  };
  const server = createMcpServer({ context, onError: () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "senify-write-output-tests", version: "0.0.0" });
  await client.connect(clientTransport);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

describe("Schreibwerkzeuge mit fester Antwortform schicken structuredContent", () => {
  let env: McpTestEnv;
  let session: Awaited<ReturnType<typeof connect>>;

  // Ruft ein Werkzeug auf und liefert Struktur und Textblock getrennt, damit der
  // Test beide gegeneinander halten kann: Die Struktur darf nichts behaupten,
  // was der Text nicht sagt.
  async function call(
    name: string,
    args: Json,
  ): Promise<{ structured: Json | undefined; text: Json }> {
    const result = await session.client.callTool({ name, arguments: args });
    expect(result.isError, `${name} schlug fehl`).not.toBe(true);
    const first = (result.content as { type: string; text?: string }[])[0];
    return {
      structured: result.structuredContent as Json | undefined,
      text: JSON.parse(first?.text ?? "{}") as Json,
    };
  }

  beforeAll(async () => {
    env = await bootMcpEnv();
    session = await connect(env);
  });

  afterAll(async () => {
    await session.close();
    await env.close();
  });

  it("deklariert das outputSchema im Werkzeugkatalog", async () => {
    const listed = await session.client.listTools();
    const byName = new Map(listed.tools.map((tool) => [tool.name, tool]));
    for (const name of WRITE_TOOLS_WITH_SCHEMA) {
      const schema = byName.get(name)?.outputSchema as
        | { type?: string; required?: string[] }
        | undefined;
      expect(schema, `${name} hat kein outputSchema`).toBeDefined();
      expect(schema?.type).toBe("object");
      expect((schema?.required ?? []).length).toBeGreaterThan(0);
    }
  });

  it("liefert die neue ID aus der Struktur, ohne den Text zu parsen", async () => {
    const site = await call("create_site", { name: "Struktur" });
    expect(site.structured, "create_site schickte kein structuredContent").toEqual(site.text);
    const siteId = site.structured?.["id"];
    expect(typeof siteId).toBe("string");

    const page = await call("create_page", { siteId, title: "Start", path: "/" });
    expect(page.structured, "create_page schickte kein structuredContent").toEqual(page.text);
    expect(page.structured?.["siteId"]).toBe(siteId);
    expect(page.structured?.["path"]).toBe("/");
    expect(typeof page.structured?.["id"]).toBe("string");

    const preview = await call("create_preview", { siteId });
    expect(preview.structured, "create_preview schickte kein structuredContent").toEqual(
      preview.text,
    );
    expect(typeof preview.structured?.["url"]).toBe("string");
    expect(typeof (preview.structured?.["preview"] as Json)["id"]).toBe("string");

    const submitted = await call("submit_for_review", { siteId });
    expect(
      submitted.structured,
      "submit_for_review schickte kein structuredContent",
    ).toEqual(submitted.text);
    const review = submitted.structured?.["review"] as Json;
    expect(typeof review["id"]).toBe("string");
    expect(typeof review["status"]).toBe("string");

    const published = await call("publish_release", { siteId });
    expect(
      published.structured,
      "publish_release schickte kein structuredContent",
    ).toEqual(published.text);
    const release = published.structured?.["release"] as Json;
    expect(typeof release["id"]).toBe("string");
    expect(release["siteId"]).toBe(siteId);

    // Der Rollback antwortet wie die Veröffentlichung: ein neues Release, das
    // auf das zurückgerollte zeigt.
    const rolledBack = await call("rollback_release", {
      siteId,
      releaseId: release["id"],
    });
    expect(
      rolledBack.structured,
      "rollback_release schickte kein structuredContent",
    ).toEqual(rolledBack.text);
    const restored = rolledBack.structured?.["release"] as Json;
    expect(typeof restored["id"]).toBe("string");
    expect(restored["id"]).not.toBe(release["id"]);
    expect(restored["basisReleaseId"]).toBe(release["id"]);
    // Vorschau, Review und Release backen echte Builds; das dauert länger als
    // das Standard-Zeitlimit von 5 s.
  }, 60_000);
});
