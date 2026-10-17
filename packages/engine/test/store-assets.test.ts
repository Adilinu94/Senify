import { afterEach, describe, expect, it, vi } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import type { ReleaseAssetSnapshot } from "../src/types.ts";
import { AssetsRepository, type CreateAssetInput } from "../src/store-assets.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the asset records of a site (rows, derivatives, usage) live in `AssetsRepository`;
// `Store` only delegates. The site existence check comes in as a function, because sites stay
// on the Store; the folder guard (`getAssetFolderOfSite`) and the cross-domain copy stay there too.

// The in-memory stand-in (pg-mem) does not roll a failed transaction back, so the atomicity case
// below is a real-Postgres proof, gated like `transactions.test.ts`.
const hasRealPostgres = (process.env.TEST_DATABASE_URL ?? "").length > 0;

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  const store = new Store(database.db);
  const site = await store.createSite({ name: "Demo" });
  const getSite = vi.fn((siteId: string) => store.getSite(siteId));
  const repo = new AssetsRepository(database.db, getSite);
  return { db: database.db, store, site, getSite, repo };
}

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

// `createdAt` of two rows made in the same millisecond would tie; the tests that order by
// time pin the clock (only `Date`, so the database driver keeps its timers).
function at(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

const asset = (siteId: string, id: string, extra: Partial<CreateAssetInput> = {}): CreateAssetInput => ({
  id,
  siteId,
  filename: `${id}.png`,
  mime: "image/png",
  kind: "image",
  byteSize: 10,
  width: 4,
  height: 3,
  hash: `hash-${id}`,
  altText: null,
  decorative: false,
  folderId: null,
  tags: [],
  storageRef: `ref-${id}`,
  ...extra,
});

const snapshot = (siteId: string, id: string, extra: Partial<ReleaseAssetSnapshot> = {}): ReleaseAssetSnapshot => ({
  id,
  siteId,
  filename: `${id}.png`,
  mime: "image/png",
  kind: "image",
  byteSize: 20,
  width: 8,
  height: 6,
  hash: `snap-${id}`,
  altText: "Beschreibung",
  decorative: false,
  folderId: null,
  tags: ["a"],
  storageRef: `snap-ref-${id}`,
  ...extra,
});

describe("AssetsRepository: create and read", () => {
  it("creates a ready asset and reads it back with an empty derivative set", async () => {
    const { repo, site } = await fixture();
    const created = await repo.createAsset(asset(site.id, "a1", { altText: "Logo", tags: ["marke", "logo"] }));
    expect(created).toMatchObject({
      id: "a1",
      siteId: site.id,
      filename: "a1.png",
      mime: "image/png",
      kind: "image",
      byteSize: 10,
      width: 4,
      height: 3,
      hash: "hash-a1",
      altText: "Logo",
      decorative: false,
      folderId: null,
      tags: ["marke", "logo"],
      storageRef: "ref-a1",
      status: "ready",
      replacedAt: null,
      trashedAt: null,
    });
    expect(created.createdAt).toBe(created.updatedAt);
    const read = await repo.getAsset("a1");
    expect(read).toEqual({ ...created, variants: [], blurhash: null });
  });

  it("answers an unknown asset with not_found, the field assetId and a suggestion", async () => {
    const { repo } = await fixture();
    const error = await rejected(repo.getAsset("missing"));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found", field: "assetId" });
    expect((error as SenifyError).suggestion).toContain("list_assets");
  });

  it("reads an asset of a site and refuses one of another site", async () => {
    const { repo, site, store } = await fixture();
    const other = await store.createSite({ name: "Fremd" });
    await repo.createAsset(asset(site.id, "a1"));
    expect((await repo.getAssetOfSite("a1", site.id)).id).toBe("a1");
    const error = await rejected(repo.getAssetOfSite("a1", other.id));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "validation", field: "assetId" });
    expect(await rejected(repo.getAssetOfSite("missing", site.id))).toMatchObject({
      category: "not_found",
      field: "assetId",
    });
    // The unscoped read stays unscoped (the redesign plan checks the owner itself).
    expect((await repo.getAsset("a1")).siteId).toBe(site.id);
  });
});

