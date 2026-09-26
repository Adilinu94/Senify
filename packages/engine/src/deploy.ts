import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { SenifyError } from "@senify/core";
import type { Author } from "@senify/section-sdk";
import { resolveNetlifyToken, resolveVercelToken } from "./settings.ts";
import type { Store } from "./store.ts";
import type { Deployment, DeployProvider } from "./types.ts";

// Deploy (E14): the adapters deliver the active release's build. "static"
// copies into a target directory (staging + swap — a failed deploy leaves the
// previously deployed site untouched). "netlify" ships the same build through
// the Netlify API: file digest (SHA1) → upload the required files → poll for
// ready. "vercel" uploads the build files through the Vercel deployments API
// (sha1 file list → upload → poll ready). Hosted adapters plug in behind the
// same seam.

export type DeployInput = {
  siteId: string;
  provider: DeployProvider;
  targetDir: string;
  author: Author;
  // Injected fetch for tests (the Netlify API is never called for real in CI).
  fetchImpl?: typeof fetch;
  // Poll interval override for tests (default 2 s).
  pollMs?: number;
};

// Netlify file-digest deploy (docs.netlify.com/api-and-cli-guides): the
// digest names every file with its SHA1, the response lists the missing
// hashes, each one is uploaded as octet-stream, then the deploy is polled.
const NETLIFY_API = "https://api.netlify.com/api/v1";
const NETLIFY_POLL_MS = 2_000;
const NETLIFY_POLL_TIMEOUT_MS = 10 * 60 * 1_000;

function measureTree(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const info = statSync(full);
      if (info.isDirectory()) {
        walk(full);
        continue;
      }
      files += 1;
      bytes += info.size;
    }
  };
  walk(dir);
  return { files, bytes };
}

export async function deployActiveRelease(
  store: Store,
  input: DeployInput,
): Promise<Deployment> {
  if (input.provider === "netlify") {
    return deployToNetlify(store, input);
  }
  if (input.provider === "vercel") {
    return deployToVercel(store, input);
  }
  return deployToStaticDir(store, input);
}

// ------------------------------------------------------------- static target

async function deployToStaticDir(
  store: Store,
  input: DeployInput,
): Promise<Deployment> {
  const releaseId = await store.getActiveReleaseId(input.siteId);
  if (releaseId === null) {
    throw new SenifyError("validation", "Site has no active release to deploy", {
      field: "siteId",
      suggestion: "Publish a release first (publish_release).",
    });
  }
  const release = await store.getRelease(releaseId);
  if (release.buildRef === null || !existsSync(release.buildRef)) {
    throw new SenifyError(
      "validation",
      "The active release has no build to deploy",
      {
        field: "releaseId",
        suggestion: "Re-bake or publish the release again.",
      },
    );
  }
  if (!isAbsolute(input.targetDir)) {
    throw new SenifyError(
      "validation",
      "The deploy target must be an absolute path",
      {
        field: "targetDir",
        suggestion: "Pass an absolute directory, e.g. C:\\sites\\meine-seite.",
      },
    );
  }
  const target = resolve(input.targetDir);
  const build = resolve(release.buildRef);
  // Never let the swap touch the build itself: a target that contains the
  // build (or lives inside it) would move or overwrite the live release.
  if (
    build === target ||
    build.startsWith(target + sep) ||
    target.startsWith(build + sep)
  ) {
    throw new SenifyError(
      "validation",
      "The deploy target overlaps the release build",
      {
        field: "targetDir",
        suggestion: "Choose a directory outside the engine's data directory.",
      },
    );
  }

  const deployment = await store.createDeployment({
    siteId: input.siteId,
    releaseId,
    provider: input.provider,
    target,
    author: input.author,
  });

  const staging = `${target}.senify-staging`;
  const previous = `${target}.senify-previous`;
  try {
    rmSync(staging, { recursive: true, force: true });
    cpSync(build, staging, { recursive: true });
    rmSync(previous, { recursive: true, force: true });
    if (existsSync(target)) renameSync(target, previous);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(staging, target);
    rmSync(previous, { recursive: true, force: true });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    // A failed swap puts the previous state back when it was moved aside.
    if (existsSync(previous) && !existsSync(target)) {
      renameSync(previous, target);
    }
    return store.finishDeployment({
      id: deployment.id,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const measured = measureTree(target);
  return store.finishDeployment({
    id: deployment.id,
    status: "succeeded",
    fileCount: measured.files,
    byteSize: measured.bytes,
  });
}

// -------------------------------------------------------------- netlify host

type NetlifyFile = { path: string; bytes: Buffer };

function collectFiles(dir: string, base = ""): NetlifyFile[] {
  const files: NetlifyFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const relative = base === "" ? `/${entry.name}` : `${base}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, relative));
      continue;
    }
    files.push({ path: relative, bytes: readFileSync(full) });
  }
  return files;
}

async function netlifyRequest(
  token: string,
  method: string,
  path: string,
  body?: { json?: unknown; raw?: Buffer; contentType?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; json: unknown }> {
  const response = await fetchImpl(`${NETLIFY_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "user-agent": "Senify (local engine)",
      ...(body?.json !== undefined
        ? { "content-type": "application/json" }
        : body?.raw !== undefined
          ? { "content-type": body.contentType ?? "application/octet-stream" }
          : {}),
    },
    ...(body?.json !== undefined
      ? { body: JSON.stringify(body.json) }
      : body?.raw !== undefined
        ? { body: body.raw }
        : {}),
  });
  const text = await response.text();
  let json: unknown = null;
  if (text !== "") {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }
  }
  return { status: response.status, json };
}

