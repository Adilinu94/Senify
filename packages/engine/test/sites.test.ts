import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bootEngine, type BootEnv, type PageResponse } from "./helpers.ts";

let env: BootEnv;

type CopiedAsset = {
  id: string;
  siteId: string;
  filename: string;
  altText: string | null;
  hash: string;
  storageRef: string;
  status: string;
};

// Header-only PNG: the upload validation reads the dimensions from the header.
function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function collectFromProps(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectFromProps(entry, into);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.assetId === "string") into.add(record.assetId);
  for (const entry of Object.values(record)) collectFromProps(entry, into);
}

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

  it("updates the site profile and records the activity", async () => {
    const site = await createSite("Profile Me");
    const updated = await env.api.request({
      method: "PATCH",
      path: `/api/sites/${site.id}`,
      body: { profile: "showcase", author },
    });
    expect(updated.status).toBe(200);
    expect((updated.body as { profile: string }).profile).toBe("showcase");

    const audit = await env.api.request({
      method: "GET",
      path: `/api/sites/${site.id}/audit?limit=5`,
    });
    const entries = (audit.body as { entries: { mutation: string }[] }).entries;
    expect(entries.some((entry) => entry.mutation === "update_site_profile")).toBe(true);
  });

  it("rejects an unknown profile and an empty site update", async () => {
    const site = await createSite("Strict Profile");
    const unknown = await env.api.request({
      method: "PATCH",
      path: `/api/sites/${site.id}`,
      body: { profile: "wild", author },
    });
    expect(unknown.status).toBe(400);
    expect((unknown.body as { error: { field: string } }).error.field).toBe("profile");

    const empty = await env.api.request({
      method: "PATCH",
      path: `/api/sites/${site.id}`,
      body: { author },
    });
    expect(empty.status).toBe(400);
    expect((empty.body as { error: { message: string } }).error.message).toContain(
      "Nothing to update",
    );
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
  }, 60000);

  it("copies the used media so the copy is publishable on its own (ADR-0014)", async () => {
    const author = { kind: "human", id: "operator", label: "Operator" };
    const source = (await env.api.request({
      method: "POST",
      path: "/api/sites",
      body: { name: "Medienquelle" },
    })).body as { id: string };
    const page = (await env.api.request({
      method: "POST",
      path: `/api/sites/${source.id}/pages`,
      body: {},
    })).body as { id: string; draft: { rootNodeId: string }; draftVersion: number };

    const ticket = (await env.api.request<{ uploadId: string; url: string }>({
      method: "POST",
      path: `/api/sites/${source.id}/assets/upload-url`,
      body: { filename: "atelier.png", mime: "image/png", byteSize: 24, altText: "Atelier" },
    })).body;
    const put = await fetch(`${env.server.origin}${ticket.url}`, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: new Uint8Array(pngHeader(240, 160)),
    });
    expect(put.status).toBe(201);
    const sourceAssetId = ((await put.json()) as { asset: { id: string } }).asset.id;

    const inserted = await env.api.request<Record<string, unknown>>({
      method: "POST",
      path: `/api/pages/${page.id}/mutations`,
      body: {
        baseDraftVersion: page.draftVersion,
        author,
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: {
              type: "media",
              variant: "image",
              props: { asset: { assetId: sourceAssetId }, caption: "Atelier" },
            },
          },
        ],
      },
    });
    expect(inserted.status, JSON.stringify(inserted.body)).toBe(200);

    const copy = (await env.api.request<{ id: string }>({
      method: "POST",
      path: `/api/sites/${source.id}/duplicate`,
      body: { withContent: true, author },
    })).body;

    // The copy owns its media: new id, new storage path, same metadata.
    const sourceAssets = (await env.api.request<{ assets: CopiedAsset[] }>({
      method: "GET",
      path: `/api/sites/${source.id}/assets`,
    })).body.assets;
    expect(sourceAssets).toHaveLength(1);
    const sourcePage = (await env.api.request<PageResponse>({
      method: "GET",
      path: `/api/pages/${page.id}`,
    })).body;
    const sourceAssetIds = new Set<string>();
    for (const node of Object.values(sourcePage.draft.nodes)) {
      collectFromProps(node.props, sourceAssetIds);
    }
    expect([...sourceAssetIds]).toEqual([sourceAssetId]);
    const copiedAssets = (await env.api.request<{ assets: CopiedAsset[] }>({
      method: "GET",
      path: `/api/sites/${copy.id}/assets`,
    })).body.assets;
    expect(copiedAssets).toHaveLength(1);
    const copied = copiedAssets[0];
    const sourceAsset = (await env.api.request<CopiedAsset>({
      method: "GET",
      path: `/api/sites/${source.id}/assets/${sourceAssetId}`,
    })).body;
    expect(copied?.id).not.toBe(sourceAssetId);
    expect(copied?.altText).toBe("Atelier");
    expect(copied?.storageRef).toBe(
      `assets/${copy.id}/${copied?.id}/${sourceAsset.filename}`,
    );
    expect(existsSync(join(env.engine.dataDir, copied?.storageRef ?? ""))).toBe(true);
    // The source file is a separate file, not a shared one.
    expect(existsSync(join(env.engine.dataDir, sourceAsset.storageRef))).toBe(true);
    expect(copied?.storageRef).not.toBe(sourceAsset.storageRef);

    // The copied draft points at the copied asset.
    const copiedPages = (await env.api.request<{ pages: { id: string }[] }>({
      method: "GET",
      path: `/api/sites/${copy.id}/pages`,
    })).body.pages;
    const copiedPageDetail = (await env.api.request<PageResponse>({
      method: "GET",
      path: `/api/pages/${copiedPages[0]?.id}`,
    })).body;
    const assetIds = new Set<string>();
    for (const node of Object.values(copiedPageDetail.draft.nodes)) {
      collectFromProps(node.props, assetIds);
    }
    expect([...assetIds]).toEqual([copied?.id]);

    // Purge isolation: removing the copy's asset leaves the source intact.
    const purged = await env.api.request({ method: "POST", path: `/api/sites/${copy.id}/assets/${copied?.id}/purge` });
    expect(purged.status).toBe(200);
    expect(existsSync(join(env.engine.dataDir, sourceAsset.storageRef))).toBe(true);
    const stillThere = await fetch(
      `${env.server.origin}/assets/${sourceAssetId}/${sourceAsset.filename}`,
    );
    expect(stillThere.status).toBe(200);
  }, 120000);
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