describe("AssetsRepository: find by hash and list", () => {
  it("finds the oldest live asset with a hash and ignores trashed ones", async () => {
    const { repo, site, store } = await fixture();
    const other = await store.createSite({ name: "Fremd" });
    at("2026-10-01T00:00:00.000Z");
    const trashed = await repo.createAsset(asset(site.id, "old", { hash: "same" }));
    at("2026-10-02T00:00:00.000Z");
    await repo.createAsset(asset(site.id, "newer", { hash: "same" }));
    at("2026-10-03T00:00:00.000Z");
    await repo.createAsset(asset(site.id, "newest", { hash: "same" }));
    await repo.createAsset(asset(other.id, "foreign", { hash: "same" }));
    await repo.updateAsset(trashed.id, { status: "trashed", trashedAt: "2026-10-04T00:00:00.000Z" });
    expect((await repo.findAssetByHash(site.id, "same"))?.id).toBe("newer");
    expect(await repo.findAssetByHash(site.id, "unknown")).toBeUndefined();
    await repo.updateAsset("newer", { status: "trashed" });
    await repo.updateAsset("newest", { status: "trashed" });
    expect(await repo.findAssetByHash(site.id, "same")).toBeUndefined();
  });

  it("lists ready assets newest first, by status on request, and checks the site", async () => {
    const { repo, site, getSite, store } = await fixture();
    const other = await store.createSite({ name: "Fremd" });
    at("2026-10-01T00:00:00.000Z");
    await repo.createAsset(asset(site.id, "a1"));
    at("2026-10-02T00:00:00.000Z");
    await repo.createAsset(asset(site.id, "a2"));
    at("2026-10-03T00:00:00.000Z");
    await repo.createAsset(asset(site.id, "a3"));
    await repo.createAsset(asset(other.id, "foreign"));
    await repo.updateAsset("a2", { status: "trashed", trashedAt: "2026-10-04T00:00:00.000Z" });
    expect((await repo.listAssets(site.id)).map((entry) => entry.id)).toEqual(["a3", "a1"]);
    expect(getSite).toHaveBeenCalledWith(site.id);
    expect((await repo.listAssets(site.id, { status: "ready" })).map((entry) => entry.id)).toEqual(["a3", "a1"]);
    expect((await repo.listAssets(site.id, { status: "trashed" })).map((entry) => entry.id)).toEqual(["a2"]);
    expect((await repo.listAssets(site.id, { status: "all" })).map((entry) => entry.id)).toEqual(["a3", "a2", "a1"]);
    expect(await repo.listAssets(site.id)).not.toContainEqual(expect.objectContaining({ id: "foreign" }));
  });

  it("does not list anything for an unknown site and says not_found", async () => {
    const { repo } = await fixture();
    expect(await rejected(repo.listAssets("missing"))).toMatchObject({ category: "not_found" });
  });
});

