import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request, type IncomingHttpHeaders } from "node:http";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  type BootEnv,
} from "./helpers.ts";

// Live events (ticket 05): GET /api/events is the SSE channel behind the live
// follow. The bus is in-process; these tests prove the route contract (headers,
// auth, site filter) and that the write handlers publish what changed.

let env: BootEnv;

beforeAll(async () => {
  env = await bootEngine();
});

afterAll(async () => {
  await env.close();
});

type Stream = {
  status: number;
  headers: IncomingHttpHeaders;
  text(): string;
  waitFor(needle: string, timeoutMs?: number): Promise<string>;
  close(): void;
};

async function openEvents(siteId: string, token = env.token): Promise<Stream> {
  const url = new URL(`/api/events?site=${encodeURIComponent(siteId)}`, env.server.origin);
  const req = request(url, { headers: { authorization: `Bearer ${token}` } });
  const chunks: string[] = [];
  let status = 0;
  let headers: IncomingHttpHeaders = {};
  const response = new Promise<void>((resolve) => {
    req.on("response", (res) => {
      status = res.statusCode ?? 0;
      headers = res.headers;
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        chunks.push(chunk);
        resolve();
      });
    });
  });
  req.end();
  await response;
  return {
    status,
    headers,
    text: () => chunks.join(""),
    async waitFor(needle, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (chunks.join("").includes(needle)) return chunks.join("");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`SSE stream did not contain ${needle}: ${chunks.join("")}`);
    },
    close: () => {
      req.destroy();
    },
  };
}

describe("engine live events", () => {
  it("streams draft.changed for the subscribed site", async () => {
    const site = await createTestSite(env.api, "Live Follow");
    const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
    const stream = await openEvents(site.id);
    expect(stream.status).toBe(200);
    expect(String(stream.headers["content-type"])).toContain("text/event-stream");

    const applied = await applyMutationsRequest(env.api, page, [
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "evt-node-01", type: "divider", props: {} },
      },
    ]);
    expect(applied.status).toBe(200);

    const text = await stream.waitFor("event: draft.changed");
    expect(text).toContain(`"pageId":"${page.id}"`);
    expect(text).toContain('"action":"insertNode"');
    expect(text).toContain('"label":"engine-tests"');
    // The new node and its parent (the root) are named for the highlight.
    expect(text).toContain('"evt-node-01"');
    expect(text).toContain(`"${page.draft.rootNodeId}"`);
    stream.close();
  });

  it("streams page.created and keeps other sites out", async () => {
    const other = await createTestSite(env.api, "Other Site");
    const site = await createTestSite(env.api, "Listener Site");
    const stream = await openEvents(site.id);

    await createTestPage(env.api, other.id, { title: "Fremd", path: "/fremd" });
    await createTestPage(env.api, site.id, { title: "Eigen", path: "/eigen" });

    const text = await stream.waitFor("event: page.created");
    expect(text).toContain(`"siteId":"${site.id}"`);
    expect(text).not.toContain(other.id);
    stream.close();
  });

  it("requires a token and refuses an unknown site", async () => {
    const site = await createTestSite(env.api, "Guarded");
    const anonymous = await openEvents(site.id, "");
    expect(anonymous.status).toBe(401);
    anonymous.close();

    const unknown = await openEvents("site-gibtsnicht");
    expect(unknown.status).toBe(404);
    unknown.close();
  });
});
