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

describe("project management (rename, trash, duplicate)", () => {
  const author = { kind: "human", id: "operator", label: "Operator" } as const;

  async function createSite(name: string): Promise<{ id: string }> {
    const response = await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name },
    });
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  it("renames a site and records the activity", async () => {
    const site = await createSite("Rename Me");
    const renamed = await env.api.request({
      method: "PATCH",
      path: `/api/sites/${site.id}`,
      body: { name: "Umbenannt", author },
    });
    expect(renamed.status).toBe(200);
    expect((renamed.body as { name: string }).name).toBe("Umbenannt");

    const audit = await env.api.request({
      method: "GET",
      path: `/api/sites/${site.id}/audit?limit=5`,
    });
    const entries = (audit.body as { entries: { mutation: string }[] }).entries;
    expect(entries.some((entry) => entry.mutation === "rename_site")).toBe(true);
  });

  it("trashes, lists and restores a project", async () => {
    const site = await createSite("Trash Me");
    const trashed = await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/trash`,
      body: { author },
    });
    expect(trashed.status).toBe(200);

    const list = await env.api.request({ method: "GET", path: "/api/sites" });
    const active = (list.body as { sites: { id: string }[] }).sites;
    expect(active.some((entry) => entry.id === site.id)).toBe(false);

    const trashList = await env.api.request({
      method: "GET",
      path: "/api/sites?trash=1",
    });
    const trashedSites = (
      trashList.body as { sites: { id: string; trashedAt: string }[] }
    ).sites;
    const listed = trashedSites.find((entry) => entry.id === site.id);
    expect(listed).toBeDefined();
    expect(typeof listed?.trashedAt).toBe("string");

    const again = await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/trash`,
      body: { author },
    });
    expect(again.status).toBe(409);
    expect((again.body as { error: { category: string } }).error.category).toBe(
      "conflict",
    );

    const restored = await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/restore`,
      body: { author },
    });
    expect(restored.status).toBe(200);

    const relisted = await env.api.request({ method: "GET", path: "/api/sites" });
    expect(
      (relisted.body as { sites: { id: string }[] }).sites.some(
        (entry) => entry.id === site.id,
      ),
    ).toBe(true);

    const notTrashed = await env.api.request({
      method: "POST",
      path: `/api/sites/${site.id}/restore`,
      body: { author },
    });
    expect(notTrashed.status).toBe(404);
  });

  it("duplicates a project with pages, theme and optional content", async () => {
    const source = await createSite("Original");
    const page = await env.api.request({
      method: "POST",
      path: `/api/sites/${source.id}/pages`,
      body: {},
    });
    expect(page.status).toBe(201);

    const collection = await env.api.request<{ id: string }>({
      method: "POST",
      path: `/api/sites/${source.id}/collections`,
      body: {
        name: "Notizen",
        slug: "notizen",
        fields: [
          {
            id: "body",
            key: "body",
            label: "Inhalt",
            type: "richtext",
            description: "Markdown-Inhalt der Notiz.",
          },
        ],
      },
    });
    expect(collection.status).toBe(201);
    const entry = await env.api.request({
      method: "POST",
      path: `/api/sites/${source.id}/entries`,
      body: {
        collectionId: collection.body.id,
        cells: { title: "Notiz Eins", body: "Hallo Welt" },
        author,
      },
    });
    expect(entry.status).toBe(201);

    const copied = await env.api.request<{
      id: string;
      name: string;
      slug: string;
      themeId: string;
    }>({
      method: "POST",
      path: `/api/sites/${source.id}/duplicate`,
      body: { withContent: true, author },
    });
    expect(copied.status).toBe(201);
    expect(copied.body.name).toBe("Original (Kopie)");
    expect(copied.body.slug).toBe("original-kopie");
    expect(copied.body.id).not.toBe(source.id);
    expect(typeof copied.body.themeId).toBe("string");

    const pages = await env.api.request<{
      pages: { id: string; path: string }[];
    }>({ method: "GET", path: `/api/sites/${copied.body.id}/pages` });
    expect(pages.body.pages.map((item) => item.path)).toEqual(["/"]);

    const entries = await env.api.request<{
      entries: { status: string }[];
    }>({ method: "GET", path: `/api/sites/${copied.body.id}/entries` });
    expect(entries.body.entries).toHaveLength(1);
    expect(entries.body.entries[0]?.status).toBe("draft");

    // Structure-only copies the collection schema but no entries.
    const structural = await env.api.request<{ id: string }>({
      method: "POST",
      path: `/api/sites/${source.id}/duplicate`,
      body: { withContent: false, author },
    });
    expect(structural.status).toBe(201);
    const structuralCollections = await env.api.request<{ collections: unknown[] }>(
      { method: "GET", path: `/api/sites/${structural.body.id}/collections` },
    );
    expect(structuralCollections.body.collections).toHaveLength(1);
    const structuralEntries = await env.api.request<{ entries: unknown[] }>({
      method: "GET",
      path: `/api/sites/${structural.body.id}/entries`,
    });
    expect(structuralEntries.body.entries).toHaveLength(0);
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
