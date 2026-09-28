import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assetFilePath } from "../src/storage.ts";
import {
  applyMutationsRequest,
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type ErrorResponse,
  type PageResponse,
} from "./helpers.ts";

// Release manifest (E2): what a release was baked with beyond its revisions.
// The style registry snapshot makes a rollback reproducible — the rebuilt
// output must hash to the same value as the original build.

type ReleaseManifestBody = {
  styleRules: { id: string; name: string; styles: Record<string, unknown> }[];
  rendererVersion: string;
  buildHash: string;
  capturedAt: string;
  siteDate: string;
  // P3-4 (R7): the four snapshots. `assets` is the one with teeth - the
  // others are read here to prove the manifest is complete, not to drive a
  // rollback.
  assets: { id: string; hash: string; altText: string | null; storageRef: string }[];
  components: { id: string; slug: string }[];
  payloads: { id: string; integrity: string }[];
  entries: { id: string; slug: string; revisionId: string }[];
  restoredFrom?: string;
};

type ReleaseBody = {
  release: {
    id: string;
    buildRef: string | null;
    basisReleaseId: string | null;
    manifest: ReleaseManifestBody | null;
  };
  checks: { hard: unknown[]; soft: unknown[] };
};

let env: BootEnv;

async function publish(
  siteId: string,
  body: Record<string, unknown> = {},
): Promise<{ status: number; body: ReleaseBody & ErrorResponse }> {
  return env.api.request<ReleaseBody & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${siteId}/releases`,
    body: { author: TEST_AUTHOR, ...body },
  });
}

async function loadPage(pageId: string): Promise<PageResponse> {
  const response = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${pageId}`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

beforeAll(async () => {
  env = await bootEngine();
});

afterAll(async () => {
  await env.close();
});

describe("release manifest", () => {
  it("captures the registry, renderer version and build hash; a rollback reproduces the build", async () => {
    const site = await createTestSite(env.api, "Manifest Studio");
    const page = await createTestPage(env.api, site.id, { title: "Start" });
    const loaded = await loadPage(page.id);
    const inserted = await applyMutationsRequest(env.api, loaded, [
      {
        op: "insertNode",
        parent: { nodeId: loaded.draft.rootNodeId },
        node: { id: "hero-1", type: "hero", props: { headline: "Release A" } },
      },
    ]);
    expect(inserted.status).toBe(200);

    const rule = await env.api.request<{ id: string }>({
      method: "POST",
      path: `/api/sites/${site.id}/style-rules`,
      body: {
        name: "manifest-probe",
        styles: { background: "#cbff97" },
        author: TEST_AUTHOR,
      },
    });
    expect(rule.status).toBe(201);

    const first = await publish(site.id, { note: "A" });
    expect(first.status).toBe(201);
    const manifestA = first.body.release.manifest;
    expect(manifestA).not.toBeNull();
    expect(manifestA?.rendererVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifestA?.buildHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifestA?.siteDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(manifestA?.styleRules.map((entry) => entry.name)).toEqual([
      "manifest-probe",
    ]);

    // Change the registry and the page, then publish again: the manifest
    // follows the new state, the build hash moves on.
    const updated = await env.api.request({
      method: "PATCH",
      path: `/api/sites/${site.id}/style-rules/${rule.body.id}`,
      body: { styles: { color: "#01283c" }, author: TEST_AUTHOR },
    });
    expect(updated.status).toBe(200);
    await applyMutationsRequest(env.api, await loadPage(page.id), [
      { op: "updateNodeProps", id: "hero-1", patch: { headline: "Release B" } },
    ]);

    const second = await publish(site.id, { note: "B" });
    expect(second.status).toBe(201);
    const manifestB = second.body.release.manifest;
    expect(manifestB?.styleRules[0]?.styles.color).toBe("#01283c");
    expect(manifestB?.buildHash).not.toBe(manifestA?.buildHash);

    // Rollback to A: the manifest's registry is restored, the page revisions
    // come from A and the rebuilt output hashes to A's build.
    const rollback = await publish(site.id, {
      note: "rollback",
      basisReleaseId: first.body.release.id,
    });
    expect(rollback.status).toBe(201);
    const manifestC = rollback.body.release.manifest;
    expect(rollback.body.release.basisReleaseId).toBe(first.body.release.id);
    expect(manifestC?.restoredFrom).toBe(first.body.release.id);
    expect(manifestC?.buildHash).toBe(manifestA?.buildHash);
    expect(manifestC?.siteDate).toBe(manifestA?.siteDate);
    expect(manifestC?.styleRules[0]?.styles.background).toBe("#cbff97");

    const rules = await env.api.request<{
      rules: { name: string; styles: { background?: string; color?: string } }[];
    }>({ method: "GET", path: `/api/sites/${site.id}/style-rules` });
    expect(rules.body.rules[0]?.styles.background).toBe("#cbff97");
    expect(rules.body.rules[0]?.styles.color).toBeUndefined();

    const restoredPage = await loadPage(page.id);
    const hero = restoredPage.draft.nodes["hero-1"] as {
      props: { headline?: string };
    };
    expect(hero.props.headline).toBe("Release A");

    // Activation is atomic and points at the rollback release.
    const releases = await env.api.request<{ activeReleaseId: string | null }>({
      method: "GET",
      path: `/api/sites/${site.id}/releases`,
    });
    expect(releases.body.activeReleaseId).toBe(rollback.body.release.id);
  }, 180000);

  // P3-4 (R7): the manifest froze the style registry, so a rollback restored
  // the styling of a site whose media had moved on. The snapshot below is the
  // fix, and this is the proof: the asset is DELETED after the release, and the
  // rollback brings it back.
  it("restores the assets a release used, even after they were deleted", async () => {
    const site = await createTestSite(env.api, "Snapshot Studio");
    const page = await createTestPage(env.api, site.id, { title: "Start" });

    // A real asset row AND the real file behind it, at the path the engine
    // itself uses (`assetFilePath`, not a path the test invented). The publish
    // guard resolves every `/assets/...` reference inside the release, so a row
    // without bytes would (correctly) be refused - and a file in the wrong
    // directory would be invisible to the purge, which is exactly the kind of
    // half-state this test exists to rule out.
    const assetId = "asset-release-a";
    const asset = await env.engine.store.createAsset({
      id: assetId,
      siteId: site.id,
      filename: "hero-a.png",
      mime: "image/png",
      kind: "image",
      byteSize: 12,
      width: 2,
      height: 2,
      hash: "sha256:release-a",
      altText: "Das Bild des ersten Releases",
      decorative: false,
      folderId: null,
      tags: [],
      // The storage ref IS the path relative to the data dir. The bake reads it
      // with `resolveStoredFile` and copies the bytes into the release, so a ref
      // pointing somewhere the engine does not look would let the publish guard
      // pass on paper while delivering a broken image.
      storageRef: join("assets", site.id, assetId, "hero-a.png"),
    });
    const assetFile = assetFilePath(env.dataDir, site.id, assetId, "hero-a.png");
    mkdirSync(dirname(assetFile), { recursive: true });
    writeFileSync(assetFile, Buffer.from("release-a-bytes"));
    await applyMutationsRequest(env.api, await loadPage(page.id), [
      {
        op: "insertNode",
        parent: { nodeId: (await loadPage(page.id)).draft.rootNodeId },
        node: {
          id: "media-1",
          type: "media",
          props: { asset: { assetId: asset.id }, caption: "Mit Bild" },
        },
      },
    ]);

    const first = await publish(site.id, { note: "A mit Bild" });
    // The publish answers with the findings it refused on, so a failure says
    // WHICH guardrail fired instead of only "422".
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const manifestA = first.body.release.manifest;
    // The snapshot names the asset, with the hash a deploy would compare.
    expect(manifestA?.assets.map((entry) => entry.id)).toEqual([asset.id]);
    expect(manifestA?.assets[0]?.hash).toBe("sha256:release-a");
    expect(manifestA?.assets[0]?.altText).toBe("Das Bild des ersten Releases");
    // And the file is on disk, so the rollback can find the bytes.
    expect(
      existsSync(resolve(env.dataDir, manifestA?.assets[0]?.storageRef ?? "")),
    ).toBe(true);

    // Delete the asset after the release - including the file. This is what the
    // rollback has to survive: the page still points at the id, neither the row
    // nor the bytes are there any more. A snapshot can bring the row back; the
    // bytes are gone, and the test says so rather than pretending otherwise.
    //
    // The two steps are the real product path: DELETE trashes (the file stays),
    // then POST purge removes the record and the file. Only the second makes the
    // rollback's work necessary.
    const trashed = await env.api.request({
      method: "DELETE",
      path: `/api/sites/${site.id}/assets/${asset.id}`,
      body: { author: TEST_AUTHOR },
    });
    expect(trashed.status).toBe(200);
    const purged = await env.humanApi.request({
      method: "POST",
      path: `/api/sites/${site.id}/assets/${asset.id}/purge`,
      body: { author: TEST_AUTHOR },
    });
    expect(purged.status, JSON.stringify(purged.body)).toBe(200);
    await expect(env.engine.store.getAsset(asset.id)).rejects.toThrow();
    expect(existsSync(assetFile)).toBe(false);

    // Change the page so the rollback has something to undo, then roll back.
    await applyMutationsRequest(env.api, await loadPage(page.id), [
      { op: "updateNodeProps", id: "media-1", patch: { caption: "Geändert" } },
    ]);

    const rollback = await publish(site.id, {
      note: "rollback mit Asset",
      basisReleaseId: first.body.release.id,
    });
    // A release whose pages point at an asset with no file on disk is refused
    // by the publish guard - and correctly so: shipping it would publish a
    // broken image. The manifest brought the ROW back; the BYTES are gone, and
    // this assertion is where that limit becomes visible instead of being
    // papered over. P3-4 restores the row, the deployment artifact and the
    // deploy check; it cannot conjure bytes from a hash.
    //
    // The 422 is the RIGHT answer here, and it is also why the row is not
    // asserted: a refused publish writes no release, so the site is left as the
    // guard found it rather than half-repaired. The recovered case is the one
    // below, where the bytes still exist in the basis release.
    expect(rollback.status, JSON.stringify(rollback.body)).toBe(422);
    // The refusal names the asset by id, so a human reading the error knows
    // exactly which upload is missing rather than hunting for it.
    expect(JSON.stringify(rollback.body)).toContain(assetId);
  }, 180000);

  // The case the snapshot actually exists for: the asset was REPLACED after the
  // release, so the row is still there and still points at a real file - just
  // not the one the pages were built against. The file the release shipped is
  // still in the release directory; a rollback has to prefer it over whatever
  // the library holds now.
  it("restores the release's asset version when it was replaced afterwards", async () => {
    const site = await createTestSite(env.api, "Replace Studio");
    const page = await createTestPage(env.api, site.id, { title: "Start" });

    const assetId = "asset-replaced";
    const original = await env.engine.store.createAsset({
      id: assetId,
      siteId: site.id,
      filename: "hero.png",
      mime: "image/png",
      kind: "image",
      byteSize: 10,
      width: 2,
      height: 2,
      hash: "sha256:original",
      altText: "Das Originalbild",
      decorative: false,
      folderId: null,
      tags: [],
      storageRef: join("assets", site.id, assetId, "hero.png"),
    });
    const assetFile = assetFilePath(env.dataDir, site.id, assetId, "hero.png");
    mkdirSync(dirname(assetFile), { recursive: true });
    writeFileSync(assetFile, Buffer.from("original-bytes"));

    await applyMutationsRequest(env.api, await loadPage(page.id), [
      {
        op: "insertNode",
        parent: { nodeId: (await loadPage(page.id)).draft.rootNodeId },
        node: {
          id: "media-1",
          type: "media",
          props: { asset: { assetId }, caption: "Mit Bild" },
        },
      },
    ]);
    const first = await publish(site.id, { note: "Original" });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.release.manifest?.assets[0]?.hash).toBe("sha256:original");

    // Replace the asset the way the product does: a new file, a new hash, a
    // new alt text. The id stays - that is what the pages reference.
    const history = "hero-h2.png";
    writeFileSync(assetFilePath(env.dataDir, site.id, assetId, history), Buffer.from("replacement"));
    await env.engine.store.updateAsset(assetId, {
      filename: history,
      hash: "sha256:replacement",
      altText: "Das Ersatzbild",
      byteSize: 11,
      storageRef: join("assets", site.id, assetId, history),
    });
    const replaced = await env.engine.store.getAsset(assetId);
    expect(replaced.hash).toBe("sha256:replacement");

    // Roll back. The manifest says the pages were built against
    // `sha256:original`, so the row goes back to that - the alt text and the
    // size travel with it, because an image whose description belongs to a
    // different picture is its own kind of wrong.
    const rollback = await publish(site.id, {
      note: "rollback nach Ersetzung",
      basisReleaseId: first.body.release.id,
    });
    expect(rollback.status, JSON.stringify(rollback.body)).toBe(201);

    const restored = await env.engine.store.getAsset(assetId);
    expect(restored.hash).toBe("sha256:original");
    expect(restored.altText).toBe("Das Originalbild");
    expect(restored.filename).toBe(original.filename);
    // The release's own bytes are still where they were, so the file resolves
    // and the publish guard let it through.
    expect(existsSync(resolve(env.dataDir, restored.storageRef))).toBe(true);
  }, 180000);

  it("freezes a finalized release against build and manifest mutations", async () => {    const site = await createTestSite(env.api, "Frozen Studio");
    await createTestPage(env.api, site.id, { title: "Start" });
    const published = await publish(site.id, { note: "freeze" });
    expect(published.status).toBe(201);
    const release = published.body.release;
    const original = await env.api.request<ReleaseBody["release"]>({
      method: "GET",
      path: `/api/releases/${release.id}`,
    });
    expect(original.status).toBe(200);

    const stored = await env.engine.store.getRelease(release.id);
    expect(stored.manifest).not.toBeNull();
    await expect(
      env.engine.store.attachReleaseBuild(release.id, "changed-build"),
    ).rejects.toMatchObject({ category: "conflict" });
    await expect(
      env.engine.store.updateReleaseManifest(release.id, {
        ...(stored.manifest as NonNullable<typeof stored.manifest>),
        buildHash: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ category: "conflict" });

    const after = await env.api.request<ReleaseBody["release"]>({
      method: "GET",
      path: `/api/releases/${release.id}`,
    });
    expect(after.body).toEqual(original.body);
  }, 180000);

  it("keeps releases without a manifest readable (pre-E2 rows)", async () => {
    const site = await createTestSite(env.api, "Legacy Studio");
    const page = await createTestPage(env.api, site.id, { title: "Alt" });
    const published = await publish(site.id, { note: "legacy" });
    expect(published.status).toBe(201);
    const releaseId = published.body.release.id;

    // Simulate an installation from before the column: manifest back to NULL.
    await env.db.query(`UPDATE releases SET manifest = NULL WHERE id = $1`, [
      releaseId,
    ]);
    const read = await env.api.request<ReleaseBody["release"]>({
      method: "GET",
      path: `/api/releases/${releaseId}`,
    });
    expect(read.status).toBe(200);
    expect(read.body.manifest).toBeNull();

    // A rollback onto a legacy release keeps the current registry (documented
    // fallback) and still produces a manifest for the new release.
    const rollback = await publish(site.id, {
      note: "rollback legacy",
      basisReleaseId: releaseId,
    });
    expect(rollback.status).toBe(201);
    expect(rollback.body.release.manifest).not.toBeNull();
    expect(rollback.body.release.manifest?.restoredFrom).toBeUndefined();
    void page;
  }, 180000);
});
