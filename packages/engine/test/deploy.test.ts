import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deployActiveRelease } from "@senify/engine";
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

// E14: the first deploy adapter copies the active release's build into a static
// target directory (staging + swap) and records the outcome. The route and the
// guards are pinned here.

type DeploymentBody = {
  deployment: {
    id: string;
    releaseId: string;
    provider: string;
    status: string;
    target: string;
    fileCount: number;
    byteSize: number;
    error: string | null;
  };
};

async function loadPage(env: BootEnv, pageId: string): Promise<PageResponse> {
  const response = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${pageId}`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

async function publish(env: BootEnv, siteId: string): Promise<string> {
  const published = await env.api.request<{ release: { id: string } }>({
    method: "POST",
    path: `/api/sites/${siteId}/releases`,
    body: { author: TEST_AUTHOR },
  });
  expect(published.status).toBe(201);
  return published.body.release.id;
}

describe("deploy (static)", () => {
  it("deploys the active release into a static target and records it", async () => {
    const env = await bootEngine();
    const target = mkdtempSync(join(tmpdir(), "senify-deploy-"));
    try {
      const site = await createTestSite(env.api, "Deploy-Site");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      const inserted = await applyMutationsRequest(env.api, await loadPage(env, page.id), [
        {
          op: "insertNode",
          parent: { nodeId: page.draft.rootNodeId },
          node: { id: "hero-1", type: "hero", props: { headline: "Deployed" } },
        },
      ]);
      expect(inserted.status).toBe(200);
      const releaseId = await publish(env, site.id);

      const deployed = await env.api.request<DeploymentBody & ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/deployments`,
        body: { provider: "static", targetDir: target },
      });
      expect(deployed.status).toBe(201);
      expect(deployed.body.deployment.status).toBe("succeeded");
      expect(deployed.body.deployment.releaseId).toBe(releaseId);
      expect(deployed.body.deployment.fileCount).toBeGreaterThan(0);
      expect(deployed.body.deployment.byteSize).toBeGreaterThan(0);
      expect(existsSync(join(target, "index.html"))).toBe(true);
      // The staging directory is gone after the swap.
      expect(existsSync(`${target}.senify-staging`)).toBe(false);

      const listed = await env.api.request<{ deployments: { id: string }[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/deployments`,
      });
      expect(listed.status).toBe(200);
      expect(listed.body.deployments[0]?.id).toBe(deployed.body.deployment.id);
    } finally {
      await env.close();
      rmSync(target, { recursive: true, force: true });
      rmSync(`${target}.senify-staging`, { recursive: true, force: true });
      rmSync(`${target}.senify-previous`, { recursive: true, force: true });
    }
  }, 120000);

  it("refuses a relative target and a target that overlaps the build", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Deploy-Guards");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      await applyMutationsRequest(env.api, await loadPage(env, page.id), [
        {
          op: "insertNode",
          parent: { nodeId: page.draft.rootNodeId },
          node: { id: "hero-1", type: "hero", props: { headline: "Guards" } },
        },
      ]);
      await publish(env, site.id);
      const release = await env.api.request<{ buildRef: string }>({
        method: "GET",
        path: `/api/releases/${await env.engine.store.getActiveReleaseId(site.id)}`,
      });
      const buildRef = release.body.buildRef;

      const relative = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/deployments`,
        body: { targetDir: "relativ/ziel" },
      });
      expect(relative.status).toBe(400);

      const overlap = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/deployments`,
        body: { targetDir: join(buildRef, "nested") },
      });
      expect(overlap.status).toBe(400);
      expect(overlap.body.error.message).toContain("overlaps");
    } finally {
      await env.close();
    }
  }, 120000);

  it("fails loudly without an active release", async () => {
    const env = await bootEngine();
    const target = mkdtempSync(join(tmpdir(), "senify-deploy-none-"));
    try {
      const site = await createTestSite(env.api, "Deploy-Leer");
      await expect(
        deployActiveRelease(env.engine.store, {
          siteId: site.id,
          provider: "static",
          targetDir: target,
          author: TEST_AUTHOR,
        }),
      ).rejects.toThrow(/no active release/);
      expect(existsSync(join(target, "index.html"))).toBe(false);
    } finally {
      await env.close();
      rmSync(target, { recursive: true, force: true });
    }
  }, 60000);
});

describe("deploy (netlify, E14)", () => {
  it("refuses to run without configured settings", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Netlify-Leer");
      const response = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/deployments`,
        body: { provider: "netlify" },
      });
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("nicht konfiguriert");
    } finally {
      await env.close();
    }
  }, 60000);

  it("walks the digest → upload → poll flow and records the live URL", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Netlify-Site");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      await applyMutationsRequest(env.api, await loadPage(env, page.id), [
        {
          op: "insertNode",
          parent: { nodeId: page.draft.rootNodeId },
          node: { id: "hero-1", type: "hero", props: { headline: "Netlify" } },
        },
      ]);
      await publish(env, site.id);

      // Settings: site id + token (encrypted at rest, never returned).
      const settings = await env.api.request<{
        provider: string;
        hasNetlifyToken: boolean;
        netlifySiteId: string;
      }>({
        method: "PUT",
        path: `/api/sites/${site.id}/deploy-settings`,
        body: {
          provider: "netlify",
          netlifySiteId: "net-site-123",
          netlifyToken: "nfp_test_token",
        },
      });
      expect(settings.status).toBe(200);
      expect(settings.body.provider).toBe("netlify");
      expect(settings.body.netlifySiteId).toBe("net-site-123");
      expect(settings.body.hasNetlifyToken).toBe(true);
      const readBack = JSON.stringify(settings.body);
      expect(readBack).not.toContain("nfp_test_token");

      // The fetch double plays the Netlify API: digest → required → uploads → poll.
      // The required hash must match the real SHA1 of a build file, so the
      // upload step actually triggers.
      const releaseId = await env.engine.store.getActiveReleaseId(site.id);
      const release = await env.engine.store.getRelease(releaseId ?? "");
      const indexPath = join(release.buildRef ?? "", "index.html");
      const indexHash = createHash("sha1").update(readFileSync(indexPath)).digest("hex");
      const uploadedPaths: string[] = [];
      let polls = 0;
      const fetchImpl = (async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const json = (body: unknown, status = 200): Response =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          });
        if (method === "POST" && url.endsWith("/deploys")) {
          return json({ id: "deploy-1", required: [indexHash] });
        }
        if (method === "PUT" && url.includes("/files/")) {
          uploadedPaths.push(url.split("/files/")[1] ?? "");
          return json({});
        }
        if (method === "GET" && url.includes("/deploys/deploy-1")) {
          polls += 1;
          // First poll: still uploading; second: ready with the URL.
          return polls >= 2
            ? json({ state: "ready", deploy_url: "https://net-site-123.netlify.app" })
            : json({ state: "uploading" });
        }
        return new Response("unexpected", { status: 404 });
      }) as typeof fetch;

      const deployment = await deployActiveRelease(env.engine.store, {
        siteId: site.id,
        provider: "netlify",
        targetDir: "",
        author: TEST_AUTHOR,
        fetchImpl,
        pollMs: 1,
      });
      expect(deployment.status).toBe("succeeded");
      expect(deployment.target).toBe("https://net-site-123.netlify.app");
      expect(deployment.fileCount).toBeGreaterThan(0);
      // The digest flow ran: one file upload (only the required hash), two polls.
      expect(uploadedPaths).toEqual(["index.html"]);
      expect(polls).toBe(2);

      // The history keeps the record with the live URL.
      const listed = await env.api.request<{ deployments: { target: string }[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/deployments`,
      });
      expect(listed.body.deployments[0]?.target).toBe(
        "https://net-site-123.netlify.app",
      );
    } finally {
      await env.close();
    }
  }, 120000);

  it("ends a provider request that never answers on its own deadline", async () => {
    // The poll loop has a deadline of its own, but it is only looked at
    // *between* two requests: a connection that hangs would hold the deploy
    // forever. Every request therefore carries its own signal (Fachanalyse 3,
    // B4). The double below answers after two seconds if it gets no signal -
    // that is the counter-probe: without the deadline the deploy would go
    // through instead of ending.
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Netlify-Timeout");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      await applyMutationsRequest(env.api, await loadPage(env, page.id), [
        {
          op: "insertNode",
          parent: { nodeId: page.draft.rootNodeId },
          node: { id: "hero-1", type: "hero", props: { headline: "Timeout" } },
        },
      ]);
      await publish(env, site.id);
      await env.api.request({
        method: "PUT",
        path: `/api/sites/${site.id}/deploy-settings`,
        body: {
          provider: "netlify",
          netlifySiteId: "net-site-123",
          netlifyToken: "nfp_test_token",
        },
      });

      const fetchImpl = (async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = String(input);
        const signal = init?.signal ?? null;
        const json = (body: unknown): Response =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        if (signal === null) {
          // Without a deadline the request would hang forever. The double
          // answers after two seconds instead - that is the counter-probe:
          // the deploy would go through instead of ending.
          await new Promise((done) => setTimeout(done, 2_000));
          return url.endsWith("/deploys")
            ? json({ id: "deploy-1", required: [] })
            : json({ state: "ready", deploy_url: "https://net-site-123.netlify.app" });
        }
        // A request that hangs: only the deadline ends it.
        return await new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(signal.reason ?? new Error("aborted"));
          });
        });
      }) as typeof fetch;

      const deployment = await deployActiveRelease(env.engine.store, {
        siteId: site.id,
        provider: "netlify",
        targetDir: "",
        author: TEST_AUTHOR,
        fetchImpl,
        pollMs: 1,
        requestTimeoutMs: 50,
      });
      expect(deployment.status).toBe("failed");
      expect(deployment.error).toContain("did not answer");
    } finally {
      await env.close();
    }
  }, 60000);

  it("fails with a clear auth error on a rejected token", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Netlify-Auth");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      await applyMutationsRequest(env.api, await loadPage(env, page.id), [
        {
          op: "insertNode",
          parent: { nodeId: page.draft.rootNodeId },
          node: { id: "hero-1", type: "hero", props: { headline: "Auth" } },
        },
      ]);
      await publish(env, site.id);
      await env.api.request({
        method: "PUT",
        path: `/api/sites/${site.id}/deploy-settings`,
        body: { provider: "netlify", netlifySiteId: "net-x", netlifyToken: "bad" },
      });
      const fetchImpl = (async (): Promise<Response> =>
        new Response(JSON.stringify({ message: "Invalid token" }), { status: 401 })) as typeof fetch;
      const deployment = await deployActiveRelease(env.engine.store, {
        siteId: site.id,
        provider: "netlify",
        targetDir: "",
        author: TEST_AUTHOR,
        fetchImpl,
        pollMs: 1,
      });
      expect(deployment.status).toBe("failed");
      expect(deployment.error).toContain("HTTP 401");
    } finally {
      await env.close();
    }
  }, 120000);

  it("deploys to vercel: file list → missing upload → poll ready (E14 slice 2)", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Vercel-Site");
      const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
      await applyMutationsRequest(env.api, await loadPage(env, page.id), [
        {
          op: "insertNode",
          parent: { nodeId: page.draft.rootNodeId },
          node: { id: "hero-1", type: "hero", props: { headline: "Vercel" } },
        },
      ]);
      await publish(env, site.id);

      const settings = await env.api.request<{
        provider: string;
        vercelProjectId: string;
        hasVercelToken: boolean;
      }>({
        method: "PUT",
        path: `/api/sites/${site.id}/deploy-settings`,
        body: {
          provider: "vercel",
          vercelProjectId: "prj_senify",
          vercelToken: "vercel_test_token",
        },
      });
      expect(settings.status).toBe(200);
      expect(settings.body.provider).toBe("vercel");
      expect(settings.body.vercelProjectId).toBe("prj_senify");
      expect(settings.body.hasVercelToken).toBe(true);
      expect(JSON.stringify(settings.body)).not.toContain("vercel_test_token");

      // The fetch double plays the Vercel API: create (file list) → one
      // missing upload → two polls (BUILDING, then READY).
      const releaseId = await env.engine.store.getActiveReleaseId(site.id);
      const release = await env.engine.store.getRelease(releaseId ?? "");
      const indexPath = join(release.buildRef ?? "", "index.html");
      const indexSha = createHash("sha1").update(readFileSync(indexPath)).digest("hex");
      const uploads: string[] = [];
      let polls = 0;
      const fetchImpl = (async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const json = (body: unknown, status = 200): Response =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          });
        if (method === "POST" && url.includes("/v13/deployments?")) {
          return json({
            id: "dpl_1",
            missing: [{ sha: indexSha }],
          });
        }
        if (method === "POST" && url.includes("/v2/deployments/dpl_1/files")) {
          uploads.push("file");
          return json({});
        }
        if (method === "GET" && url.includes("/v13/deployments/dpl_1")) {
          polls += 1;
          return polls >= 2
            ? json({ readyState: "READY", url: "senify-test.vercel.app" })
            : json({ readyState: "BUILDING" });
        }
        return new Response("unexpected", { status: 404 });
      }) as typeof fetch;

      const deployment = await deployActiveRelease(env.engine.store, {
        siteId: site.id,
        provider: "vercel",
        targetDir: "",
        author: TEST_AUTHOR,
        fetchImpl,
        pollMs: 1,
      });
      expect(deployment.status).toBe("succeeded");
      expect(deployment.target).toBe("https://senify-test.vercel.app");
      expect(deployment.fileCount).toBeGreaterThan(0);
      expect(uploads).toEqual(["file"]);
      expect(polls).toBe(2);

      const listed = await env.api.request<{ deployments: { target: string }[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/deployments`,
      });
      expect(listed.body.deployments[0]?.target).toBe("https://senify-test.vercel.app");
    } finally {
      await env.close();
    }
  }, 120000);

  it("rejects a vercel deploy without settings", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Vercel-Leer");
      const response = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/deployments`,
        body: { provider: "vercel" },
      });
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("nicht konfiguriert");
    } finally {
      await env.close();
    }
  }, 60000);
});
