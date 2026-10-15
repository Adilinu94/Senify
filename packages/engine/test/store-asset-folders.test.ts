import { afterEach, describe, expect, it, vi } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { AssetFoldersRepository } from "../src/store-asset-folders.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: asset folders and the file history of an asset live in
// `AssetFoldersRepository`; `Store` only delegates. The site and asset
// existence checks are handed in as functions.

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
  const getAsset = vi.fn((assetId: string) => store.getAsset(assetId));
  const repo = new AssetFoldersRepository(database.db, getSite, getAsset);
  return { store, site, getSite, getAsset, repo };
}

async function asset(store: Store, siteId: string, id: string, folderId: string | null = null) {
  return store.createAsset({
    id,
    siteId,
    filename: `${id}.png`,
    mime: "image/png",
    kind: "image",
    byteSize: 10,
    width: 1,
    height: 1,
    hash: `hash-${id}`,
    altText: null,
    decorative: true,
    folderId,
    tags: [],
    storageRef: `ref-${id}`,
  });
}

function expectNotFound(error: unknown, field: string) {
  expect(error).toBeInstanceOf(SenifyError);
  expect(error).toMatchObject({ category: "not_found", field });
}

describe("AssetFoldersRepository", () => {
  it("creates, reads and lists folders of a site in creation order", async () => {
    const { site, getSite, repo } = await fixture();
    const parent = await repo.createAssetFolder({ id: "f1", siteId: site.id, name: "Bilder", parentId: null });
    await repo.createAssetFolder({ id: "f2", siteId: site.id, name: "Team", parentId: "f1" });
    expect(parent).toMatchObject({ id: "f1", siteId: site.id, name: "Bilder", parentId: null });
    expect((await repo.getAssetFolder("f2")).parentId).toBe("f1");
    expect((await repo.listAssetFolders(site.id)).map((folder) => folder.id)).toEqual(["f1", "f2"]);
    expect(getSite).toHaveBeenCalledWith(site.id);
  });

  it("reports an unknown folder as not_found on folderId", async () => {
    const { repo } = await fixture();
    expectNotFound(await repo.getAssetFolder("missing").catch((error: unknown) => error), "folderId");
    expectNotFound(await repo.deleteAssetFolder("missing").catch((error: unknown) => error), "folderId");
  });

  it("lists folders only for an existing site", async () => {
    const { repo } = await fixture();
    expect(await repo.listAssetFolders("missing").catch((error: unknown) => error)).toBeInstanceOf(SenifyError);
  });

  it("deletes a folder without deleting its assets or subfolders", async () => {
    const { store, site, repo } = await fixture();
    await repo.createAssetFolder({ id: "f1", siteId: site.id, name: "Bilder", parentId: null });
    await repo.createAssetFolder({ id: "f2", siteId: site.id, name: "Team", parentId: "f1" });
    await asset(store, site.id, "a1", "f1");
    await repo.deleteAssetFolder("f1");
    expect((await store.getAsset("a1")).folderId).toBeNull();
    expect((await repo.getAssetFolder("f2")).parentId).toBeNull();
    expect((await repo.listAssetFolders(site.id)).map((folder) => folder.id)).toEqual(["f2"]);
  });

  it("records, reads, lists newest first and deletes the history of an asset", async () => {
    const { store, site, getAsset, repo } = await fixture();
    await asset(store, site.id, "a1");
    const first = await repo.createAssetHistory({ id: "h1", assetId: "a1", storageRef: "old-1", mime: "image/png", byteSize: 7 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.createAssetHistory({ id: "h2", assetId: "a1", storageRef: "old-2", mime: "image/jpeg", byteSize: 8 });
    expect(first).toMatchObject({ id: "h1", assetId: "a1", storageRef: "old-1", mime: "image/png", byteSize: 7 });
    expect((await repo.getAssetHistory("h2")).storageRef).toBe("old-2");
    expect((await repo.listAssetHistory("a1")).map((entry) => entry.id)).toEqual(["h2", "h1"]);
    expect(getAsset).toHaveBeenCalledWith("a1");
    await repo.deleteAssetHistory("a1");
    expect(await repo.listAssetHistory("a1")).toEqual([]);
  });

  it("reports an unknown history entry as not_found on historyId", async () => {
    const { repo } = await fixture();
    expectNotFound(await repo.getAssetHistory("missing").catch((error: unknown) => error), "historyId");
  });

  it("keeps the Store API delegating to the repository", async () => {
    const { store, site } = await fixture();
    await store.createAssetFolder({ id: "f1", siteId: site.id, name: "Bilder", parentId: null });
    expect((await store.listAssetFolders(site.id)).map((folder) => folder.id)).toEqual(["f1"]);
    await asset(store, site.id, "a1");
    await store.createAssetHistory({ id: "h1", assetId: "a1", storageRef: "old", mime: "image/png", byteSize: 1 });
    expect((await store.listAssetHistory("a1")).map((entry) => entry.id)).toEqual(["h1"]);
  });
});