function netlifyError(status: number, json: unknown, step: string): SenifyError {
  const message =
    typeof json === "object" && json !== null && "message" in json
      ? String((json as { message: unknown }).message)
      : JSON.stringify(json).slice(0, 300);
  const category = status === 401 || status === 403 ? "auth" : "validation";
  return new SenifyError(
    category,
    `Netlify-Deploy fehlgeschlagen (${step}, HTTP ${status}): ${message}`,
    {
      field: "provider",
      suggestion:
        status === 401 || status === 403
          ? "Netlify-Token in den Deploy-Einstellungen prüfen (Personal access token)."
          : "Erneut versuchen; der Zustand auf Netlify bleibt atomar (alter Deploy bleibt live).",
    },
  );
}

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function deployToNetlify(
  store: Store,
  input: DeployInput,
): Promise<Deployment> {
  const settings = await store.getDeploySettings(input.siteId);
  if (settings.netlifySiteId === null || settings.hasNetlifyToken === false) {
    throw new SenifyError(
      "validation",
      "Netlify ist für diese Site nicht konfiguriert",
      {
        field: "provider",
        suggestion:
          "Deploy-Einstellungen setzen: PUT /api/sites/:siteId/deploy-settings mit netlifySiteId und netlifyToken.",
      },
    );
  }
  const releaseId = await store.getActiveReleaseId(input.siteId);
  if (releaseId === null) {
    throw new SenifyError("validation", "Site has no active release to deploy", {
      field: "siteId",
      suggestion: "Publish a release first (publish_release).",
    });
  }
  const release = await store.getRelease(releaseId);
  if (release.buildRef === null || !existsSync(release.buildRef)) {
    throw new SenifyError(
      "validation",
      "The active release has no build to deploy",
      { field: "releaseId", suggestion: "Re-bake or publish the release again." },
    );
  }
  const token = await resolveNetlifyToken(store, input.siteId);
  if (token === null) {
    throw new SenifyError("auth", "Netlify token is missing", {
      field: "provider",
      suggestion: "Deploy-Einstellungen erneut setzen (netlifyToken).",
    });
  }

  const deployment = await store.createDeployment({
    siteId: input.siteId,
    releaseId,
    provider: "netlify",
    target: `netlify:${settings.netlifySiteId}`,
    author: input.author,
  });

  const fail = async (error: unknown): Promise<Deployment> =>
    store.finishDeployment({
      id: deployment.id,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });

  try {
    const files = collectFiles(release.buildRef);
    if (files.length === 0) {
      throw new SenifyError("validation", "The build is empty", {
        field: "releaseId",
      });
    }
    // 1. Digest: path → SHA1 (the format the docs recommend).
    const digest: Record<string, string> = {};
    for (const file of files) {
      digest[file.path] = createHash("sha1").update(file.bytes).digest("hex");
    }
    const created = await netlifyRequest(
      token,
      "POST",
      `/sites/${settings.netlifySiteId}/deploys`,
      { json: { files: digest } },
      input.fetchImpl,
    );
    if (created.status !== 200 && created.status !== 201) {
      throw netlifyError(created.status, created.json, "create deploy");
    }
    const deploy = created.json as { id?: string; required?: string[] };
    const deployId = deploy.id;
    if (deployId === undefined) {
      throw new SenifyError("validation", "Netlify lieferte keine Deploy-id", {
        field: "provider",
      });
    }
    // 2. Upload the files Netlify does not have yet (matched by SHA1).
    const byHash = new Map(files.map((file) => [digest[file.path] ?? "", file]));
    for (const hash of deploy.required ?? []) {
      const file = byHash.get(hash);
      if (file === undefined) continue;
      const uploaded = await netlifyRequest(
        token,
        "PUT",
        `/deploys/${deployId}/files${file.path}`,
        { raw: file.bytes },
        input.fetchImpl,
      );
      if (uploaded.status >= 400) {
        throw netlifyError(uploaded.status, uploaded.json, `upload ${file.path}`);
      }
    }
    // 3. Poll until the deploy is live (atomic on Netlify's side).
    const deadline = Date.now() + NETLIFY_POLL_TIMEOUT_MS;
    let state = "pending";
    let url = "";
    while (Date.now() < deadline) {
      await pause(input.pollMs ?? NETLIFY_POLL_MS);
      const poll = await netlifyRequest(token, "GET", `/deploys/${deployId}`, undefined, input.fetchImpl);
      if (poll.status >= 400) {
        throw netlifyError(poll.status, poll.json, "poll deploy");
      }
      const body = poll.json as { state?: string; deploy_url?: string };
      state = body.state ?? state;
      url = body.deploy_url ?? url;
      if (state === "ready") break;
      if (state === "error") {
        throw new SenifyError("validation", "Netlify meldete deploy state error", {
          field: "provider",
          suggestion: "Netlify-Dashboard prüfen (deploy log).",
        });
      }
    }
    if (state !== "ready") {
      throw new SenifyError(
        "validation",
        `Netlify-Deploy nicht bereit nach ${Math.round(NETLIFY_POLL_TIMEOUT_MS / 60_000)} min (state ${state})`,
        { field: "provider", suggestion: "Später erneut deployen oder Netlify-Dashboard prüfen." },
      );
    }
    const finished = await store.finishDeployment({
      id: deployment.id,
      status: "succeeded",
      fileCount: files.length,
      byteSize: files.reduce((sum, file) => sum + file.bytes.byteLength, 0),
    });
    // The live URL travels into the record's target field (static keeps its
    // directory, netlify gets its deploy URL).
    if (url !== "") {
      await store.updateDeploymentTarget(finished.id, url);
      return { ...finished, target: url };
    }
    return finished;
  } catch (error) {
    return fail(error);
  }
}

