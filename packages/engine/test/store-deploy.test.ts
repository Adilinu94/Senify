import { afterEach, describe, expect, it, vi } from "vitest";
import { SenifyError } from "@senify/core";
import { ensureSchema, Store } from "@senify/engine";
import { DeployRepository } from "../src/store-deploy.ts";
import { createTestDatabase, TEST_AUTHOR } from "./helpers.ts";

// ADR 0019: deployments and deploy settings live in `DeployRepository`; `Store` only delegates.
// The one thing the module needs from outside is the site existence check, handed in as a function.

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
  return { db: database.db, store, site, getSite, repo: new DeployRepository(database.db, getSite) };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const rejected = (promise: Promise<unknown>) => promise.catch((caught: unknown) => caught);

const start = (repo: DeployRepository, siteId: string, releaseId = "release-1") =>
  repo.createDeployment({
    siteId,
    releaseId,
    provider: "static",
    target: "/tmp/out",
    author: TEST_AUTHOR,
  });

describe("DeployRepository: deployments", () => {
  it("records a running deployment and finishes it as succeeded or failed", async () => {
    const { repo, site } = await fixture();
    const running = await start(repo, site.id);
    expect(running).toMatchObject({
      siteId: site.id,
      releaseId: "release-1",
      provider: "static",
      status: "running",
      target: "/tmp/out",
      fileCount: 0,
      byteSize: 0,
      error: null,
      author: TEST_AUTHOR,
      finishedAt: null,
    });

    const done = await repo.finishDeployment({
      id: running.id,
      status: "succeeded",
      fileCount: 12,
      byteSize: 3456,
    });
    expect(done).toMatchObject({ status: "succeeded", fileCount: 12, byteSize: 3456, error: null });
    expect(Number.isNaN(Date.parse(done.finishedAt ?? ""))).toBe(false);

    const second = await start(repo, site.id, "release-2");
    const failed = await repo.finishDeployment({ id: second.id, status: "failed", error: "boom" });
    expect(failed).toMatchObject({ status: "failed", fileCount: 0, byteSize: 0, error: "boom" });
  });

  it("answers an unknown deployment with a not_found error on the deploymentId field", async () => {
    const { repo } = await fixture();
    expect(await rejected(repo.getDeployment("nope"))).toMatchObject({
      category: "not_found",
      field: "deploymentId",
    });
    const error = await rejected(repo.finishDeployment({ id: "nope", status: "failed" }));
    expect(error).toBeInstanceOf(SenifyError);
    expect(error).toMatchObject({ category: "not_found", field: "deploymentId" });
  });

  it("lists the newest deployment first, per site, and clamps the limit", async () => {
    const { repo, site, store } = await fixture();
    const other = await store.createSite({ name: "Other" });
    const first = await start(repo, site.id, "release-1");
    await tick();
    const second = await start(repo, site.id, "release-2");
    await start(repo, other.id, "release-3");

    expect((await repo.listDeployments(site.id)).map((d) => d.id)).toEqual([second.id, first.id]);
    expect(await repo.listDeployments(site.id, 0)).toHaveLength(1);
    expect(await repo.listDeployments(site.id, 1)).toHaveLength(1);
  });

  it("carries the live URL of a hosted deploy into the target field", async () => {
    const { repo, site } = await fixture();
    const deployment = await start(repo, site.id);
    await repo.updateDeploymentTarget(deployment.id, "https://demo.example.net");
    expect((await repo.getDeployment(deployment.id)).target).toBe("https://demo.example.net");
  });
});

