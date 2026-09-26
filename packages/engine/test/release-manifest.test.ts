import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  it("freezes a finalized release against build and manifest mutations", async () => {
    const site = await createTestSite(env.api, "Frozen Studio");
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
