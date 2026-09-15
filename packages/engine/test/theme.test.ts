import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
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
    expect(themeEntry?.author).toEqual({ ...TEST_AUTHOR });
    expect(themeEntry?.pageId).toBeNull();
  });

  it("rejects empty patches and invalid refs", async () => {
    const empty = await putTheme({ theme: {}, author: TEST_AUTHOR });
    expect(empty.status).toBe(400);

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

  it("requires an author", async () => {
    const response = await putTheme({ theme: { scales: { brand: "#000000" } } });
    expect(response.status).toBe(400);
  });
});

describe("theme report", () => {
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
