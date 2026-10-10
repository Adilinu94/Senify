import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, type EntryStatus, newEntityId, Store } from "@senify/engine";
import { EntriesRepository } from "../src/store-entries.ts";
import { createTestDatabase, TEST_AUTHOR } from "./helpers.ts";

// ADR 0019: the entries of a collection (entries, versions, slug redirects) live in
// `EntriesRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  const store = new Store(database.db);
  const site = await store.createSite({ name: "Eintraege" });
  const collection = await store.createCollection({
    id: newEntityId(),
    siteId: site.id,
    name: "Blog",
    slug: "blog",
    fields: [],
    titleField: "title",
    dateField: null,
    urlPattern: null,
    supports: [],
    listColumns: [],
    description: null,
    deprecatedAt: null,
  });
  return { db: database.db, store, repo: new EntriesRepository(database.db), site, collection };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

const addEntry = (
  { repo, site, collection }: Pick<Fixture, "repo" | "site" | "collection">,
  slug: string,
  overrides: { status?: "draft" | "published"; searchText?: string } = {},
) =>
  repo.createEntry({
    id: newEntityId(),
    siteId: site.id,
    collectionId: collection.id,
    slug,
    status: overrides.status ?? "draft",
    cells: { title: slug },
    author: TEST_AUTHOR,
    searchText: overrides.searchText ?? slug,
    publishedAt: null,
    scheduledAt: null,
  });

// A full content write; the order of `listEntries` follows `updatedAt`.
const changesOf = (entry: { slug: string; status: EntryStatus }, extra = {}) => ({
  slug: entry.slug,
  status: entry.status,
  cells: { title: entry.slug },
  activeVersionId: null,
  author: TEST_AUTHOR,
  searchText: entry.slug,
  publishedAt: null,
  scheduledAt: null,
  updatedAt: "2026-10-10T08:00:00.000Z",
  ...extra,
});

