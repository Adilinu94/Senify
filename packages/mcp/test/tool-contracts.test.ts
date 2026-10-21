import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NodeTree } from "@senify/section-sdk";
import { EngineClient, toolByName, type ToolContext } from "@senify/mcp";
import { resolveNetlifyToken, resolveVercelToken } from "../../engine/src/settings.ts";
import { bootMcpEnv, createSite, type McpTestEnv } from "./helpers.ts";

// Am Tool-Vertrag prüfen, aber mit echtem HTTP-Client und echter Engine:
// ein Stub der Antwort würde verlorene Felder im Write nicht erkennen.
describe("MCP-Tool-Verträge", () => {
  let env: McpTestEnv;
  let context: ToolContext;
  let siteId: string;
  let pageId: string;
  const call = (name: string, args: Record<string, unknown> = {}) => {
    const tool = toolByName(name);
    if (tool === undefined) throw new Error(`Tool fehlt: ${name}`);
    return tool.handler(context, args);
  };
  beforeAll(async () => {
    env = await bootMcpEnv();
    context = { client: new EngineClient({ apiUrl: env.origin, token: env.token }) };
    siteId = await createSite(env, "Tool-Verträge");
    const page = await env.api.request<{ id: string }>({ method: "POST", path: `/api/sites/${siteId}/pages`, body: { title: "Start", path: "/" } });
    expect(page.status).toBe(201);
    pageId = page.body.id;
  });
  afterAll(async () => { await env.close(); });

  it("schreibt alle Motion-Optionen und entfernt danach nur die Motion", async () => {
    let page = await env.engine.store.getPage(pageId);
    const inserted = await env.api.request({ method: "POST", path: `/api/pages/${pageId}/mutations`, body: {
      baseDraftVersion: page.draftVersion,
      mutations: [{ op: "insertNode", parent: { nodeId: page.draft.rootNodeId }, node: { id: "motion-node", type: "hero", props: { headline: "Motion" } } }],
    } });
    expect(inserted.status).toBe(200);
    page = await env.engine.store.getPage(pageId);
    const spec = { preset: "fade-up", intensity: 4, trigger: "viewport", delay: 0.2, reducedMotion: "static", enabled: false, tokens: { ease: "power2.out", durationScale: 1.1, stagger: 0.1 } };
    await call("set_motion", { pageId, nodeId: "motion-node", baseDraftVersion: page.draftVersion, ...spec });
    page = await env.engine.store.getPage(pageId);
    expect(page.draft.nodes["motion-node"]?.motion).toEqual(spec);
    await call("clear_motion", { pageId, nodeId: "motion-node", baseDraftVersion: page.draftVersion });
    page = await env.engine.store.getPage(pageId);
    expect(page.draft.nodes["motion-node"]?.motion).toBeUndefined();
    expect(page.draft.nodes["motion-node"]?.props).toEqual({ headline: "Motion" });
    await call("set_motion", { pageId, nodeId: "motion-node", baseDraftVersion: page.draftVersion, preset: "fade-up" });
    expect((await env.engine.store.getPage(pageId)).draft.nodes["motion-node"]?.motion?.preset).toBe("fade-up");
  });

  it("erhält, ersetzt und löscht Deploy-Secrets ohne Klartext zurückzugeben", async () => {
    await call("set_deploy_settings", { siteId, provider: "netlify", netlifySiteId: "netlify-site", netlifyToken: "test-netlify-secret", vercelProjectId: "vercel-project", vercelToken: "test-vercel-secret" });
    const before = await env.engine.store.getNetlifyTokenEncrypted(siteId);
    expect(before).toBeTruthy();
    expect(before).not.toBe("test-netlify-secret");
    expect(await resolveNetlifyToken(env.engine.store, siteId)).toBe("test-netlify-secret");
    expect(await resolveVercelToken(env.engine.store, siteId)).toBe("test-vercel-secret");
    const view = await call("get_deploy_settings", { siteId });
    expect(view).toMatchObject({ provider: "netlify", netlifySiteId: "netlify-site", vercelProjectId: "vercel-project", hasNetlifyToken: true, hasVercelToken: true });
    expect(JSON.stringify(view)).not.toContain("test-netlify-secret");
    expect(JSON.stringify(view)).not.toContain("test-vercel-secret");
    await call("set_deploy_settings", { siteId });
    expect(await env.engine.store.getNetlifyTokenEncrypted(siteId)).toBe(before);
    await call("set_deploy_settings", { siteId, netlifyToken: "replacement-secret" });
    const replaced = await env.engine.store.getNetlifyTokenEncrypted(siteId);
    expect(replaced).toBeTruthy();
    expect(replaced).not.toBe(before);
    expect(replaced).not.toBe("replacement-secret");
    expect(await resolveNetlifyToken(env.engine.store, siteId)).toBe("replacement-secret");
    await call("set_deploy_settings", { siteId, provider: "static", netlifySiteId: null, netlifyToken: null, vercelProjectId: null, vercelToken: null });
    expect(await call("get_deploy_settings", { siteId })).toMatchObject({ provider: "static", netlifySiteId: null, vercelProjectId: null, hasNetlifyToken: false, hasVercelToken: false });
    expect(await resolveNetlifyToken(env.engine.store, siteId)).toBeNull();
    expect(await resolveVercelToken(env.engine.store, siteId)).toBeNull();
  });

  it("führt den Library-Lebenslauf durch die Tools bis zum verlustfreien Uninstall", async () => {
    const component: NodeTree = { rootNodeId: "definition", nodes: {
      definition: { id: "definition", type: "__component", props: { name: "Karte", version: 1 }, children: ["body"] },
      body: { id: "body", type: "hero", props: { headline: "Bibliothek" } },
    } };
    const promoted = await call("promote_to_library", { component, name: "Karte", fingerprint: "tool-card", tags: ["card"], license: { id: "MIT", status: "verified", note: "Test" }, notes: "Tool-Test" }) as { id: string; version: number };
    expect(promoted.version).toBe(1);
    expect(await call("get_library_component", { componentId: promoted.id })).toMatchObject({ name: "Karte", definition: component, tags: ["card"], notes: "Tool-Test" });
    expect(await call("list_library_components")).toMatchObject({ components: [expect.objectContaining({ id: promoted.id })] });
    const page = await env.engine.store.getPage(pageId);
    const installed = await call("install_library_component", { siteId, componentId: promoted.id, pageId, parentNodeId: page.draft.rootNodeId, mode: "linked" }) as { id: string };
    expect(installed.id).toBeTruthy();
    expect((await env.engine.store.listLibraryInstalls(siteId)).find((entry) => entry.id === installed.id)?.installedVersion).toBe(1);
    const updated = await env.humanApi.request({ method: "PATCH", path: `/api/library-components/${promoted.id}`, body: { notes: "Version 2", author: { kind: "human", id: "test", label: "Test" } } });
    expect(updated.status).toBe(200);
    await call("update_library_instances", { siteId, installId: installed.id });
    const installs = await env.engine.store.listLibraryInstalls(siteId);
    const latest = await call("get_library_component", { componentId: promoted.id }) as { version: number };
    expect(latest).toMatchObject({ version: 2, notes: "Version 2", definition: component });
    expect(installs.find((entry) => entry.id === installed.id)?.installedVersion).toBe(latest.version);
    expect(Object.values((await env.engine.store.getPage(pageId)).draft.nodes).some((node) => node.props.headline === "Bibliothek")).toBe(true);
    await call("uninstall_library_component", { siteId, installId: installed.id });
    const after = await env.engine.store.getPage(pageId);
    expect(Object.values(after.draft.nodes).some((node) => node.props.headline === "Bibliothek")).toBe(true);
    expect(await env.engine.store.listLibraryInstalls(siteId)).toEqual([]);
    expect(await call("library_audit")).toMatchObject({ entries: expect.arrayContaining([expect.objectContaining({ action: "installed" })]) });
    const fallback = await call("promote_to_library", { component, name: "Zweite Karte", fingerprint: "tool-card-2" });
    expect(fallback).toMatchObject({ tags: [], notes: "", license: { id: "unknown", status: "unknown" } });
  });

  it.each([
    { styles: { padding: 1 }, device: "desktop", field: "device" },
    { styles: { padding: 1 }, state: "visited", field: "state" },
    { styles: { unknownProperty: 1 }, field: "styles" },
    { styles: { padding: true }, field: "styles.padding" },
    { styles: { padding: null }, field: "styles.padding" },
    { styles: { padding: [] }, field: "styles.padding" },
  ])("verweigert ungültige Styles ohne Write: $field", async ({ field, ...args }) => {
    const page = await env.engine.store.getPage(pageId);
    const rules = await env.engine.store.listStyleRules(siteId);
    await expect(call("set_styles", { siteId, pageId, nodeId: page.draft.rootNodeId, ...args })).rejects.toMatchObject({ category: "validation", field });
    expect(await env.engine.store.listStyleRules(siteId)).toEqual(rules);
    expect((await env.engine.store.getPage(pageId)).draftVersion).toBe(page.draftVersion);
  });

  it("weist eine leere Import-Quelle vor dem Anlegen eines Jobs zurück", async () => {
    await expect(call("import_framer_page", { siteId })).rejects.toMatchObject({ category: "validation", field: "source" });
    expect(await env.engine.store.listImportJobsForSite(siteId)).toEqual([]);
  });

  it("reicht HTML-Quelle und Import-Optionen an den gespeicherten Job weiter", async () => {
    const page = await env.engine.store.getPage(pageId);
    const result = await call("import_framer_page", {
      siteId, html: '<html><body><h1>Import</h1></body></html>', baseUrl: "https://example.test/",
      pagePath: "/import", pageId, baseDraftVersion: page.draftVersion, write: false,
      applyTheme: false, assets: "skip", fonts: "skip", idempotencyKey: "tool-import-1",
    }) as { job: { id: string } };
    const jobs = await env.engine.store.listImportJobsForSite(siteId);
    expect(jobs).toHaveLength(1);
    const payload = await env.engine.store.getImportJobPayload(jobs[0]!.id);
    expect(payload).toMatchObject({ source: { html: '<html><body><h1>Import</h1></body></html>', baseUrl: "https://example.test/" }, pagePath: "/import", pageId, baseDraftVersion: page.draftVersion, write: false, applyTheme: false, assets: "skip", fonts: "skip" });
    expect(await call("get_import_report", { jobId: jobs[0]!.id })).toMatchObject({ job: { id: jobs[0]!.id, status: "succeeded" } });
    expect(result.job.id).toBe(jobs[0]!.id);
  });
});
