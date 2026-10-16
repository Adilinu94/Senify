import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadBakedSite } from "@senify/core/testing";
import type { NodeTree } from "@senify/section-sdk";
import { bakePages, type Page, type Site } from "@senify/engine";
import { bootEngine, type BootEnv, type ErrorResponse } from "./helpers.ts";

// Breakpoints per site (ADR-0020): two whole-pixel numbers, tablet and mobile.
// Absent means the platform default (1024 / 640). The pair is stored on the
// site, checked against guard rails, copied by a duplicate and read by every
// bake of the site.

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
  const response = await env.api.request({ method: "POST", path: "/api/sites", body: { name } });
  expect(response.status).toBe(201);
  return response.body as { id: string };
}

function patch(siteId: string, body: unknown): Promise<{ status: number; body: Site & ErrorResponse }> {
  return env.api.request<Site & ErrorResponse>({ method: "PATCH", path: `/api/sites/${siteId}`, body });
}

async function load(siteId: string): Promise<Site> {
  const response = await env.api.request<Site>({ method: "GET", path: `/api/sites/${siteId}` });
  expect(response.status).toBe(200);
  return response.body;
}

describe("site breakpoints (PATCH /api/sites/:siteId)", () => {
  it("starts without a pair, stores one and clears it again", async () => {
    const site = await newSite("Breakpoints speichern");
    expect((await load(site.id)).breakpoints).toBeUndefined();

    const set = await patch(site.id, { breakpoints: { tablet: 1200, mobile: 810 } });
    expect(set.status).toBe(200);
    expect(set.body.breakpoints).toEqual({ tablet: 1200, mobile: 810 });
    expect((await load(site.id)).breakpoints).toEqual({ tablet: 1200, mobile: 810 });

    const cleared = await patch(site.id, { breakpoints: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.breakpoints).toBeUndefined();
    expect((await load(site.id)).breakpoints).toBeUndefined();
  });

  it("can be sent next to other site fields in one request", async () => {
    const site = await newSite("Breakpoints und Name");
    const response = await patch(site.id, { name: "Breakpoints und Name 2", breakpoints: { tablet: 900, mobile: 600 } });
    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Breakpoints und Name 2");
    expect(response.body.breakpoints).toEqual({ tablet: 900, mobile: 600 });
  });

  it.each([
    [{ tablet: 900, mobile: 900 }, /at least 120 px larger/],
    [{ tablet: 700, mobile: 640 }, /at least 120 px larger/],
    [{ tablet: 640, mobile: 400 }, /tablet breakpoint must lie between 641 and 1600/],
    [{ tablet: 1601, mobile: 640 }, /tablet breakpoint must lie between 641 and 1600/],
    [{ tablet: 1024, mobile: 319 }, /mobile breakpoint must lie between 320 and 900/],
    [{ tablet: 1600, mobile: 901 }, /mobile breakpoint must lie between 320 and 900/],
    [{ tablet: 1024.5, mobile: 640 }, /whole numbers/],
  ])("rejects %j with 400 on field breakpoints", async (breakpoints, message) => {
    const site = await newSite("Breakpoints falsch");
    const response = await patch(site.id, { breakpoints });
    expect(response.status).toBe(400);
    expect(response.body.error.category).toBe("validation");
    expect(response.body.error.field).toBe("breakpoints");
    expect(response.body.error.message).toMatch(message);
    expect(response.body.error.suggestion).toMatch(/breakpoints/);
    expect((await load(site.id)).breakpoints).toBeUndefined();
  });

  it.each([{ tablet: 1024 }, { tablet: "1024", mobile: 640 }, { tablet: 1024, mobile: 640, desktop: 1440 }, "1024"])(
    "rejects the malformed shape %j and keeps the stored pair",
    async (breakpoints) => {
      const site = await newSite("Breakpoints Form");
      await patch(site.id, { breakpoints: { tablet: 1100, mobile: 700 } });
      const response = await patch(site.id, { breakpoints });
      expect(response.status).toBe(400);
      expect((await load(site.id)).breakpoints).toEqual({ tablet: 1100, mobile: 700 });
    },
  );

  it("records the change in the site activity", async () => {
    const site = await newSite("Breakpoints Aktivität");
    await patch(site.id, { breakpoints: { tablet: 1200, mobile: 810 } });
    const audit = await env.api.request<{ entries: { mutation: string }[] }>({
      method: "GET",
      path: `/api/sites/${site.id}/audit?limit=5`,
    });
    expect(audit.body.entries.some((entry) => entry.mutation === "update_site_breakpoints")).toBe(true);
  });

  it("is copied by duplicating the site, with and without content", async () => {
    const site = await newSite("Breakpoints Original");
    await patch(site.id, { breakpoints: { tablet: 1200, mobile: 810 } });
    for (const withContent of [true, false]) {
      const copy = await env.api.request<Site>({
        method: "POST",
        path: `/api/sites/${site.id}/duplicate`,
        body: { withContent },
      });
      expect(copy.status).toBe(201);
      expect((await load(copy.body.id)).breakpoints).toEqual({ tablet: 1200, mobile: 810 });
    }
  });

  it("leaves the copy of a site without a pair without one", async () => {
    const site = await newSite("Breakpoints Standard");
    const copy = await env.api.request<Site>({
      method: "POST",
      path: `/api/sites/${site.id}/duplicate`,
      body: { withContent: false },
    });
    expect(copy.status).toBe(201);
    expect((await load(copy.body.id)).breakpoints).toBeUndefined();
  });

  it("reads a stored pair that no longer passes the check as no pair", async () => {
    const site = await newSite("Breakpoints defekt");
    await env.engine.store.updateSiteBreakpoints(site.id, { tablet: 1200, mobile: 810 });
    // Written behind the API's back (an older limit, a hand edit): the bake
    // must not break on it.
    await env.db.query(`UPDATE sites SET breakpoints_json = $2 WHERE id = $1`, [
      site.id,
      JSON.stringify({ tablet: 3000, mobile: 10 }),
    ]);
    expect((await load(site.id)).breakpoints).toBeUndefined();
  });
});

function pageTree(): NodeTree {
  return {
    rootNodeId: "root",
    nodes: {
      root: { id: "root", type: "page", props: {}, children: ["hero"] },
      hero: {
        id: "hero",
        type: "hero",
        props: { headline: "Willkommen" },
        overrides: {
          tablet: { props: { paddingY: { $token: "space.8" } } },
          mobile: { props: { cardPadding: "12px" } },
        },
      },
    },
  };
}

async function bake(site: Site): Promise<ReturnType<typeof loadBakedSite>> {
  const store = env.engine.store;
  const created = await store.createPage(site.id, { title: "Start", path: "/" });
  await store.updatePage(created.id, created.draftVersion, { draft: pageTree(), title: "Start", path: "/" });
  const page: Page = await store.getPage(created.id);
  const outDir = mkdtempSync(join(env.engine.dataDir, "breakpoints-bake-"));
  outDirs.push(outDir);
  const result = await bakePages(store, { site, pages: [page], outDir, dataDir: env.engine.dataDir });
  return loadBakedSite(result.outDir);
}

describe("site breakpoints in the baked release", () => {
  it("bakes the media queries with the site's numbers", async () => {
    const created = await newSite("Breakpoints Bake");
    await patch(created.id, { breakpoints: { tablet: 1200, mobile: 810 } });
    const baked = await bake(await env.engine.store.getSite(created.id));

    const css = await baked.read("assets/sections.css");
    expect(css).toContain("@media (max-width: 1199.98px)");
    expect(css).toContain("@media (max-width: 809.98px)");
    expect(css).not.toContain("1023.98");
    expect(css).not.toContain("639.98");
  }, 180000);

  it("keeps 1024 and 640 for a site without a pair", async () => {
    const created = await newSite("Breakpoints Standard Bake");
    const baked = await bake(await env.engine.store.getSite(created.id));

    const css = await baked.read("assets/sections.css");
    expect(css).toContain("@media (max-width: 1023.98px)");
    expect(css).toContain("@media (max-width: 639.98px)");
  }, 180000);
});