describe("EntriesRepository: entries", () => {
  it("creates an entry as version 1 and reads it back", async () => {
    const f = await fixture();
    const created = await addEntry(f, "hallo");
    expect(created).toMatchObject({
      siteId: f.site.id,
      collectionId: f.collection.id,
      slug: "hallo",
      status: "draft",
      cells: { title: "hallo" },
      activeVersionId: null,
      version: 1,
      author: TEST_AUTHOR,
      publishedAt: null,
      scheduledAt: null,
      deletedAt: null,
    });
    expect(await f.repo.getEntry(created.id)).toEqual(created);
  });

  it("answers an unknown entry with a not_found error on the entryId field", async () => {
    const { repo } = await fixture();
    const error = await rejected(repo.getEntry("nope"));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found", field: "entryId" });
  });

  it("lists newest first and filters by collection, status, trash and search tokens", async () => {
    const f = await fixture();
    const other = await f.store.createCollection({
      id: newEntityId(),
      siteId: f.site.id,
      name: "Andere",
      slug: "andere",
      fields: [],
      titleField: "title",
      dateField: null,
      urlPattern: null,
      supports: [],
      listColumns: [],
      description: null,
      deprecatedAt: null,
    });
    const a = await addEntry(f, "alpha", { searchText: "alpha apfel birne" });
    const b = await addEntry(f, "beta", { searchText: "beta apfel" });
    const c = await addEntry(f, "gamma", { searchText: "gamma kirsche", status: "published" });
    const elsewhere = await f.repo.createEntry({
      id: newEntityId(),
      siteId: f.site.id,
      collectionId: other.id,
      slug: "delta",
      status: "draft",
      cells: {},
      author: TEST_AUTHOR,
      searchText: "delta",
      publishedAt: null,
      scheduledAt: null,
    });
    await f.repo.updateEntryRow({ entryId: a.id, expectedVersion: 1, changes: changesOf(a, { searchText: "alpha apfel birne", updatedAt: "2026-10-10T08:00:03.000Z" }) });
    await f.repo.updateEntryRow({ entryId: b.id, expectedVersion: 1, changes: changesOf(b, { searchText: "beta apfel", updatedAt: "2026-10-10T08:00:02.000Z" }) });
    await f.repo.updateEntryRow({ entryId: c.id, expectedVersion: 1, changes: changesOf(c, { searchText: "gamma kirsche", updatedAt: "2026-10-10T08:00:01.000Z" }) });
    await f.repo.updateEntryRow({ entryId: elsewhere.id, expectedVersion: 1, changes: changesOf(elsewhere, { updatedAt: "2026-10-10T08:00:00.000Z" }) });

    const ids = async (filter: Parameters<EntriesRepository["listEntries"]>[0]) =>
      (await f.repo.listEntries(filter)).map((entry) => entry.id);

    expect(await ids({ siteId: f.site.id })).toEqual([a.id, b.id, c.id, elsewhere.id]);
    expect(await ids({ siteId: f.site.id, collectionId: other.id })).toEqual([elsewhere.id]);
    expect(await ids({ siteId: f.site.id, status: "published" })).toEqual([c.id]);
    expect(await ids({ siteId: f.site.id, searchTokens: ["apfel"] })).toEqual([a.id, b.id]);
    expect(await ids({ siteId: f.site.id, searchTokens: ["apfel", "birne"] })).toEqual([a.id]);
    expect(await ids({ siteId: f.site.id, limit: 2 })).toEqual([a.id, b.id]);
    expect(await ids({ siteId: f.site.id, limit: 0 })).toEqual([a.id]);

    await f.repo.setEntryDeleted(b.id, "2026-10-10T09:00:00.000Z");
    expect(await ids({ siteId: f.site.id })).toEqual([a.id, c.id, elsewhere.id]);
    expect(await ids({ siteId: f.site.id, trashed: true })).toEqual([b.id]);
  });

  it("finds a live entry by slug, ignores trashed ones and can skip one id", async () => {
    const f = await fixture();
    const entry = await addEntry(f, "ein-slug");
    expect((await f.repo.findLiveEntryBySlug(f.collection.id, "ein-slug"))?.id).toBe(entry.id);
    expect(await f.repo.findLiveEntryBySlug(f.collection.id, "ein-slug", entry.id)).toBeUndefined();
    expect(await f.repo.findLiveEntryBySlug("andere-collection", "ein-slug")).toBeUndefined();
    await f.repo.setEntryDeleted(entry.id, "2026-10-10T09:00:00.000Z");
    expect(await f.repo.findLiveEntryBySlug(f.collection.id, "ein-slug")).toBeUndefined();
  });

  it("finds a published entry by its slug or by the slug of its active version", async () => {
    const f = await fixture();
    const entry = await addEntry(f, "alt");
    const version = await f.repo.createEntryVersion({
      id: newEntityId(),
      entryId: entry.id,
      siteId: f.site.id,
      versionNumber: 1,
      cells: { title: "alt" },
      slug: "alt",
      status: "published",
      author: TEST_AUTHOR,
    });
    // Draft rename: the entry carries the new slug, the active version still the old one.
    await f.repo.updateEntryRow({
      entryId: entry.id,
      expectedVersion: 1,
      changes: changesOf({ slug: "neu", status: "published" }, { activeVersionId: version.id }),
    });
    expect((await f.repo.findPublishedEntryBySlug(f.collection.id, "alt"))?.id).toBe(entry.id);
    expect((await f.repo.findPublishedEntryBySlug(f.collection.id, "neu"))?.id).toBe(entry.id);
    expect(await f.repo.findPublishedEntryBySlug(f.collection.id, "gibt-es-nicht")).toBeUndefined();

    await f.repo.setEntryDeleted(entry.id, "2026-10-10T09:00:00.000Z");
    expect(await f.repo.findPublishedEntryBySlug(f.collection.id, "neu")).toBeUndefined();
  });

  it("does not offer a draft as published", async () => {
    const f = await fixture();
    await addEntry(f, "entwurf");
    expect(await f.repo.findPublishedEntryBySlug(f.collection.id, "entwurf")).toBeUndefined();
  });

  it("writes content with an optimistic version: bumps it, and rejects a stale or unknown write", async () => {
    const f = await fixture();
    const entry = await addEntry(f, "alt");
    const version = await f.repo.updateEntryRow({
      entryId: entry.id,
      expectedVersion: 1,
      changes: changesOf({ slug: "neu", status: "published" }, { publishedAt: "2026-10-10T08:00:00.000Z" }),
    });
    expect(version).toBe(2);
    expect(await f.repo.getEntry(entry.id)).toMatchObject({
      slug: "neu",
      status: "published",
      version: 2,
      publishedAt: "2026-10-10T08:00:00.000Z",
      updatedAt: "2026-10-10T08:00:00.000Z",
    });

    const stale = await rejected(
      f.repo.updateEntryRow({ entryId: entry.id, expectedVersion: 1, changes: changesOf(entry) }),
    );
    expect(stale).toBeInstanceOf(SenifyError);
    expect(stale).toMatchObject({ category: "conflict", field: "baseVersion" });
    expect(String((stale as Error).message)).toContain("expected v1, current v2");

    const unknown = await rejected(
      f.repo.updateEntryRow({ entryId: "nope", expectedVersion: 1, changes: changesOf(entry) }),
    );
    expect(unknown).toMatchObject({ category: "not_found", field: "entryId" });
  });

  it("trashes and restores without a version bump", async () => {
    const f = await fixture();
    const entry = await addEntry(f, "papierkorb");
    const trashed = await f.repo.setEntryDeleted(entry.id, "2026-10-10T09:00:00.000Z");
    expect(trashed).toMatchObject({ deletedAt: "2026-10-10T09:00:00.000Z", version: 1 });
    const restored = await f.repo.setEntryDeleted(entry.id, null);
    expect(restored).toMatchObject({ deletedAt: null, version: 1 });
    expect(await rejected(f.repo.setEntryDeleted("nope", null))).toMatchObject({
      category: "not_found",
      field: "entryId",
    });
  });

  it("deletes the record together with its versions and answers the second delete with not_found", async () => {
    const f = await fixture();
    const entry = await addEntry(f, "weg");
    const version = await f.repo.createEntryVersion({
      id: newEntityId(),
      entryId: entry.id,
      siteId: f.site.id,
      versionNumber: 1,
      cells: {},
      slug: "weg",
      status: "published",
      author: TEST_AUTHOR,
    });
    await f.repo.deleteEntryRecord(entry.id);
    expect(await rejected(f.repo.getEntry(entry.id))).toMatchObject({ category: "not_found" });
    expect(await rejected(f.repo.getEntryVersion(version.id))).toMatchObject({ category: "not_found" });
    expect(await rejected(f.repo.deleteEntryRecord(entry.id))).toMatchObject({
      category: "not_found",
      field: "entryId",
    });
  });
});