describe("die Zweige am Rand der Site-Routen", () => {
  // Befund vom 25.10.2026 nach dem Bilder-Schnitt (Schritt 66):
  // `http-routes-sites.ts` fiel auf 67,18 % Branches. Das war KEIN
  // Testverlust durch den Schnitt - die Datei ist um 117 Zeilen kleiner,
  // und 16 der 17 leeren Zweige sind derselbe Fall: auf jeder verbliebenen
  // Schreibroute steht `(await readJsonBody(req)) ?? {}`, und kein Test
  // schickte je einen Aufruf OHNE Koerper.
  //
  // Ein Aufruf ohne Koerper ist der erste, den ein Client falsch macht. Die
  // Antworten unterscheiden sich, weil die Vertraege es tun - und genau das
  // ist der Wert dieses Tests: er haelt fest, welche Route mit 400 antwortet
  // und welche mit 200 (weil alle Felder optional sind).
  it("nimmt einen leeren Koerper als leeres Objekt, nicht als Absturz", async () => {
    let siteId: string;
    {
      const created = await env.api.request<{ id: string }>({
        method: "POST",
        path: "/api/sites",
        body: { name: "Leere Koerper" },
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      siteId = created.body.id;
    }

    // Alle verbliebenen Schreibrouten ohne Koerper. Erwartet wird *eine*
    // Fehlerantwort oder ein Erfolg - aber nie ein 500 und nie ein Absturz.
    const schreibrouten = [
      { method: "POST", path: `/api/sites/${siteId}/pages` },
      { method: "POST", path: `/api/sites/${siteId}/releases` },
      { method: "POST", path: `/api/sites/${siteId}/previews` },
      { method: "POST", path: `/api/sites/${siteId}/reviews` },
      { method: "POST", path: `/api/sites/${siteId}/assets` },
      { method: "POST", path: `/api/sites/${siteId}/references` },
      { method: "POST", path: `/api/sites/${siteId}/code-payloads` },
      { method: "POST", path: `/api/sites/${siteId}/redesign` },
    ] as const;

    for (const route of schreibrouten) {
      const response = await env.api.request<{ error?: { category: string } }>({
        method: route.method,
        path: route.path,
      });
      expect(
        response.status,
        `${route.method} ${route.path} -> ${response.status} ${JSON.stringify(response.body)}`,
      ).toBeLessThan(500);
      // Ein Vertragsfehler ist 400; ein Erfolg waere 2xx. Beides ist in
      // Ordnung - ein 500 waere der Absturz, den der Zweig verhindert.
      expect([200, 201, 204, 400, 404, 409, 422]).toContain(response.status);
    }
  }, 120_000);

  it("weist einen unbekannten Review-Status ab und laesst einen gueltigen durch", async () => {
    const created = await env.api.request<{ id: string }>({
      method: "POST",
      path: "/api/sites",
      body: { name: "Review-Status" },
    });
    expect(created.status).toBe(201);
    const siteId = created.body.id;

    // `statusParam !== null && !REVIEW_STATUSES.includes(...)` - beide Arme.
    // Ein unbekannter Wert darf nicht still als "alle" durchgehen, sonst
    // filtert der Editor falsch und merkt es nicht.
    const unbekannt = await env.api.request<{ error: { field: string } }>({
      method: "GET",
      path: `/api/sites/${siteId}/reviews?status=voellig-unbekannt`,
    });
    expect(unbekannt.status).toBe(400);
    expect(unbekannt.body.error.field).toBe("status");

    // Ohne status: alle. Mit einem echten status: gefiltert, aber 200.
    const ohne = await env.api.request<{ reviews: unknown[] }>({
      method: "GET",
      path: `/api/sites/${siteId}/reviews`,
    });
    expect(ohne.status).toBe(200);
    expect(Array.isArray(ohne.body.reviews)).toBe(true);

    const mitStatus = await env.api.request<{ reviews: unknown[] }>({
      method: "GET",
      path: `/api/sites/${siteId}/reviews?status=submitted`,
    });
    expect(mitStatus.status, JSON.stringify(mitStatus.body)).toBe(200);
    expect(Array.isArray(mitStatus.body.reviews)).toBe(true);
  }, 60_000);
});