describe("AssetsRepository: update and delete", () => {
  it("changes only the fields of the patch and clears nullable fields with null", async () => {
    const { repo, site } = await fixture();
    await repo.createAsset(asset(site.id, "a1", { altText: "alt", tags: ["x"] }));
    const updated = await repo.updateAsset("a1", { filename: "neu.png", byteSize: 99, altText: null, width: null });
    expect(updated).toMatchObject({
      filename: "neu.png",
      byteSize: 99,
      altText: null,
      width: null,
      height: 3,
      hash: "hash-a1",
      tags: ["x"],
      status: "ready",
    });
    const read = await repo.getAsset("a1");
    expect(read).toMatchObject({ filename: "neu.png", byteSize: 99, altText: null, width: null, height: 3 });
    expect(read.updatedAt).toBe(updated.updatedAt);
  });

  it("trashes and restores through status and the two timestamps, with a caller-set updatedAt", async () => {
    const { repo, site } = await fixture();
    await repo.createAsset(asset(site.id, "a1"));
    const trashed = await repo.updateAsset("a1", {
      status: "trashed",
      trashedAt: "2026-10-05T00:00:00.000Z",
      updatedAt: "2026-10-05T00:00:00.000Z",
    });
    expect(trashed).toMatchObject({ status: "trashed", trashedAt: "2026-10-05T00:00:00.000Z" });
    expect(new Date((await repo.getAsset("a1")).updatedAt).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    const restored = await repo.updateAsset("a1", {
      status: "ready",
      trashedAt: null,
      replacedAt: "2026-10-06T00:00:00.000Z",
    });
    expect(restored).toMatchObject({ status: "ready", trashedAt: null, replacedAt: "2026-10-06T00:00:00.000Z" });
  });

  it("answers an update of an unknown asset with not_found", async () => {
    const { repo } = await fixture();
    expect(await rejected(repo.updateAsset("missing", { filename: "x.png" }))).toMatchObject({
      category: "not_found",
      field: "assetId",
    });
  });

  it("deletes the record and says not_found for an unknown id", async () => {
    const { repo, site } = await fixture();
    await repo.createAsset(asset(site.id, "a1"));
    await repo.createAsset(asset(site.id, "a2"));
    await repo.deleteAssetRecord("a1");
    expect(await rejected(repo.getAsset("a1"))).toMatchObject({ category: "not_found", field: "assetId" });
    expect((await repo.getAsset("a2")).id).toBe("a2");
    expect(await rejected(repo.deleteAssetRecord("a1"))).toMatchObject({ category: "not_found", field: "assetId" });
  });
});

describe("AssetsRepository: derivatives", () => {
  const ladder = [
    { width: 640, format: "webp" as const, storageRef: "v/640.webp", byteSize: 6 },
    { width: 320, format: "webp" as const, storageRef: "v/320.webp", byteSize: 3 },
    { width: 320, format: "avif" as const, storageRef: "v/320.avif", byteSize: 2 },
  ];

  it("stores the ladder and the blur hash and merges them onto every read path", async () => {
    const { repo, site } = await fixture();
    await repo.createAsset(asset(site.id, "a1", { hash: "h1" }));
    await repo.createAsset(asset(site.id, "bare", { hash: "h2" }));
    await repo.replaceAssetDerivatives("a1", ladder, "LEHV6nWB2yk8");
    const read = await repo.getAsset("a1");
    expect(read.blurhash).toBe("LEHV6nWB2yk8");
    expect(read.variants.map((variant) => [variant.width, variant.format, variant.storageRef])).toEqual([
      [320, "avif", "v/320.avif"],
      [320, "webp", "v/320.webp"],
      [640, "webp", "v/640.webp"],
    ]);
    expect(read.variants.every((variant) => variant.assetId === "a1" && variant.id !== "")).toBe(true);
    expect((await repo.findAssetByHash(site.id, "h1"))?.variants).toHaveLength(3);
    const listed = new Map((await repo.listAssets(site.id)).map((entry) => [entry.id, entry]));
    expect(listed.get("a1")?.blurhash).toBe("LEHV6nWB2yk8");
    expect(listed.get("a1")?.variants).toHaveLength(3);
    expect(listed.get("bare")).toMatchObject({ variants: [], blurhash: null });
  });

  it("replaces the old ladder and drops the blur hash when none is given", async () => {
    const { repo, site } = await fixture();
    await repo.createAsset(asset(site.id, "a1"));
    await repo.replaceAssetDerivatives("a1", ladder, "hash-one");
    await repo.replaceAssetDerivatives("a1", [ladder[0]!], null);
    const read = await repo.getAsset("a1");
    expect(read.variants.map((variant) => variant.storageRef)).toEqual(["v/640.webp"]);
    expect(read.blurhash).toBeNull();
  });

  it.skipIf(!hasRealPostgres)("keeps the old derivatives when a new variant cannot be stored (one transaction)", async () => {
    const { repo, site } = await fixture();
    await repo.createAsset(asset(site.id, "a1"));
    await repo.replaceAssetDerivatives("a1", ladder, "hash-one");
    const broken = [ladder[0]!, { ...ladder[1]!, byteSize: null as unknown as number }];
    await expect(repo.replaceAssetDerivatives("a1", broken, "hash-two")).rejects.toThrow();
    const read = await repo.getAsset("a1");
    expect(read.variants).toHaveLength(3);
    expect(read.blurhash).toBe("hash-one");
  });

  it("deletes ladder and blur hash together and leaves other assets alone", async () => {
    const { repo, site } = await fixture();
    await repo.createAsset(asset(site.id, "a1"));
    await repo.createAsset(asset(site.id, "a2"));
    await repo.replaceAssetDerivatives("a1", ladder, "h1");
    await repo.replaceAssetDerivatives("a2", [ladder[0]!], "h2");
    await repo.deleteAssetDerivatives("a1");
    expect(await repo.getAsset("a1")).toMatchObject({ variants: [], blurhash: null });
    expect(await repo.getAsset("a2")).toMatchObject({ blurhash: "h2" });
    expect((await repo.getAsset("a2")).variants).toHaveLength(1);
  });
});

describe("AssetsRepository: usage map", () => {
  it("maps the status and the decorative flag of every asset of a site", async () => {
    const { repo, site, store } = await fixture();
    const other = await store.createSite({ name: "Fremd" });
    await repo.createAsset(asset(site.id, "a1", { decorative: true }));
    await repo.createAsset(asset(site.id, "a2"));
    await repo.createAsset(asset(site.id, "a3", { decorative: true }));
    await repo.createAsset(asset(other.id, "foreign"));
    await repo.updateAsset("a3", { status: "trashed" });
    expect(await repo.assetUsageMap(site.id)).toEqual(
      new Map([
        ["a1", { status: "ready", decorative: true }],
        ["a2", { status: "ready", decorative: false }],
        ["a3", { status: "trashed", decorative: true }],
      ]),
    );
    expect((await repo.assetUsageMap("missing")).size).toBe(0);
  });
});

describe("AssetsRepository: restore from a release snapshot", () => {
  it("inserts the row from the snapshot, with the snapshot's site and hash", async () => {
    const { repo, site } = await fixture();
    const restored = await repo.replaceAssetFromSnapshot(snapshot(site.id, "r1", { tags: ["a", "b"] }));
    expect(restored).toMatchObject({
      id: "r1",
      siteId: site.id,
      hash: "snap-r1",
      byteSize: 20,
      width: 8,
      height: 6,
      altText: "Beschreibung",
      tags: ["a", "b"],
      storageRef: "snap-ref-r1",
      status: "ready",
      replacedAt: null,
      trashedAt: null,
    });
    expect((await repo.getAsset("r1")).hash).toBe("snap-r1");
  });

  it("upserts by id: a trashed asset comes back under the same id with the snapshot's bytes", async () => {
    const { repo, site } = await fixture();
    at("2026-10-01T00:00:00.000Z");
    const original = await repo.createAsset(asset(site.id, "r1", { hash: "later", altText: "neu" }));
    await repo.updateAsset("r1", {
      status: "trashed",
      trashedAt: "2026-10-02T00:00:00.000Z",
      replacedAt: "2026-10-02T00:00:00.000Z",
    });
    at("2026-10-05T00:00:00.000Z");
    const restored = await repo.replaceAssetFromSnapshot(snapshot(site.id, "r1", { altText: "damals" }));
    expect(restored).toMatchObject({
      id: "r1",
      hash: "snap-r1",
      altText: "damals",
      status: "ready",
      trashedAt: null,
      replacedAt: null,
      storageRef: "snap-ref-r1",
    });
    expect(restored.createdAt).toBe(original.createdAt);
    expect(new Date(restored.updatedAt).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect((await repo.listAssets(site.id, { status: "all" })).map((entry) => entry.id)).toEqual(["r1"]);
  });
});

describe("Store facade", () => {
  it("answers exactly like the repository on the same database", async () => {
    const { repo, site, store } = await fixture();
    const created = await store.createAsset(asset(site.id, "a1", { hash: "h1" }));
    await store.replaceAssetDerivatives(
      "a1",
      [{ width: 320, format: "webp", storageRef: "v/320.webp", byteSize: 3 }],
      "bh",
    );
    await store.replaceAssetFromSnapshot(snapshot(site.id, "r1"));
    expect(created.id).toBe("a1");
    expect(await store.getAsset("a1")).toEqual(await repo.getAsset("a1"));
    expect(await store.getAssetOfSite("a1", site.id)).toEqual(await repo.getAssetOfSite("a1", site.id));
    expect(await store.findAssetByHash(site.id, "h1")).toEqual(await repo.findAssetByHash(site.id, "h1"));
    expect(await store.listAssets(site.id, { status: "all" })).toEqual(
      await repo.listAssets(site.id, { status: "all" }),
    );
    expect(await store.assetUsageMap(site.id)).toEqual(await repo.assetUsageMap(site.id));
    await store.updateAsset("a1", { altText: "über die Fassade" });
    expect((await repo.getAsset("a1")).altText).toBe("über die Fassade");
    await store.deleteAssetDerivatives("a1");
    expect((await repo.getAsset("a1")).variants).toEqual([]);
    await store.deleteAssetRecord("a1");
    expect(await rejected(repo.getAsset("a1"))).toMatchObject({ category: "not_found" });
  });
});
