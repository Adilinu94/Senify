import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootEngine, type BootEnv } from "./helpers.ts";

let env: BootEnv;

beforeAll(async () => {
  env = await bootEngine();
});

afterAll(async () => {
  await env.close();
});

describe("sites", () => {
  it("creates a site with auto slug", async () => {
    const response = await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "Agentur Müller" },
    });
    expect(response.status).toBe(201);
    const site = response.body as Record<string, unknown>;
    expect(site.name).toBe("Agentur Müller");
    expect(site.slug).toBe("agentur-mueller");
    expect(site.profile).toBe("standard");
    expect(typeof site.themeId).toBe("string");
    expect(typeof site.id).toBe("string");
  });

  it("creates a site with explicit slug and profile", async () => {
    const response = await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "Showcase", slug: "showcase", profile: "showcase" },
    });
    expect(response.status).toBe(201);
    const site = response.body as Record<string, unknown>;
    expect(site.slug).toBe("showcase");
    expect(site.profile).toBe("showcase");
  });

  it("rejects duplicate explicit slugs with 409", async () => {
    const first = await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "Dup", slug: "dup-site" },
    });
    expect(first.status).toBe(201);
    const second = await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "Dup Again", slug: "dup-site" },
    });
    expect(second.status).toBe(409);
    const error = (second.body as { error: Record<string, unknown> }).error;
    expect(error.category).toBe("conflict");
    expect(error.field).toBe("slug");
    expect(error.suggestion).toBeDefined();
  });

  it("rejects empty names and unknown profiles with 400", async () => {
    const empty = await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "   " },
    });
    expect(empty.status).toBe(400);
    expect((empty.body as { error: { field: string } }).error.field).toBe("name");

    const profile = await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "X", profile: "wild" },
    });
    expect(profile.status).toBe(400);
    expect((profile.body as { error: { field: string } }).error.field).toBe("profile");
  });

  it("lists, loads and deletes sites", async () => {
    const created = await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "Lifecycle" },
    });
    const site = created.body as { id: string };

    const list = await env.api.request({ method: "GET", path: "/api/sites" });
    expect(list.status).toBe(200);
    const sites = (list.body as { sites: { id: string }[] }).sites;
    expect(sites.some((entry) => entry.id === site.id)).toBe(true);

    const loaded = await env.api.request({
      method: "GET",
      path: `/api/sites/${site.id}`,
    });
    expect(loaded.status).toBe(200);

    const removed = await env.api.request({
      method: "DELETE",
      path: `/api/sites/${site.id}`,
    });
    expect(removed.status).toBe(204);

    const gone = await env.api.request({
      method: "GET",
      path: `/api/sites/${site.id}`,
    });
    expect(gone.status).toBe(404);
    expect((gone.body as { error: { category: string } }).error.category).toBe(
      "not_found",
    );
  });
});

describe("pages", () => {
  it("creates the first page at / with a page root", async () => {
    const site = (await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "Page Root Site" },
    })).body as { id: string };

    const response = await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: {},
    });
    expect(response.status).toBe(201);
    const page = response.body as {
      path: string;
      title: string;
      draftVersion: number;
      draft: { rootNodeId: string; nodes: Record<string, { type: string }> };
    };
    expect(page.path).toBe("/");
    expect(page.title).toBe("Neue Seite");
    expect(page.draftVersion).toBe(1);
    const root = page.draft.nodes[page.draft.rootNodeId];
    expect(root?.type).toBe("page");
  });

  it("derives unique paths from the title", async () => {
    const site = (await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "Paths Site" },
    })).body as { id: string };

    const first = (await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "Start" },
    })).body as { path: string };
    expect(first.path).toBe("/");

    const second = (await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "Über uns" },
    })).body as { path: string };
    expect(second.path).toBe("/ueber-uns");

    const third = (await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "Über uns" },
    })).body as { path: string };
    expect(third.path).toBe("/ueber-uns-2");
  });

  it("rejects duplicate explicit paths and invalid paths", async () => {
    const site = (await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "Conflict Site" },
    })).body as { id: string };

    const first = await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "A", path: "/kontakt" },
    });
    expect(first.status).toBe(201);

    const duplicate = await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "B", path: "/kontakt" },
    });
    expect(duplicate.status).toBe(409);
    const error = (duplicate.body as { error: Record<string, unknown> }).error;
    expect(error.category).toBe("conflict");
    expect(error.field).toBe("path");

    const invalid = await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "C", path: "no-leading-slash" },
    });
    expect(invalid.status).toBe(400);
  });

  it("lists summaries without the tree and deletes pages", async () => {
    const site = (await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "Listing Site" },
    })).body as { id: string };

    await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "One" },
    });
    const second = (await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/pages`,
      body: { title: "Two" },
    })).body as { id: string };

    const list = await env.api.request({
      method: "GET",
      path: `/api/sites/${site.id}/pages`,
    });
    expect(list.status).toBe(200);
    const pages = (list.body as { pages: Record<string, unknown>[] }).pages;
    expect(pages).toHaveLength(2);
    for (const entry of pages) {
      expect("draft" in entry).toBe(false);
      expect(entry.title).toBeDefined();
    }

    const removed = await env.api.request({
      method: "DELETE",
      path: `/api/pages/${second.id}`,
    });
    expect(removed.status).toBe(204);

    const gone = await env.api.request({
      method: "GET",
      path: `/api/pages/${second.id}`,
    });
    expect(gone.status).toBe(404);
  });

  it("returns 404 when the site or page does not exist", async () => {
    const missingSite = await env.api.request({
      method: "POST",
      path: "/api/sites/no-such-site/pages",
      body: {},
    });
    expect(missingSite.status).toBe(404);

    const missingPages = await env.api.request({
      method: "GET",
      path: "/api/sites/no-such-site/pages",
    });
    expect(missingPages.status).toBe(404);

    const missingPage = await env.api.request({
      method: "GET",
      path: "/api/pages/no-such-page",
    });
    expect(missingPage.status).toBe(404);
  });
});
