import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import type { NodeTree } from "@senify/section-sdk";
import { bakePages, type Page, type Site } from "@senify/engine";
import { assertAllowedOrigin, FormRejection } from "../src/forms.ts";
import { bootEngine, type BootEnv, type ErrorResponse } from "./helpers.ts";

// Per-site public address (`baseUrl`): the origin visitors open the site
// under. It feeds canonical/og:url/sitemap/robots and the form origin check;
// without it the placeholder `https://<slug>.senify.xyz` stays in force.

let env: BootEnv;
const outDirs: string[] = [];

beforeAll(async () => {
  env = await bootEngine();
}, 300000);

afterAll(async () => {
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
  if (env) await env.close();
});

async function newSite(name: string): Promise<{ id: string }> {
  const response = await env.api.request({
    method: "POST",
    path: "/api/sites",
    body: { name },
  });
  expect(response.status).toBe(201);
  return response.body as { id: string };
}

async function patchBaseUrl(
  siteId: string,
  baseUrl: unknown,
): Promise<{ status: number; body: Site & ErrorResponse }> {
  return env.api.request<Site & ErrorResponse>({
    method: "PATCH",
    path: `/api/sites/${siteId}`,
    body: { baseUrl },
  });
}

describe("site address (PATCH /api/sites/:siteId)", () => {
  it.each([
    ["https://www.kunde.de", "https://www.kunde.de"],
    ["WWW.Kunde.DE", "https://www.kunde.de"],
    ["kunde.de", "https://kunde.de"],
    ["  kunde.de  ", "https://kunde.de"],
    ["kunde.de:8443", "https://kunde.de:8443"],
    ["https://kunde.de/", "https://kunde.de"],
    ["https://kunde.de:443", "https://kunde.de"],
    ["https://münchen.de", "https://xn--mnchen-3ya.de"],
  ])("normalizes %j to %j", async (input, expected) => {
    const site = await newSite("Adresse");
    const response = await patchBaseUrl(site.id, input);
    expect(response.status).toBe(200);
    expect(response.body.baseUrl).toBe(expected);

    const loaded = await env.api.request<Site>({
      method: "GET",
      path: `/api/sites/${site.id}`,
    });
    expect(loaded.body.baseUrl).toBe(expected);
  });

  it("starts without an address and clears it again", async () => {
    const site = await newSite("Adresse leeren");
    const fresh = await env.api.request<Site>({
      method: "GET",
      path: `/api/sites/${site.id}`,
    });
    expect(fresh.body.baseUrl).toBeUndefined();

    for (const clearing of [null, "", "   "]) {
      expect((await patchBaseUrl(site.id, "kunde.de")).body.baseUrl).toBe(
        "https://kunde.de",
      );
      const cleared = await patchBaseUrl(site.id, clearing);
      expect(cleared.status).toBe(200);
      expect(cleared.body.baseUrl).toBeUndefined();
    }
  });

  it.each([
    "http://kunde.de",
    "ftp://kunde.de",
    "javascript:alert(1)",
    "data:text/html,x",
    "https://kunde.de/pfad",
    "https://kunde.de?x=1",
    "https://kunde.de#anker",
    "https://user:pass@kunde.de",
    "intranet",
    "https://",
    "kunde .de",
  ])("rejects %j with 400 on field baseUrl", async (input) => {
    const site = await newSite("Adresse falsch");
    const response = await patchBaseUrl(site.id, input);
    expect(response.status).toBe(400);
    expect(response.body.error.category).toBe("validation");
    expect(response.body.error.field).toBe("baseUrl");
    // The address validator speaks, not the schema's "unknown property" error.
    expect(response.body.error.message).toMatch(/site address/i);
    expect(response.body.error.suggestion).toMatch(/https/);

    const loaded = await env.api.request<Site>({
      method: "GET",
      path: `/api/sites/${site.id}`,
    });
    expect(loaded.body.baseUrl).toBeUndefined();
  });

  it("records the change in the site activity", async () => {
    const site = await newSite("Adresse Aktivität");
    await patchBaseUrl(site.id, "kunde.de");
    const audit = await env.api.request<{ entries: { mutation: string }[] }>({
      method: "GET",
      path: `/api/sites/${site.id}/audit?limit=5`,
    });
    expect(
      audit.body.entries.some((entry) => entry.mutation === "update_site_base_url"),
    ).toBe(true);
  });

  it("is not copied by duplicating the site", async () => {
    const site = await newSite("Adresse Original");
    await patchBaseUrl(site.id, "kunde.de");
    for (const withContent of [true, false]) {
      const copy = await env.api.request<Site>({
        method: "POST",
        path: `/api/sites/${site.id}/duplicate`,
        body: { withContent },
      });
      expect(copy.status).toBe(201);
      const loaded = await env.api.request<Site>({
        method: "GET",
        path: `/api/sites/${copy.body.id}`,
      });
      expect(loaded.body.baseUrl).toBeUndefined();
    }
  });

  it("still rejects an update that carries nothing at all", async () => {
    const site = await newSite("Adresse leer");
    const response = await env.api.request<ErrorResponse>({
      method: "PATCH",
      path: `/api/sites/${site.id}`,
      body: {},
    });
    expect(response.status).toBe(400);
    expect(response.body.error.field).toBe("body");
  });
});

