import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  TOKEN_AUTHOR,
  type BootEnv,
  type PageResponse,
} from "./helpers.ts";

let env: BootEnv;
let siteId: string;
let page: PageResponse;

beforeAll(async () => {
  env = await bootEngine();
  siteId = (await createTestSite(env.api, "Theme Site")).id;
});

afterAll(async () => {
  await env.close();
});

beforeEach(async () => {
  page = await createTestPage(env.api, siteId);
});

type ThemeResponse = {
  id: string;
  siteId: string;
  name: string;
  version: number;
  theme: Record<string, unknown>;
  css: string;
};

async function getTheme(): Promise<{ status: number; body: ThemeResponse }> {
  const response = await env.api.request<ThemeResponse>({
    method: "GET",
    path: `/api/sites/${siteId}/theme`,
  });
  return response;
}

async function putTheme(body: unknown): Promise<{ status: number; body: ThemeResponse }> {
  const response = await env.api.request<ThemeResponse>({
    method: "PUT",
    path: `/api/sites/${siteId}/theme`,
    body,
  });
  return response;
}

describe("site themes", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("rejects one of two concurrent changes to the same theme version", async () => {
    const fresh = await createTestSite(env.api, "Konkurrierende Variablen");
    const path = `/api/sites/${fresh.id}/theme`;
    const initial = await env.api.request<ThemeResponse>({ method: "GET", path });
    const results = await Promise.all(["#112233", "#445566"].map((brand) => env.humanApi.request({
      method: "PUT", path, body: { baseVersion: initial.body.version, theme: { scales: { brand } } },
    })));
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const after = await env.api.request<ThemeResponse>({ method: "GET", path });
    expect(after.body.version).toBe(initial.body.version + 1);
  });

  it("rejects stale theme changes without overwriting newer variables", async () => {
    const fresh = await createTestSite(env.api, "Gleichzeitige Variablen");
    const path = `/api/sites/${fresh.id}/theme`;
    const initial = await env.api.request<ThemeResponse>({ method: "GET", path });
    const first = await env.humanApi.request<ThemeResponse>({ method: "PUT", path, body: { baseVersion: initial.body.version, theme: { scales: { brand: "#123456" } } } });
    expect(first.status).toBe(200);
    const stale = await env.humanApi.request({ method: "PUT", path, body: { baseVersion: initial.body.version, theme: { scales: { brand: "#abcdef" } } } });
    expect(stale.status).toBe(409);
    const reloaded = await env.api.request<ThemeResponse>({ method: "GET", path });
    expect(reloaded.body.version).toBe(first.body.version);
    expect(reloaded.body.theme).toMatchObject({ scales: { brand: "#123456" } });
  });

  it("auto-creates a default theme with css on site creation", async () => {
    const fresh = await createTestSite(env.api, "Themed Site");
    expect(typeof fresh.themeId).toBe("string");

    const response = await env.api.request<ThemeResponse>({
      method: "GET",
      path: `/api/sites/${fresh.id}/theme`,
    });
    expect(response.status).toBe(200);
    expect(response.body.version).toBe(1);
    expect(response.body.css).toContain(":root {");
    expect(response.body.css).toContain("--fg-base:");
    expect(response.body.css).toContain('[data-theme="dark"]');
  });

  it("returns 404 for unknown sites", async () => {
    const missing = await env.api.request({
      method: "GET",
      path: "/api/sites/no-site/theme",
    });
    expect(missing.status).toBe(404);
  });

  it("merges patches, bumps the version and audits the change", async () => {
    const updated = await putTheme({
      theme: {
        scales: { brand: "#0ea5e9" },
        tokens: { semantic: { accent: { $ref: "color.brand-600" } } },
      },
      author: TEST_AUTHOR,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(2);
    expect(updated.body.css).toContain("--color-brand-500:");
    expect(updated.body.css).toMatch(/--accent: oklch\(/);

    const reloaded = await getTheme();
    expect(reloaded.body.version).toBe(2);

    // Site-level audit has no HTTP read path yet (T12 activity feed);
    // verify the entry at the store boundary instead.
    const siteAudit = await env.engine.store.listSiteAudit(siteId, 10);
    const themeEntry = siteAudit.find((entry) => entry.mutation === "update_theme");
    expect(themeEntry).toBeDefined();
    expect(themeEntry?.author).toEqual({ ...TOKEN_AUTHOR });
    expect(themeEntry?.pageId).toBeNull();
  });

  it("rejects empty patches and invalid refs", async () => {
    const empty = await putTheme({ theme: {}, author: TEST_AUTHOR });
    expect(empty.status).toBe(400);

    const unsafeSpacing = await putTheme({ theme: { tokens: { primitive: { spacing: { narrow: "1px; color: red" } } } } });
    expect(unsafeSpacing.status).toBe(400);

    const broken = await putTheme({
      theme: { tokens: { semantic: { accent: { $ref: "color.nope" } } } },
      author: TEST_AUTHOR,
    });
    expect(broken.status).toBe(400);
    const error = (broken.body as unknown as { error: Record<string, unknown> }).error;
    expect(error.category).toBe("validation");
    expect(error.field).toBe("tokens.semantic.accent");

    const badColor = await putTheme({
      theme: { tokens: { primitive: { color: { accent: "not-a-color" } } } },
      author: TEST_AUTHOR,
    });
    expect(badColor.status).toBe(400);

    const badBrand = await putTheme({
      theme: { scales: { brand: "not-a-color" } },
      author: TEST_AUTHOR,
    });
    expect(badBrand.status).toBe(400);
    expect(
      (badBrand.body as unknown as { error: { field: string } }).error.field,
    ).toBe("scales.brand");
  });

  it("accepts a theme write without a body author", async () => {
    // Since ticket 18 the token carries the identity; the body author is a
    // suggestion and may be omitted entirely.
    const response = await putTheme({ theme: { scales: { brand: "#000000" } } });
    expect(response.status).toBe(200);
  });
});

describe("theme report", () => {
  it("finds direct variable references across saved pages, style rules and theme aliases", async () => {
    const site = await createTestSite(env.api, "Variablenverwendung");
    const current = await env.api.request<ThemeResponse>({ method: "GET", path: `/api/sites/${site.id}/theme` });
    const updated = await env.humanApi.request({ method: "PUT", path: `/api/sites/${site.id}/theme`, body: {
      baseVersion: current.body.version,
      theme: { tokens: { primitive: { color: { marker: "#123456" } }, semantic: { custom: { $ref: "color.marker" } } } },
    } });
    expect(updated.status).toBe(200);
    const draft = await createTestPage(env.api, site.id);
    const inserted = await applyMutationsRequest(env.api, draft, [{
      op: "insertNode", parent: { nodeId: draft.draft.rootNodeId },
      node: { id: "variable-use", type: "block", props: { headline: "Verwendung", accent: { $token: "color.marker" } } },
    }]);
    expect(inserted.status).toBe(200);
    const second = await createTestPage(env.api, site.id, { path: "/zwei" });
    const secondInsert = await applyMutationsRequest(env.api, second, [{
      op: "insertNode", parent: { nodeId: second.draft.rootNodeId },
      node: { id: "variable-use-2", type: "block", props: { headline: "Zweite Seite", accent: { $token: "color.marker" } } },
    }]);
    expect(secondInsert.status).toBe(200);
    const rule = await env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: {
      name: "marker-regel", styles: { color: { $token: "color.marker" }, background: "var(--color-marker, #fff)", borderColor: "var(--color-marker-long)" },
    } });
    expect(rule.status).toBe(201);
    const usage = await env.api.request<{
      ref: string; pages: Array<{ pageId: string; nodes: Array<{ nodeId: string; paths: string[] }> }>;
      rules: Array<{ name: string; paths: string[] }>; themePaths: string[];
    }>({ method: "GET", path: `/api/sites/${site.id}/theme/variables/color/marker/usage` });
    expect(usage.status).toBe(200);
    expect(usage.body.ref).toBe("color.marker");
    expect(usage.body.pages).toHaveLength(2);
    expect(usage.body.pages).toEqual(expect.arrayContaining([
      { pageId: draft.id, pagePath: draft.path, nodes: [{ nodeId: "variable-use", paths: ["props.accent.$token"] }] },
      { pageId: second.id, pagePath: second.path, nodes: [{ nodeId: "variable-use-2", paths: ["props.accent.$token"] }] },
    ]));
    expect(usage.body.rules).toEqual([{ ruleId: expect.any(String), name: "marker-regel", paths: ["styles.color.$token", "styles.background"] }]);
    expect(usage.body.themePaths).toContain("tokens.semantic.custom.$ref");
    expect((await env.api.request({ method: "GET", path: `/api/sites/${site.id}/theme/variables/color/fehlend/usage` })).status).toBe(404);
    expect((await env.api.request({ method: "GET", path: `/api/sites/${site.id}/theme/variables/font/marker/usage` })).status).toBe(400);
  });

  it("lists literal colors, broken refs and contrast pairs", async () => {
    const setup = await applyMutationsRequest(env.api, page, [
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: {
          id: "report-literal",
          type: "block",
          props: { headline: "Literal", accent: "#ff0000" },
        },
      },
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: {
          id: "report-broken",
          type: "block",
          props: { headline: "Broken", accent: { $token: "color.missing" } },
        },
      },
    ]);
    expect(setup.status).toBe(200);

    const report = await env.api.request<{
      siteId: string;
      literals: { nodeId: string; prop: string; value: string }[];
      brokenRefs: { nodeId: string; prop: string; ref: string }[];
      contrast: { mode: string; foreground: string; ratio: number | null; aa: boolean | null }[];
    }>({
      method: "GET",
      path: `/api/sites/${siteId}/theme/report`,
    });
    expect(report.status).toBe(200);
    expect(report.body.siteId).toBe(siteId);
    expect(
      report.body.literals.some(
        (entry) => entry.nodeId === "report-literal" && entry.value === "#ff0000",
      ),
    ).toBe(true);
    expect(
      report.body.brokenRefs.some(
        (entry) => entry.nodeId === "report-broken" && entry.ref === "color.missing",
      ),
    ).toBe(true);
    const fgBase = report.body.contrast.find(
      (entry) => entry.mode === "light" && entry.foreground === "fg.base",
    );
    expect(fgBase?.aa).toBe(true);
    expect(typeof fgBase?.ratio).toBe("number");
    expect(
      report.body.contrast.some((entry) => entry.mode === "dark"),
    ).toBe(true);
  });
});