describe("EntriesRepository: versions", () => {
  it("stores immutable snapshots, lists newest first with a clamped limit and counts the highest number", async () => {
    const f = await fixture();
    const entry = await addEntry(f, "chronik");
    expect(await f.repo.maxEntryVersionNumber(entry.id)).toBe(0);
    const created = [];
    for (const versionNumber of [1, 2, 3]) {
      created.push(
        await f.repo.createEntryVersion({
          id: newEntityId(),
          entryId: entry.id,
          siteId: f.site.id,
          versionNumber,
          cells: { title: `v${versionNumber}` },
          slug: `s${versionNumber}`,
          status: "published",
          author: TEST_AUTHOR,
        }),
      );
    }
    expect(created[1]).toMatchObject({
      entryId: entry.id,
      siteId: f.site.id,
      versionNumber: 2,
      cells: { title: "v2" },
      slug: "s2",
      status: "published",
    });
    expect(await f.repo.getEntryVersion(created[1]!.id)).toEqual(created[1]);
    expect(await f.repo.maxEntryVersionNumber(entry.id)).toBe(3);
    expect((await f.repo.listEntryVersions(entry.id)).map((v) => v.versionNumber)).toEqual([3, 2, 1]);
    expect((await f.repo.listEntryVersions(entry.id, 2)).map((v) => v.versionNumber)).toEqual([3, 2]);
    expect((await f.repo.listEntryVersions(entry.id, 0)).map((v) => v.versionNumber)).toEqual([3]);
    expect(await f.repo.listEntryVersions("nope")).toEqual([]);
  });

  it("answers an unknown version with a not_found error on the versionId field", async () => {
    const { repo } = await fixture();
    expect(await rejected(repo.getEntryVersion("nope"))).toMatchObject({
      category: "not_found",
      field: "versionId",
    });
  });

  it("deletes the given versions only; an empty list changes nothing", async () => {
    const f = await fixture();
    const entry = await addEntry(f, "retention");
    const ids: string[] = [];
    for (const versionNumber of [1, 2, 3]) {
      const version = await f.repo.createEntryVersion({
        id: newEntityId(),
        entryId: entry.id,
        siteId: f.site.id,
        versionNumber,
        cells: {},
        slug: "retention",
        status: "published",
        author: TEST_AUTHOR,
      });
      ids.push(version.id);
    }
    await f.repo.deleteEntryVersions([]);
    expect(await f.repo.listEntryVersions(entry.id)).toHaveLength(3);
    await f.repo.deleteEntryVersions([ids[0]!, ids[1]!]);
    expect((await f.repo.listEntryVersions(entry.id)).map((v) => v.id)).toEqual([ids[2]]);
  });
});