describe("DeployRepository: deploy settings", () => {
  it("returns the static defaults until something is stored", async () => {
    const { repo, site } = await fixture();
    expect(await repo.getDeploySettings(site.id)).toEqual({
      provider: "static",
      netlifySiteId: null,
      hasNetlifyToken: false,
      vercelProjectId: null,
      hasVercelToken: false,
      updatedAt: "",
    });
    expect(await repo.getNetlifyTokenEncrypted(site.id)).toBeNull();
    expect(await repo.getVercelTokenEncrypted(site.id)).toBeNull();
  });

  it("asks the injected site check first and fails when the site does not exist", async () => {
    const { repo, getSite } = await fixture();
    const read = await rejected(repo.getDeploySettings("missing"));
    expect(read).toMatchObject({ category: "not_found", field: "siteId" });
    const write = await rejected(repo.updateDeploySettings("missing", { provider: "static" }));
    expect(write).toMatchObject({ category: "not_found", field: "siteId" });
    expect(getSite).toHaveBeenCalledWith("missing");
  });

  it("keeps an omitted token, replaces a given one and clears it with null", async () => {
    const { repo, site } = await fixture();
    const saved = await repo.updateDeploySettings(site.id, {
      provider: "netlify",
      netlifySiteId: "ntl-1",
      netlifyTokenEncrypted: "enc-1",
    });
    expect(saved).toMatchObject({ provider: "netlify", netlifySiteId: "ntl-1", hasNetlifyToken: true });
    expect(Object.values(saved)).not.toContain("enc-1");
    expect(await repo.getNetlifyTokenEncrypted(site.id)).toBe("enc-1");

    await repo.updateDeploySettings(site.id, { netlifySiteId: "ntl-2" });
    expect(await repo.getNetlifyTokenEncrypted(site.id)).toBe("enc-1");
    expect((await repo.getDeploySettings(site.id)).netlifySiteId).toBe("ntl-2");

    await repo.updateDeploySettings(site.id, { netlifyTokenEncrypted: "enc-2" });
    expect(await repo.getNetlifyTokenEncrypted(site.id)).toBe("enc-2");

    const cleared = await repo.updateDeploySettings(site.id, {
      provider: "static",
      netlifyTokenEncrypted: null,
    });
    expect(cleared).toMatchObject({ provider: "static", hasNetlifyToken: false });
    expect(await repo.getNetlifyTokenEncrypted(site.id)).toBeNull();
    expect(Number.isNaN(Date.parse(cleared.updatedAt))).toBe(false);
  });

  it("refuses a hosted provider without its id and token and stores nothing", async () => {
    const { repo, site } = await fixture();
    expect(
      await rejected(repo.updateDeploySettings(site.id, { provider: "netlify", netlifySiteId: "ntl-1" })),
    ).toMatchObject({ category: "validation", field: "netlifySiteId" });
    expect(
      await rejected(repo.updateDeploySettings(site.id, { provider: "vercel", vercelTokenEncrypted: "enc-v" })),
    ).toMatchObject({ category: "validation", field: "vercelProjectId" });
    expect((await repo.getDeploySettings(site.id)).updatedAt).toBe("");

    await repo.updateDeploySettings(site.id, {
      provider: "vercel",
      vercelProjectId: "prj-1",
      vercelTokenEncrypted: "enc-v",
    });
    expect(await repo.getVercelTokenEncrypted(site.id)).toBe("enc-v");
    expect(await repo.getNetlifyTokenEncrypted(site.id)).toBeNull();
  });
});

describe("DeployRepository behind the Store facade", () => {
  it("is what Store delegates to: the same rows come back through the facade", async () => {
    const { repo, store, site } = await fixture();
    const deployment = await store.createDeployment({
      siteId: site.id,
      releaseId: "release-1",
      provider: "static",
      target: "/tmp/out",
      author: TEST_AUTHOR,
    });
    expect(await store.getDeployment(deployment.id)).toEqual(await repo.getDeployment(deployment.id));
    expect(await store.listDeployments(site.id)).toEqual(await repo.listDeployments(site.id));

    await store.updateDeploySettings(site.id, {
      provider: "vercel",
      vercelProjectId: "prj-1",
      vercelTokenEncrypted: "enc-v",
    });
    expect(await store.getDeploySettings(site.id)).toEqual(await repo.getDeploySettings(site.id));
    expect(await store.getVercelTokenEncrypted(site.id)).toBe("enc-v");
  });
});