function heroTree(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {}, children: ["hero"] },
      hero: { id: "hero", type: "hero", props: { headline: "Willkommen" } },
    },
  };
}

async function bakeFor(
  site: Site,
  ogImage?: string,
): Promise<ReturnType<typeof loadBakedSite>> {
  const store = env.engine.store;
  let stored = (await store.listPageDrafts(site.id))[0];
  if (stored === undefined) {
    const created = await store.createPage(site.id, { title: "Start", path: "/" });
    await store.updatePage(created.id, created.draftVersion, {
      draft: heroTree(),
      title: "Start",
      path: "/",
    });
    stored = await store.getPage(created.id);
  }
  const page: Page =
    ogImage === undefined
      ? stored
      : { ...stored, meta: { ...stored.meta, ogImage } };
  const outDir = mkdtempSync(join(env.engine.dataDir, "domain-bake-"));
  outDirs.push(outDir);
  const result = await bakePages(store, {
    site,
    pages: [page],
    outDir,
    dataDir: env.engine.dataDir,
  });
  return loadBakedSite(result.outDir);
}

describe("site address in the baked release", () => {
  it("uses the configured address for canonical, og:url, sitemap and robots", async () => {
    const created = await newSite("Kunde Bake");
    await patchBaseUrl(created.id, "https://kunde.de");
    const site = await env.engine.store.getSite(created.id);
    const baked = await bakeFor(site);

    const html = await baked.read("index.html");
    expect(html).toContain('<link rel="canonical" href="https://kunde.de/"');
    expect(html).toContain('<meta property="og:url" content="https://kunde.de/"');
    expect(html).not.toContain("senify.xyz");
    expect(await baked.read("sitemap.xml")).toContain("<loc>https://kunde.de/</loc>");
    expect(await baked.read("robots.txt")).toContain(
      "Sitemap: https://kunde.de/sitemap.xml",
    );
  });

  it("keeps the senify.xyz placeholder while no address is set", async () => {
    const created = await newSite("Ohne Adresse");
    const site = await env.engine.store.getSite(created.id);
    const baked = await bakeFor(site);

    const html = await baked.read("index.html");
    expect(html).toContain(`https://${site.slug}.senify.xyz/`);
  });

  it("makes a relative og:image absolute and leaves an absolute one alone", async () => {
    const created = await newSite("Kunde OG");
    await patchBaseUrl(created.id, "kunde.de");
    const site = await env.engine.store.getSite(created.id);

    const relative = await bakeFor(site, "/assets/titel.png");
    expect(await relative.read("index.html")).toContain(
      '<meta property="og:image" content="https://kunde.de/assets/titel.png"',
    );

    const absolute = await bakeFor(site, "https://cdn.example/titel.png");
    expect(await absolute.read("index.html")).toContain(
      '<meta property="og:image" content="https://cdn.example/titel.png"',
    );
  });
});

describe("site address in the form origin check", () => {
  function reject(origin: string, siteBaseUrl?: string): FormRejection | undefined {
    try {
      assertAllowedOrigin({
        origin,
        requestHost: "engine.internal",
        siteSlug: "kunde",
        ...(siteBaseUrl === undefined ? {} : { siteBaseUrl }),
      });
      return undefined;
    } catch (error) {
      if (error instanceof FormRejection) return error;
      throw error;
    }
  }

  const saved = process.env.SENIFY_FORMS_ORIGINS;
  beforeAll(() => {
    delete process.env.SENIFY_FORMS_ORIGINS;
  });
  afterAll(() => {
    if (saved !== undefined) process.env.SENIFY_FORMS_ORIGINS = saved;
  });

  it("accepts the host of the configured address, case-insensitively", () => {
    expect(reject("https://www.kunde.de", "https://www.kunde.de")).toBeUndefined();
    expect(reject("https://WWW.Kunde.DE", "https://www.kunde.de")).toBeUndefined();
  });

  it("keeps apex and www apart", () => {
    expect(reject("https://kunde.de", "https://www.kunde.de")).toBeDefined();
    expect(reject("https://www.kunde.de", "https://kunde.de")).toBeDefined();
  });

  it("rejects a foreign origin without or with an address", () => {
    expect(reject("https://www.kunde.de")).toBeDefined();
    expect(reject("https://boese.example", "https://www.kunde.de")).toBeDefined();
  });

  it("still allows the placeholder host of the site", () => {
    expect(reject("https://kunde.senify.xyz", "https://www.kunde.de")).toBeUndefined();
  });
});
