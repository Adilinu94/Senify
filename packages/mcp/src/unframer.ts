import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SenifyError } from "@senify/core";

type RemoteResult = { isError?: boolean; content: readonly { type: string; text?: string }[] };
export type UnframerConnection = {
  connect(): Promise<void>;
  call(name: string, args: Record<string, unknown>): Promise<RemoteResult>;
  close(): Promise<void>;
};

function connectToUnframer(url: URL): UnframerConnection {
  const client = new Client({ name: "senify-unframer", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url);
  return {
    connect: () => client.connect(transport),
    call: (name, args) => client.callTool({ name, arguments: args }) as Promise<RemoteResult>,
    close: () => client.close(),
  };
}

function textOf(result: RemoteResult): string {
  if (result.isError) throw new Error("Unframer tool failed");
  const text = result.content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n");
  if (text === "") throw new Error("Empty Unframer response");
  return text;
}

function jsonOf(text: string): Record<string, unknown> {
  for (const match of text.matchAll(/(?:^|\n)\s*\{/g)) {
    try {
      const value: unknown = JSON.parse(text.slice((match.index ?? 0) + match[0].indexOf("{")));
      if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      // Documentation can precede the JSON result and contain examples.
    }
  }
  throw new Error("Unframer returned invalid JSON");
}

function nodesIn(xml: string, section: string, element: string): { id: string; name: string }[] {
  const block = new RegExp(`<${section}\\b[^>]*>([\\s\\S]*?)</${section}>`).exec(xml)?.[1];
  if (block === undefined) throw new Error(`Unframer returned no ${section}`);
  const nodes: { id: string; name: string }[] = [];
  for (const match of block.matchAll(new RegExp(`<${element}\\b([^>]*)/?>`, "g"))) {
    const attrs = match[1] ?? "";
    const id = /\bnodeId="([^"]+)"/.exec(attrs)?.[1];
    const name = /\b(?:path|name)="([^"]+)"/.exec(attrs)?.[1];
    if (id !== undefined && name !== undefined) nodes.push({ id, name });
  }
  return nodes;
}

export async function snapshotUnframer(
  input: { secretUrl: string; sourceUrl: string; outputDir: string },
  factory: (url: URL) => UnframerConnection = connectToUnframer,
): Promise<{ path: string; pages: number; components: number; collections: number }> {
  let endpoint: URL;
  let source: URL;
  try {
    endpoint = new URL(input.secretUrl);
    source = new URL(input.sourceUrl);
  } catch {
    throw new SenifyError("validation", "Ungültiger Framer- oder Unframer-Link");
  }
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "mcp.unframer.co" || endpoint.pathname !== "/mcp" || endpoint.username || endpoint.password || !["http:", "https:"].includes(source.protocol)) {
    throw new SenifyError("validation", "Ungültiger Unframer-Zugang oder Framer-Link");
  }
  let client: UnframerConnection | undefined;
  try {
    client = factory(endpoint);
    await client.connect();
    const website = jsonOf(textOf(await client.call("getProjectWebsiteUrl", {})));
    const published = [website["production"], website["staging"]].flatMap((entry) =>
      typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>)["url"] === "string"
        ? [(entry as Record<string, string>)["url"] as string]
        : [],
    );
    if (!published.some((url) => new URL(url).origin === source.origin)) {
      throw new SenifyError("validation", "Framer-Link und Unframer-Projekt stimmen nicht überein");
    }
    const project = textOf(await client.call("getProjectXml", {}));
    const pages = nodesIn(project, "Pages", "Page");
    const components = nodesIn(project, "Components", "Component");
    const pageData = [];
    for (const page of pages) pageData.push({ ...page, xml: textOf(await client.call("getNodeXml", { nodeId: page.id })) });
    const componentData = [];
    for (const component of components) componentData.push({ ...component, xml: textOf(await client.call("getNodeXml", { nodeId: component.id })) });
    const collectionResult = jsonOf(textOf(await client.call("getCMSCollections", {})));
    const collections = collectionResult["collections"];
    if (!Array.isArray(collections)) throw new Error("Unframer returned no collection list");
    const cms = [];
    for (const collection of collections) {
      if (typeof collection !== "object" || collection === null || typeof (collection as Record<string, unknown>)["id"] !== "string") throw new Error("Invalid collection");
      const collectionId = (collection as Record<string, string>)["id"] as string;
      const items: unknown[] = [];
      let total: number;
      do {
        const batch = jsonOf(textOf(await client.call("getCMSItems", { collectionId, skip: items.length, limit: 100 })));
        const pagination = batch["pagination"] as Record<string, unknown> | undefined;
        if (!Array.isArray(batch["items"]) || typeof pagination?.["total"] !== "number") throw new Error("Invalid CMS pagination");
        total = pagination["total"];
        if (batch["items"].length === 0 && items.length < total) throw new Error("Incomplete CMS pagination");
        items.push(...batch["items"]);
      } while (items.length < total);
      cms.push({ collection, items });
    }
    const path = join(resolve(input.outputDir), "unframer-snapshot.json");
    await writeFile(path, JSON.stringify({ version: 1, source: source.origin, capturedAt: new Date().toISOString(), project, pages: pageData, components: componentData, cms }, null, 2), { encoding: "utf8", flag: "wx" });
    return { path, pages: pages.length, components: components.length, collections: cms.length };
  } catch (error) {
    if (error instanceof SenifyError) throw error;
    throw new SenifyError("validation", "Unframer-Snapshot konnte nicht erstellt werden", {
      suggestion: "Zugang, Projektverbindung und freien Zielordner prüfen.",
    });
  } finally {
    await client?.close().catch(() => undefined);
  }
}
