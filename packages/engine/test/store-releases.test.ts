import { afterEach, describe, expect, it } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { ReleasesRepository } from "../src/store-releases.ts";
import type { ReleaseManifest } from "../src/types.ts";
import { createTestDatabase, TEST_AUTHOR } from "./helpers.ts";

// ADR 0019: the release operations live in `ReleasesRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return { db: database.db, repo: new ReleasesRepository(database.db) };
}

const manifest = (buildHash = "hash-1"): ReleaseManifest => ({
  styleRules: [],
  rendererVersion: "1.0.0",
  buildHash,
  capturedAt: "2026-10-08T00:00:00.000Z",
  siteDate: "2026-10-08",
  assets: [],
  components: [],
  payloads: [],
  entries: [],
  designRecordId: null,
  designScore: null,
  designVerdict: null,
});

const create = (repo: ReleasesRepository, siteId = "site-1") =>
  repo.createRelease({
    siteId,
    pageRevisions: [{ pageId: "page-1", path: "/", revisionId: "rev-1" }],
    themeSnapshot: { tokens: {} },
    buildRef: null,
    author: TEST_AUTHOR,
    note: null,
    basisReleaseId: null,
  });

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const conflict = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

describe("ReleasesRepository: reading", () => {
  it("stores a release without a manifest and lists the newest first, per site", async () => {
    const { repo } = await fixture();
    const first = await create(repo);
    expect(first).toMatchObject({ siteId: "site-1", buildRef: null, manifest: null, note: null });
    await tick();
    const second = await create(repo);
    await create(repo, "site-2");

    const read = await repo.getRelease(first.id);
    expect(read).toMatchObject({
      id: first.id,
      siteId: "site-1",
      pageRevisions: [{ pageId: "page-1", path: "/", revisionId: "rev-1" }],
      themeSnapshot: { tokens: {} },
      author: TEST_AUTHOR,
      basisReleaseId: null,
    });
    expect(Number.isNaN(Date.parse(read.createdAt))).toBe(false);

    expect((await repo.listReleases("site-1")).map((release) => release.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(await repo.listReleases("site-1", 0)).toHaveLength(1);
  });

  it("answers an unknown release id with a not_found error", async () => {
    const { repo } = await fixture();
    const error = await conflict(repo.getRelease("nope"));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found" });
  });

  it("has no active release before the first activation", async () => {
    const { repo } = await fixture();
    expect(await repo.getActiveReleaseId("site-1")).toBeNull();
  });
});

describe("ReleasesRepository: activation and finalization", () => {
  it("activates once and leaves the build ref and the active pointer alone on a conflict", async () => {
    const { repo } = await fixture();
    const a = await create(repo);
    await repo.activateRelease({ siteId: "site-1", releaseId: a.id, buildRef: "build-a" });
    expect(await repo.getActiveReleaseId("site-1")).toBe(a.id);
    expect((await repo.getRelease(a.id)).buildRef).toBe("build-a");

    const again = await conflict(
      repo.activateRelease({ siteId: "site-1", releaseId: a.id, buildRef: "build-x" }),
    );
    expect(again).toMatchObject({ category: "conflict" });
    expect((await repo.getRelease(a.id)).buildRef).toBe("build-a");
    expect(await repo.getActiveReleaseId("site-1")).toBe(a.id);
  });

  it("finalizes with build ref, manifest and pointer, and refuses a second finalization", async () => {
    const { repo } = await fixture();
    const a = await create(repo);
    await repo.activateRelease({ siteId: "site-1", releaseId: a.id, buildRef: "build-a" });
    const b = await create(repo);
    await repo.finalizeRelease({
      siteId: "site-1",
      releaseId: b.id,
      buildRef: "build-b",
      manifest: manifest("hash-b"),
    });
    const finalized = await repo.getRelease(b.id);
    expect(finalized.buildRef).toBe("build-b");
    expect(finalized.manifest).toEqual(manifest("hash-b"));
    expect(await repo.getActiveReleaseId("site-1")).toBe(b.id);

    const refused = await conflict(
      repo.finalizeRelease({ siteId: "site-1", releaseId: b.id, buildRef: "build-z", manifest: manifest("z") }),
    );
    expect(refused).toMatchObject({ category: "conflict" });
    // A finalized release cannot be activated again; the pointer stays on `b`.
    const stale = await conflict(
      repo.activateRelease({ siteId: "site-1", releaseId: a.id, buildRef: "build-y" }),
    );
    expect(stale).toMatchObject({ category: "conflict" });
    expect(await repo.getActiveReleaseId("site-1")).toBe(b.id);
  });

  it("attaches a build ref or updates the manifest only until the release has a build ref", async () => {
    const { repo } = await fixture();
    const open = await create(repo);
    await repo.updateReleaseManifest(open.id, manifest("hash-1"));
    expect((await repo.getRelease(open.id)).manifest).toEqual(manifest("hash-1"));
    await repo.attachReleaseBuild(open.id, "build-1");
    expect((await repo.getRelease(open.id)).buildRef).toBe("build-1");

    expect(await conflict(repo.attachReleaseBuild(open.id, "build-2"))).toMatchObject({
      category: "conflict",
    });
    expect(await conflict(repo.updateReleaseManifest(open.id, manifest("hash-2")))).toMatchObject({
      category: "conflict",
    });
    expect((await repo.getRelease(open.id)).manifest).toEqual(manifest("hash-1"));
  });
});

describe("ReleasesRepository behind the Store facade", () => {
  it("is what Store delegates to: the same rows come back through the facade", async () => {
    const { db, repo } = await fixture();
    const store = new Store(db);
    const release = await create(repo);
    expect(await store.getRelease(release.id)).toEqual(await repo.getRelease(release.id));
    expect(await store.listReleases("site-1")).toEqual(await repo.listReleases("site-1"));

    await store.activateRelease({ siteId: "site-1", releaseId: release.id, buildRef: "build-1" });
    expect(await repo.getActiveReleaseId("site-1")).toBe(release.id);
    expect(await store.getActiveReleaseId("site-1")).toBe(release.id);
  });
});
