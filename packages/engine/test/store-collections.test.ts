import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSchema, newEntityId, Store } from "@senify/engine";
import { CollectionsRepository, type CreateCollectionInput } from "../src/store-collections.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: collection schemas live in `CollectionsRepository`; `Store` only delegates.
// The site existence check is handed in as a function, as in `DeployRepository`.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  const store = new Store(database.db);
  const site = await store.createSite({ name: "Demo" });
  const getSite = vi.fn((siteId: string) => store.getSite(siteId));
  return { site, getSite, repo: new CollectionsRepository(database.db, getSite) };
}

const input = (siteId: string, slug: string, extra: Partial<CreateCollectionInput> = {}): CreateCollectionInput => ({
  id: newEntityId(),
  siteId,
  name: slug,
  slug,
  fields: [],
  titleField: "title",
  dateField: null,
  urlPattern: null,
  supports: [],
  listColumns: [],
  description: null,
  deprecatedAt: null,
  ...extra,
});

describe("CollectionsRepository", () => {
  it("creates, reads and finds a collection by slug", async () => {
    const { site, repo } = await fixture();
    const created = await repo.createCollection(input(site.id, "blog"));
    expect(await repo.getCollection(created.id)).toEqual(created);
    expect(await repo.findCollectionBySlug(site.id, "blog")).toEqual(created);
    expect(await repo.findCollectionBySlug(site.id, "none")).toBeUndefined();
  });

  it("rejects a duplicate slug on the same site as conflict", async () => {
    const { site, repo } = await fixture();
    await repo.createCollection(input(site.id, "blog"));
    await expect(repo.createCollection(input(site.id, "blog"))).rejects.toMatchObject({
      category: "conflict",
      field: "slug",
    });
  });

  it("hides deprecated collections unless asked and checks the site first", async () => {
    const { site, getSite, repo } = await fixture();
    const live = await repo.createCollection(input(site.id, "blog"));
    const old = await repo.createCollection(input(site.id, "old", { deprecatedAt: "2026-10-01T00:00:00.000Z" }));
    expect((await repo.listCollections(site.id)).map((c) => c.id)).toEqual([live.id]);
    const all = (await repo.listCollections(site.id, { includeDeprecated: true })).map((c) => c.id);
    expect(all.sort()).toEqual([live.id, old.id].sort());
    expect(getSite).toHaveBeenCalledWith(site.id);
    await expect(repo.listCollections("missing")).rejects.toMatchObject({ category: "not_found" });
  });

  it("updates the schema and keeps the slug", async () => {
    const { site, repo } = await fixture();
    const created = await repo.createCollection(input(site.id, "blog"));
    const { id: _id, siteId: _siteId, slug: _slug, ...rest } = input(site.id, "blog");
    const updated = await repo.updateCollection(created.id, { ...rest, name: "Journal", listColumns: ["title"] });
    expect(updated).toMatchObject({ id: created.id, slug: "blog", name: "Journal", listColumns: ["title"] });
    expect(await repo.getCollection(created.id)).toEqual(updated);
  });

  it("reports unknown collections as not_found", async () => {
    const { site, repo } = await fixture();
    await expect(repo.getCollection("missing")).rejects.toMatchObject({ category: "not_found" });
    const { id: _id, siteId: _siteId, slug: _slug, ...rest } = input(site.id, "x");
    await expect(repo.updateCollection("missing", rest)).rejects.toMatchObject({ category: "not_found" });
  });
});
