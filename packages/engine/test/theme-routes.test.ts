import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
} from "./helpers.ts";
import { themeRoutes } from "../src/http-routes-theme.ts";

let env: BootEnv;

beforeAll(async () => {
  env = await bootEngine();
});

afterAll(async () => {
  await env.close();
});

function route(method: string, last: string) {
  const found = themeRoutes.find((entry) => entry.method === method && entry.segments.at(-1) === last);
  if (found === undefined) throw new Error(`Route fehlt: ${method} ${last}`);
  return found;
}

describe("Theme-Routen", () => {
  it("liefert das CSS und den Bericht", async () => {
    const site = await createTestSite(env.api, "Theme-Routen");
    const css = await env.api.request<unknown>({ method: "GET", path: `/api/sites/${site.id}/theme.css` });
    expect(css.status).toBe(200);
    expect(css.headers["content-type"]).toContain("text/css");
    expect(css.headers["cache-control"]).toBe("no-store");
    const report = await env.api.request<unknown>({ method: "GET", path: `/api/sites/${site.id}/theme/report` });
    expect(report.status).toBe(200);
  });

  it("meldet fehlende Site-IDs an den Handlern", async () => {
    for (const [method, last] of [["GET", "theme"], ["GET", "theme.css"], ["PUT", "theme"], ["GET", "report"]] as const) {
      const handler = route(method, last).handler;
      await expect(Promise.resolve(handler({} as never, {} as never, {} as never, {} as never, {} as never))).rejects.toMatchObject({ category: "validation" });
    }
  });

  it("zeigt die Verwendung einer globalen Klasse und lehnt andere Regeln ab", async () => {
    const site = await createTestSite(env.api, "Klassen-Nutzung");
    const page = await createTestPage(env.api, site.id);
    const rule = await env.engine.store.createStyleRule(site.id, { name: "cta" }, TEST_AUTHOR);
    const frame = await applyMutationsRequest(env.api, page, [
      { op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { id: "frame00001", type: "frame" } } as never,
    ]);
    expect(frame.status).toBe(200);
    const inserted = await applyMutationsRequest(env.api, page, [
      { op: "insertNode", parent: { nodeId: "frame00001" }, node: { id: "head000001", type: "heading", props: { text: "Hallo" } } } as never,
    ], { baseDraftVersion: frame.body.newDraftVersion });
    expect(inserted.status).toBe(200);
    const assigned = await applyMutationsRequest(env.api, page, [
      { op: "updateNodeMeta", id: "head000001", meta: { classes: [rule.name] } } as never,
    ], { baseDraftVersion: inserted.body.newDraftVersion });
    expect(assigned.status).toBe(200);
    const usage = await env.api.request<{ ruleId: string; name: string; usage: { pageId: string }[] }>({
      method: "GET",
      path: `/api/sites/${site.id}/style-rules/${rule.id}/usage`,
    });
    expect(usage.status).toBe(200);
    expect(usage.body.name).toBe("cta");
    expect(usage.body.usage.map((entry) => entry.pageId)).toContain(page.id);
    const ambient = await env.engine.store.createStyleRule(site.id, { name: "frei", kind: "ambient", selector: ".frei" }, { kind: "human", id: "tester", label: "Tester" });
    const rejected = await env.api.request<unknown>({ method: "GET", path: `/api/sites/${site.id}/style-rules/${ambient.id}/usage` });
    expect(rejected.status).toBe(400);
  });

  it("löscht und stellt eine globale Klasse über die Routen wieder her", async () => {
    const site = await createTestSite(env.api, "Klassen-Routen");
    const page = await createTestPage(env.api, site.id);
    const rule = await env.engine.store.createStyleRule(site.id, { name: "wieder" }, TEST_AUTHOR);
    const registry = await env.api.request<{ version: number }>({ method: "GET", path: `/api/sites/${site.id}/style-rules` });
    const deleted = await env.api.request<{ receiptId: string; version: number; pageDraftVersion: number }>({
      method: "POST",
      path: `/api/sites/${site.id}/style-rules/${rule.id}/delete-globally`,
      body: {
        receiptId: "r".repeat(16),
        baseVersion: registry.body.version,
        pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion },
        author: TEST_AUTHOR,
      },
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.receiptId).toBe("r".repeat(16));
    const restored = await env.api.request<{ version: number }>({
      method: "POST",
      path: `/api/sites/${site.id}/style-rules/${rule.id}/restore-globally`,
      body: {
        receiptId: deleted.body.receiptId,
        baseVersion: deleted.body.version,
        pageContext: { pageId: page.id, baseDraftVersion: deleted.body.pageDraftVersion },
        author: TEST_AUTHOR,
      },
    });
    expect(restored.status).toBe(200);
    expect(restored.headers["x-senify-style-version"]).toBe(String(restored.body.version));
  });
});