describe("EntriesRepository: slug redirects", () => {
  const redirect = (f: Fixture, fromPath: string, toPath: string) =>
    f.repo.createEntryRedirect({
      id: newEntityId(),
      siteId: f.site.id,
      collectionId: f.collection.id,
      fromPath,
      toPath,
    });

  it("creates, finds the newest per path, lists oldest first and deletes by path", async () => {
    const f = await fixture();
    const first = await redirect(f, "/blog/alt", "/blog/zwischen");
    expect(first).toMatchObject({
      siteId: f.site.id,
      collectionId: f.collection.id,
      fromPath: "/blog/alt",
      toPath: "/blog/zwischen",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await redirect(f, "/blog/alt", "/blog/neu");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const third = await redirect(f, "/blog/anders", "/blog/ziel");

    expect((await f.repo.findEntryRedirect(f.site.id, "/blog/alt"))?.id).toBe(second.id);
    expect(await f.repo.findEntryRedirect(f.site.id, "/blog/keins")).toBeUndefined();
    expect((await f.repo.listEntryRedirects(f.site.id)).map((r) => r.id)).toEqual([first.id, second.id, third.id]);
    expect(await f.repo.listEntryRedirects("andere-site")).toEqual([]);

    await f.repo.deleteEntryRedirect(f.site.id, "/blog/alt");
    expect(await f.repo.findEntryRedirect(f.site.id, "/blog/alt")).toBeUndefined();
    expect((await f.repo.listEntryRedirects(f.site.id)).map((r) => r.id)).toEqual([third.id]);
  });
});

describe("EntriesRepository behind the Store facade", () => {
  it("is what Store delegates to: the same rows come back through the facade", async () => {
    const f = await fixture();
    const created = await f.store.createEntry({
      id: newEntityId(),
      siteId: f.site.id,
      collectionId: f.collection.id,
      slug: "fassade",
      status: "draft",
      cells: { title: "Fassade" },
      author: TEST_AUTHOR,
      searchText: "fassade",
      publishedAt: null,
      scheduledAt: null,
    });
    expect(await f.repo.getEntry(created.id)).toEqual(created);
    expect(await f.store.listEntries({ siteId: f.site.id })).toEqual(
      await f.repo.listEntries({ siteId: f.site.id }),
    );
    expect(await f.store.findLiveEntryBySlug(f.collection.id, "fassade")).toEqual(created);

    const version = await f.store.createEntryVersion({
      id: newEntityId(),
      entryId: created.id,
      siteId: f.site.id,
      versionNumber: 1,
      cells: {},
      slug: "fassade",
      status: "published",
      author: TEST_AUTHOR,
    });
    expect(await f.repo.getEntryVersion(version.id)).toEqual(version);
    expect(await f.store.maxEntryVersionNumber(created.id)).toBe(1);

    const redirect = await f.store.createEntryRedirect({
      id: newEntityId(),
      siteId: f.site.id,
      collectionId: f.collection.id,
      fromPath: "/a",
      toPath: "/b",
    });
    expect(await f.repo.findEntryRedirect(f.site.id, "/a")).toEqual(redirect);
    expect(await f.store.listEntryRedirects(f.site.id)).toEqual(await f.repo.listEntryRedirects(f.site.id));
  });
});