// --------------------------------------------------------------- vercel host

// Vercel deployments API (vercel.com/docs/rest-api/endpoints/deployments):
// create with a file list (path + sha1), upload missing files, then poll the
// deployment until READY. The project is addressed by name or id via
// `?projectId=` from the deploy settings.
const VERCEL_API = "https://api.vercel.com";
const VERCEL_POLL_MS = 2_000;
const VERCEL_POLL_TIMEOUT_MS = 10 * 60 * 1_000;

async function vercelRequest(
  token: string,
  method: string,
  path: string,
  body?: { json?: unknown; raw?: Buffer },
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; json: unknown }> {
  const response = await fetchImpl(`${VERCEL_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "user-agent": "Senify (local engine)",
      ...(body?.json !== undefined
        ? { "content-type": "application/json" }
        : body?.raw !== undefined
          ? { "content-type": "application/octet-stream" }
          : {}),
    },
    ...(body?.json !== undefined
      ? { body: JSON.stringify(body.json) }
      : body?.raw !== undefined
        ? { body: body.raw }
        : {}),
  });
  const text = await response.text();
  let json: unknown = null;
  if (text !== "") {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }
  }
  return { status: response.status, json };
}

function vercelError(status: number, json: unknown, step: string): SenifyError {
  const message =
    typeof json === "object" && json !== null && "message" in json
      ? String((json as { message: unknown }).message)
      : JSON.stringify(json).slice(0, 300);
  const category = status === 401 || status === 403 ? "auth" : "validation";
  return new SenifyError(
    category,
    `Vercel-Deploy fehlgeschlagen (${step}, HTTP ${status}): ${message}`,
    {
      field: "provider",
      suggestion:
        status === 401 || status === 403
          ? "Vercel-Token in den Deploy-Einstellungen prüfen (access token)."
          : "Erneut versuchen; der Zustand auf Vercel bleibt atomar (alter Deployment bleibt live).",
    },
  );
}

async function deployToVercel(
  store: Store,
  input: DeployInput,
): Promise<Deployment> {
  const settings = await store.getDeploySettings(input.siteId);
  if (settings.vercelProjectId === null || settings.hasVercelToken === false) {
    throw new SenifyError(
      "validation",
      "Vercel ist für diese Site nicht konfiguriert",
      {
        field: "provider",
        suggestion:
          "Deploy-Einstellungen setzen: PUT /api/sites/:siteId/deploy-settings mit vercelProjectId und vercelToken.",
      },
    );
  }
  const releaseId = await store.getActiveReleaseId(input.siteId);
  if (releaseId === null) {
    throw new SenifyError("validation", "Site has no active release to deploy", {
      field: "siteId",
      suggestion: "Publish a release first (publish_release).",
    });
  }
  const release = await store.getRelease(releaseId);
  if (release.buildRef === null || !existsSync(release.buildRef)) {
    throw new SenifyError(
      "validation",
      "The active release has no build to deploy",
      { field: "releaseId", suggestion: "Re-bake or publish the release again." },
    );
  }
  const token = await resolveVercelToken(store, input.siteId);
  if (token === null) {
    throw new SenifyError("auth", "Vercel token is missing", {
      field: "provider",
      suggestion: "Deploy-Einstellungen erneut setzen (vercelToken).",
    });
  }

  const deployment = await store.createDeployment({
    siteId: input.siteId,
    releaseId,
    provider: "vercel",
    target: `vercel:${settings.vercelProjectId}`,
    author: input.author,
  });

  const fail = async (error: unknown): Promise<Deployment> =>
    store.finishDeployment({
      id: deployment.id,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });

  try {
    const files = collectFiles(release.buildRef);
    if (files.length === 0) {
      throw new SenifyError("validation", "The build is empty", {
        field: "releaseId",
      });
    }
    // 1. Create the deployment with the file list (path + SHA1).
    const created = await vercelRequest(
      token,
      "POST",
      `/v13/deployments?projectId=${encodeURIComponent(settings.vercelProjectId)}`,
      {
        json: {
          name: settings.vercelProjectId,
          project: settings.vercelProjectId,
          files: files.map((file) => ({
            file: file.path.replace(/^\//, ""),
            sha: createHash("sha1").update(file.bytes).digest("hex"),
            size: file.bytes.byteLength,
          })),
        },
      },
      input.fetchImpl,
    );
    if (created.status !== 200 && created.status !== 201) {
      throw vercelError(created.status, created.json, "create deployment");
    }
    const body = created.json as {
      id?: string;
      missing?: { sha?: string; content?: { sha?: string } }[];
    };
    const deploymentId = body.id;
    if (deploymentId === undefined) {
      throw new SenifyError("validation", "Vercel lieferte keine Deployment-id", {
        field: "provider",
      });
    }
    // 2. Upload the files Vercel is missing (matched by SHA1).
    const bySha = new Map(
      files.map((file) => [
        createHash("sha1").update(file.bytes).digest("hex"),
        file,
      ]),
    );
    for (const entry of body.missing ?? []) {
      const sha = entry.sha ?? entry.content?.sha;
      if (sha === undefined) continue;
      const file = bySha.get(sha);
      if (file === undefined) continue;
      const uploaded = await vercelRequest(
        token,
        "POST",
        `/v2/deployments/${deploymentId}/files`,
        { raw: file.bytes },
        input.fetchImpl,
      );
      if (uploaded.status >= 400) {
        throw vercelError(uploaded.status, uploaded.json, `upload ${file.path}`);
      }
    }
    // 3. Poll until the deployment is READY (atomic on Vercel's side).
    const deadline = Date.now() + VERCEL_POLL_TIMEOUT_MS;
    let state = "QUEUED";
    let url = "";
    while (Date.now() < deadline) {
      await pause(input.pollMs ?? VERCEL_POLL_MS);
      const poll = await vercelRequest(
        token,
        "GET",
        `/v13/deployments/${deploymentId}`,
        undefined,
        input.fetchImpl,
      );
      if (poll.status >= 400) {
        throw vercelError(poll.status, poll.json, "poll deployment");
      }
      const pollBody = poll.json as { readyState?: string; url?: string };
      state = pollBody.readyState ?? state;
      url = pollBody.url ?? url;
      if (state === "READY") break;
      if (state === "ERROR" || state === "CANCELED") {
        throw new SenifyError("validation", `Vercel meldete readyState ${state}`, {
          field: "provider",
          suggestion: "Vercel-Dashboard prüfen (build logs).",
        });
      }
    }
    if (state !== "READY") {
      throw new SenifyError(
        "validation",
        `Vercel-Deploy nicht bereit nach ${Math.round(VERCEL_POLL_TIMEOUT_MS / 60_000)} min (readyState ${state})`,
        { field: "provider", suggestion: "Später erneut deployen oder Vercel-Dashboard prüfen." },
      );
    }
    const finished = await store.finishDeployment({
      id: deployment.id,
      status: "succeeded",
      fileCount: files.length,
      byteSize: files.reduce((sum, file) => sum + file.bytes.byteLength, 0),
    });
    // The live URL travels into the record's target field (static keeps its
    // directory, hosted providers get their deploy URL).
    const liveUrl = url === "" ? "" : url.startsWith("http") ? url : `https://${url}`;
    if (liveUrl !== "") {
      await store.updateDeploymentTarget(finished.id, liveUrl);
      return { ...finished, target: liveUrl };
    }
    return finished;
  } catch (error) {
    return fail(error);
  }
}
