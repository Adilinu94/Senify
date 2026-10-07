import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { createApiHarness } from "@senify/core/testing";
import { PAGE_ROOT_TYPE, type NodeTree } from "@senify/section-sdk";
import { defaultTheme } from "@senify/tokens";
import {
  bakePages,
  imageDimensions,
  runChecks,
  VARIANT_WIDTHS,
  type AssetUsage,
  type Page,
  type Site,
} from "@senify/engine";
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

// Header-only fixtures: the upload validation reads dimensions from the file
// header, no pixel data is needed.
function pngBytes(width: number, height: number, padding = 0): Buffer {
  const buffer = Buffer.alloc(24 + padding);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function gifBytes(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(10);
  buffer.write("GIF89a", 0, "ascii");
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

function jpegBytes(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(12);
  buffer.writeUInt16BE(0xffd8, 0);
  buffer[2] = 0xff;
  buffer[3] = 0xc0;
  buffer.writeUInt16BE(0x0011, 4);
  buffer[6] = 0x08;
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  return buffer;
}

function webpBytes(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(22, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

// Real (decodable) pixels for the variant pipeline; the palette keeps even
// wide images well under the test upload cap of 4 KB.
function realPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 140, b: 90 } },
  })
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();
}

type AssetResponse = {
  id: string;
  siteId: string;
  filename: string;
  mime: string;
  kind: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  hash: string;
  altText: string | null;
  decorative: boolean;
  folderId: string | null;
  tags: string[];
  storageRef: string;
  status: string;
  replacedAt: string | null;
  trashedAt: string | null;
  variants: {
    id: string;
    assetId: string;
    width: number;
    format: string;
    storageRef: string;
    byteSize: number;
    createdAt: string;
  }[];
  blurhash: string | null;
};

type UploadResponse = { asset: AssetResponse; deduped: boolean };

type FolderResponse = {
  id: string;
  siteId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

type HistoryResponse = {
  history: {
    id: string;
    assetId: string;
    storageRef: string;
    mime: string;
    byteSize: number;
    createdAt: string;
  }[];
};

let env: BootEnv;

const MAX_UPLOAD_BYTES = 4096;

async function requestUploadUrl(
  siteId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: { uploadId: string; url: string; expiresAt: string } & ErrorResponse }> {
  return env.api.request({ method: "POST", path: `/api/sites/${siteId}/assets/upload-url`, body });
}

async function putBytes(
  url: string,
  data: Buffer,
  contentType: string,
): Promise<{ status: number; body: UploadResponse & ErrorResponse }> {
  const response = await fetch(`${env.server.origin}${url}`, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: new Uint8Array(data),
  });
  const body = (await response.json().catch(() => undefined)) as UploadResponse &
    ErrorResponse;
  return { status: response.status, body };
}

async function uploadAsset(
  siteId: string,
  filename: string,
  data: Buffer,
  mime: string,
  extra: Record<string, unknown> = {},
): Promise<UploadResponse> {
  const ticket = await requestUploadUrl(siteId, {
    filename,
    mime,
    byteSize: data.length,
    ...extra,
  });
  expect(ticket.status).toBe(201);
  const uploaded = await putBytes(ticket.body.url, data, mime);
  expect(uploaded.status).toBe(201);
  return uploaded.body;
}

async function listAssets(
  siteId: string,
  query = "",
): Promise<AssetResponse[]> {
  const response = await env.api.request<{ assets: AssetResponse[] }>({
    method: "GET",
    path: `/api/sites/${siteId}/assets${query}`,
  });
  expect(response.status).toBe(200);
  return response.body.assets;
}

async function fetchAssetFile(asset: AssetResponse): Promise<Response> {
  return fetch(
    `${env.server.origin}/assets/${asset.id}/${encodeURIComponent(asset.filename)}`,
  );
}

beforeAll(async () => {
  env = await bootEngine({ maxUploadBytes: MAX_UPLOAD_BYTES });
});

afterAll(async () => {
  await env.close();
});

describe("asset ownership (ADR-0014)", () => {
  it("refuses every id-based access to an asset of another site", async () => {
    const owner = (await createTestSite(env.api, "Eigentümer")).id;
    const other = (await createTestSite(env.api, "Fremde Site")).id;
    const uploaded = await uploadAsset(owner, "motiv.png", pngBytes(120, 90), "image/png", {
      altText: "Motiv",
      tags: ["start"],
    });
    const assetId = uploaded.asset.id;
    const folder = await env.api.request<FolderResponse>({
      method: "POST",
      path: `/api/sites/${owner}/asset-folders`,
      body: { name: "Motive" },
    });
    expect(folder.status).toBe(201);

    const read = await env.api.request({
      method: "GET",
      path: `/api/sites/${other}/assets/${assetId}`,
    });
    expect(read.status).toBe(400);
    expect((read.body as ErrorResponse).error.field).toBe("assetId");

    const patch = await env.api.request<ErrorResponse>({
      method: "PATCH",
      path: `/api/sites/${other}/assets/${assetId}`,
      body: { tags: ["fremd"] },
    });
    expect(patch.status).toBe(400);
    expect(patch.body.error.field).toBe("assetId");

    const trash = await env.api.request<ErrorResponse>({
      method: "DELETE",
      path: `/api/sites/${other}/assets/${assetId}`,
    });
    expect(trash.status).toBe(400);

    const restore = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${other}/assets/${assetId}/restore`,
    });
    expect(restore.status).toBe(400);

    const history = await env.api.request<ErrorResponse>({
      method: "GET",
      path: `/api/sites/${other}/assets/${assetId}/history`,
    });
    expect(history.status).toBe(400);

    const folderDelete = await env.api.request<ErrorResponse>({
      method: "DELETE",
      path: `/api/sites/${other}/asset-folders/${folder.body.id}`,
    });
    expect(folderDelete.status).toBe(400);
    expect(folderDelete.body.error.field).toBe("folderId");

    // The purge is the dangerous one: it deletes files, so it must not even
    // reach the source site.
    const purge = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${other}/assets/${assetId}/purge`,
    });
    expect(purge.status).toBe(400);
    expect(existsSync(join(env.engine.dataDir, uploaded.asset.storageRef))).toBe(true);

    // The source is untouched: the rejected patch wrote nothing.
    const unchanged = (await env.api.request<AssetResponse>({
      method: "GET",
      path: `/api/sites/${owner}/assets/${assetId}`,
    })).body;
    expect(unchanged.tags).toEqual(["start"]);
    expect(unchanged.status).toBe("ready");
  }, 60000);

  it("serves assets with nosniff and sandboxes SVG so a script cannot run as a document", async () => {
    const siteId = (await createTestSite(env.api, "Inhaltsschutz")).id;
    const svg = (marker: string): Buffer =>
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg"><!-- ${marker} --><script>alert(1)</script></svg>`,
      );
    const vector = await uploadAsset(siteId, "vektor.svg", svg("a"), "image/svg+xml");
    // Browsers compare the MIME type case-insensitively; the upload check does not.
    const shouted = await uploadAsset(siteId, "gross.svg", svg("b"), "image/SVG+XML");
    const raster = await uploadAsset(siteId, "punkt.png", pngBytes(4, 4), "image/png");

    for (const uploaded of [vector, shouted]) {
      const response = await fetchAssetFile(uploaded.asset);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toBe("sandbox");
    }
    // Raster images cannot carry script; they only get nosniff.
    const png = await fetchAssetFile(raster.asset);
    expect(png.headers.get("x-content-type-options")).toBe("nosniff");
    expect(png.headers.get("content-security-policy")).toBeNull();
  }, 60000);

  it("keeps the same operations working for the owning site", async () => {
    const siteId = (await createTestSite(env.api, "Eigentümerarbeit")).id;
    const uploaded = await uploadAsset(siteId, "bild.png", pngBytes(80, 60), "image/png");

    const patched = await env.api.request<AssetResponse>({
      method: "PATCH",
      path: `/api/sites/${siteId}/assets/${uploaded.asset.id}`,
      body: { altText: "Klar" },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.altText).toBe("Klar");

    const trashed = await env.api.request<AssetResponse>({
      method: "DELETE",
      path: `/api/sites/${siteId}/assets/${uploaded.asset.id}`,
    });
    expect(trashed.status).toBe(200);
    expect(trashed.body.status).toBe("trashed");

    const restored = await env.api.request<AssetResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/${uploaded.asset.id}/restore`,
    });
    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe("ready");

    const purged = await env.api.request<{ purged: string }>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/${uploaded.asset.id}/purge`,
    });
    expect(purged.status).toBe(200);
  }, 60000);
});

describe("image header parsing", () => {
  it("reads dimensions from PNG, GIF, JPEG and WebP headers", () => {
    expect(imageDimensions(pngBytes(320, 200), "image/png")).toEqual({
      width: 320,
      height: 200,
    });
    expect(imageDimensions(gifBytes(64, 48), "image/gif")).toEqual({
      width: 64,
      height: 48,
    });
    expect(imageDimensions(jpegBytes(1600, 900), "image/jpeg")).toEqual({
      width: 1600,
      height: 900,
    });
    expect(imageDimensions(webpBytes(1024, 768), "image/webp")).toEqual({
      width: 1024,
      height: 768,
    });
    expect(imageDimensions(Buffer.from("nicht wirklich ein bild"), "image/png")).toBeUndefined();
  });
});

describe("signed upload and dedupe", () => {
  it("uploads bytes behind a signed URL and dedupes identical files", async () => {
    const siteId = (await createTestSite(env.api, "Upload Studio")).id;
    const bytes = pngBytes(320, 200);

    const first = await uploadAsset(siteId, "motiv.png", bytes, "image/png", {
      altText: "Werkstatt am Morgen",
      tags: ["hero"],
    });
    expect(first.deduped).toBe(false);
    expect(first.asset.kind).toBe("image");
    expect(first.asset.width).toBe(320);
    expect(first.asset.height).toBe(200);
    expect(first.asset.byteSize).toBe(bytes.length);
    expect(first.asset.altText).toBe("Werkstatt am Morgen");
    expect(first.asset.tags).toEqual(["hero"]);
    expect(first.asset.status).toBe("ready");

    const again = await uploadAsset(siteId, "kopie.png", bytes, "image/png");
    expect(again.deduped).toBe(true);
    expect(again.asset.id).toBe(first.asset.id);

    const assets = await listAssets(siteId);
    expect(assets).toHaveLength(1);

    const served = await fetchAssetFile(first.asset);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(bytes);

    const unknown = await fetch(
      `${env.server.origin}/assets/${first.asset.id}/falsch.png`,
    );
    expect(unknown.status).toBe(404);
  });

  it("rejects a tampered or missing upload token", async () => {
    const siteId = (await createTestSite(env.api, "Upload Tokens")).id;
    const ticket = await requestUploadUrl(siteId, {
      filename: "motiv.png",
      mime: "image/png",
      byteSize: 24,
    });
    const withoutToken = await putBytes(
      `/api/assets/upload/${ticket.body.uploadId}`,
      pngBytes(8, 8),
      "image/png",
    );
    expect(withoutToken.status).toBe(401);

    const tampered = await putBytes(
      `/api/assets/upload/${ticket.body.uploadId}?token=AAAA.BBBB`,
      pngBytes(8, 8),
      "image/png",
    );
    expect(tampered.status).toBe(401);
  });
});

describe("upload validation", () => {
  it("rejects media types outside the allowlist", async () => {
    const siteId = (await createTestSite(env.api, "Allowlist")).id;
    const response = await requestUploadUrl(siteId, {
      filename: "notes.txt",
      mime: "text/plain",
      byteSize: 10,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.field).toBe("mime");
    expect(response.body.error.suggestion).toContain("image/*");
  });

  it("rejects declared and actual sizes over the limit", async () => {
    const siteId = (await createTestSite(env.api, "Limits")).id;
    const tooBig = await requestUploadUrl(siteId, {
      filename: "riesig.png",
      mime: "image/png",
      byteSize: MAX_UPLOAD_BYTES + 1,
    });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error.field).toBe("byteSize");

    const ticket = await requestUploadUrl(siteId, {
      filename: "motiv.png",
      mime: "image/png",
      byteSize: MAX_UPLOAD_BYTES,
    });
    const oversized = await putBytes(
      ticket.body.url,
      pngBytes(10, 10, MAX_UPLOAD_BYTES),
      "image/png",
    );
    expect(oversized.status).toBe(400);
    expect(oversized.body.error.field).toBe("file");
  });
});

describe("library: folders, tags and smart lists", () => {
  it("filters by folder, tag, missing alt, size and query", async () => {
    const siteId = (await createTestSite(env.api, "Library")).id;
    const small = await uploadAsset(siteId, "atelier.png", pngBytes(100, 100), "image/png", {
      altText: "Atelier",
      tags: ["hero"],
    });
    const big = await uploadAsset(
      siteId,
      "materiallager.png",
      pngBytes(640, 480, 3000),
      "image/png",
    );

    const folder = await env.api.request<FolderResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/asset-folders`,
      body: { name: "Motive" },
    });
    expect(folder.status).toBe(201);

    const patched = await env.api.request<AssetResponse>({
      method: "PATCH",
      path: `/api/sites/${siteId}/assets/${small.asset.id}`,
      body: { folderId: folder.body.id, tags: ["hero", "startseite"] },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.folderId).toBe(folder.body.id);
    expect(patched.body.tags).toEqual(["hero", "startseite"]);

    const inFolder = await listAssets(siteId, `?folder=${folder.body.id}`);
    expect(inFolder.map((asset) => asset.id)).toEqual([small.asset.id]);
    const withoutFolder = await listAssets(siteId, "?folder=none");
    expect(withoutFolder.map((asset) => asset.id)).toEqual([big.asset.id]);

    const byTag = await listAssets(siteId, "?tag=hero");
    expect(byTag.map((asset) => asset.id)).toEqual([small.asset.id]);
    const withoutTags = await listAssets(siteId, "?tag=none");
    expect(withoutTags.map((asset) => asset.id)).toEqual([big.asset.id]);

    const missingAlt = await listAssets(siteId, "?alt=missing");
    expect(missingAlt.map((asset) => asset.id)).toEqual([big.asset.id]);
    const largeFiles = await listAssets(siteId, "?minBytes=2000");
    expect(largeFiles.map((asset) => asset.id)).toEqual([big.asset.id]);

    const search = await listAssets(siteId, "?q=material");
    expect(search.map((asset) => asset.id)).toEqual([big.asset.id]);

    const byName = await listAssets(siteId, "?sort=name");
    expect(byName.map((asset) => asset.filename)).toEqual([
      "atelier.png",
      "materiallager.png",
    ]);

    const folders = await env.api.request<{ folders: FolderResponse[] }>({
      method: "GET",
      path: `/api/sites/${siteId}/asset-folders`,
    });
    expect(folders.body.folders).toHaveLength(1);

    const removed = await env.api.request({
      method: "DELETE",
      path: `/api/sites/${siteId}/asset-folders/${folder.body.id}`,
    });
    expect(removed.status).toBe(204);
    const afterDelete = await env.api.request<AssetResponse>({
      method: "GET",
      path: `/api/sites/${siteId}/assets/${small.asset.id}`,
    });
    expect(afterDelete.body.folderId).toBeNull();
  });

  it("rejects unknown sorts and malformed filters", async () => {
    const siteId = (await createTestSite(env.api, "Library Errors")).id;
    const badSort = await env.api.request<ErrorResponse>({
      method: "GET",
      path: `/api/sites/${siteId}/assets?sort=chaos`,
    });
    expect(badSort.status).toBe(400);
    expect(badSort.body.error.field).toBe("sort");

    const badFolder = await env.api.request<ErrorResponse>({
      method: "POST",
      path: "/api/assets/nicht-da",
      body: { tags: ["x"] },
    });
    expect(badFolder.status).toBe(404);
  });
});

describe("replace, history and restore", () => {
  it("keeps id and url, records history and restores the previous file", async () => {
    const siteId = (await createTestSite(env.api, "Replace")).id;
    const original = pngBytes(100, 50);
    const created = await uploadAsset(
      siteId,
      "motiv.png",
      original,
      "image/png",
      { altText: "Original" },
    );
    const replacement = pngBytes(100, 80);

    const ticket = await requestUploadUrl(siteId, {
      filename: "motiv-neu.png",
      mime: "image/png",
      byteSize: replacement.length,
      replaceAssetId: created.asset.id,
    });
    expect(ticket.status).toBe(201);
    const replaced = await putBytes(ticket.body.url, replacement, "image/png");
    expect(replaced.status).toBe(201);
    expect(replaced.body.deduped).toBe(false);
    expect(replaced.body.asset.id).toBe(created.asset.id);
    // The URL stays stable even when the replacement file has another name.
    expect(replaced.body.asset.filename).toBe("motiv.png");
    expect(replaced.body.asset.height).toBe(80);
    expect(replaced.body.asset.altText).toBe("Original");
    expect(replaced.body.asset.replacedAt).not.toBeNull();

    const history = await env.api.request<HistoryResponse>({
      method: "GET",
      path: `/api/sites/${siteId}/assets/${created.asset.id}/history`,
    });
    expect(history.body.history).toHaveLength(1);
    const previous = history.body.history[0];
    expect(previous?.byteSize).toBe(original.length);

    const servedNow = await fetchAssetFile(replaced.body.asset);
    expect(Buffer.from(await servedNow.arrayBuffer())).toEqual(replacement);

    const restored = await env.api.request<AssetResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/${created.asset.id}/restore-history/${previous?.id}`,
    });
    expect(restored.status).toBe(200);
    expect(restored.body.byteSize).toBe(original.length);
    expect(restored.body.height).toBe(50);

    const servedAgain = await fetchAssetFile(replaced.body.asset);
    expect(Buffer.from(await servedAgain.arrayBuffer())).toEqual(original);

    const afterRestore = await env.api.request<HistoryResponse>({
      method: "GET",
      path: `/api/sites/${siteId}/assets/${created.asset.id}/history`,
    });
    expect(afterRestore.body.history).toHaveLength(2);

    const sortedByReplace = await listAssets(siteId, "?sort=replacedAt");
    expect(sortedByReplace[0]?.id).toBe(created.asset.id);

    const missing = await requestUploadUrl(siteId, {
      filename: "motiv.png",
      mime: "image/png",
      byteSize: 24,
      replaceAssetId: "gibt-es-nicht",
    });
    expect(missing.status).toBe(404);
  });
});

describe("trash, purge and bulk", () => {
  it("soft-deletes, restores and purges assets", async () => {
    const siteId = (await createTestSite(env.api, "Trash")).id;
    const asset = await uploadAsset(siteId, "motiv.png", pngBytes(20, 20), "image/png");

    const trashed = await env.api.request<AssetResponse>({
      method: "DELETE",
      path: `/api/sites/${siteId}/assets/${asset.asset.id}`,
    });
    expect(trashed.status).toBe(200);
    expect(trashed.body.status).toBe("trashed");
    expect(trashed.body.trashedAt).not.toBeNull();
    expect((await listAssets(siteId)).map((entry) => entry.id)).toEqual([]);
    expect((await listAssets(siteId, "?status=trashed")).map((entry) => entry.id)).toEqual([
      asset.asset.id,
    ]);
    expect((await fetchAssetFile(asset.asset)).status).toBe(404);

    const restored = await env.api.request<AssetResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/${asset.asset.id}/restore`,
    });
    expect(restored.body.status).toBe("ready");
    expect((await fetchAssetFile(asset.asset)).status).toBe(200);

    const purged = await env.api.request<{ purged: string }>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/${asset.asset.id}/purge`,
    });
    expect(purged.status).toBe(200);
    expect(purged.body.purged).toBe(asset.asset.id);
    const gone = await env.api.request<ErrorResponse>({
      method: "GET",
      path: `/api/sites/${siteId}/assets/${asset.asset.id}`,
    });
    expect(gone.status).toBe(404);
    expect(existsSync(join(env.engine.dataDir, asset.asset.storageRef))).toBe(false);
  });

  it("reports bulk results per id and gates purge on the publish scope", async () => {
    const siteId = (await createTestSite(env.api, "Bulk")).id;
    const first = await uploadAsset(siteId, "eins.png", pngBytes(16, 16), "image/png");
    const second = await uploadAsset(siteId, "zwei.png", pngBytes(17, 17), "image/png");

    const patched = await env.api.request<{
      updated: number;
      failed: { id: string; reason: string }[];
    }>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/bulk`,
      body: { ids: [first.asset.id, second.asset.id, "unbekannt"], patch: { tags: ["bulk"] } },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.updated).toBe(2);
    expect(patched.body.failed).toHaveLength(1);
    expect(patched.body.failed[0]?.id).toBe("unbekannt");

    const trashed = await env.api.request<{ updated: number }>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/bulk`,
      body: { ids: [second.asset.id], trash: true },
    });
    expect(trashed.body.updated).toBe(1);
    const secondNow = await env.api.request<AssetResponse>({
      method: "GET",
      path: `/api/sites/${siteId}/assets/${second.asset.id}`,
    });
    expect(secondNow.body.status).toBe("trashed");

    const noOperation = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/bulk`,
      body: { ids: [first.asset.id] },
    });
    expect(noOperation.status).toBe(400);

    const created = await env.humanApi.request<{ secret: string }>({
      method: "POST",
      path: "/api/tokens",
      body: { name: "media-writer", scopes: ["read", "write"] },
    });
    const writer = createApiHarness(env.server.origin, { token: created.body.secret });
    const deniedPurge = await writer.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/bulk`,
      body: { ids: [first.asset.id], purge: true },
    });
    expect(deniedPurge.status).toBe(403);
    expect(deniedPurge.body.error.category).toBe("auth");

    const purged = await env.api.request<{ updated: number }>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/bulk`,
      body: { ids: [first.asset.id], purge: true },
    });
    expect(purged.body.updated).toBe(1);
  });
});

describe("image variant ladder and blurhash", () => {
  it("builds AVIF/WebP rungs up to the original width plus a blurhash", async () => {
    const siteId = (await createTestSite(env.api, "Varianten")).id;
    const uploaded = await uploadAsset(
      siteId,
      "werkstatt.png",
      await realPng(1200, 800),
      "image/png",
      { altText: "Werkstatt" },
    );

    const widths = [
      ...new Set(uploaded.asset.variants.map((variant) => variant.width)),
    ].sort((a, b) => a - b);
    expect(widths).toEqual([64, 320, 640, 1024]);
    expect(widths.every((width) => VARIANT_WIDTHS.includes(width))).toBe(true);
    expect(widths.every((width) => width <= 1200)).toBe(true);
    expect(
      [...new Set(uploaded.asset.variants.map((variant) => variant.format))].sort(),
    ).toEqual(["avif", "webp"]);
    expect(uploaded.asset.variants).toHaveLength(8);

    expect(typeof uploaded.asset.blurhash).toBe("string");
    expect(uploaded.asset.blurhash).not.toBe("");

    const webp = uploaded.asset.variants.find(
      (variant) => variant.format === "webp" && variant.width === 640,
    );
    expect(webp).toBeDefined();
    expect(existsSync(join(env.engine.dataDir, webp?.storageRef ?? ""))).toBe(true);

    const served = await fetch(
      `${env.server.origin}/assets/${uploaded.asset.id}/variants/${webp?.width}.${webp?.format}`,
    );
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");

    const purged = await env.api.request<{ purged: string }>({
      method: "POST",
      path: `/api/sites/${siteId}/assets/${uploaded.asset.id}/purge`,
    });
    expect(purged.status).toBe(200);
    expect(
      existsSync(
        join(env.engine.dataDir, "assets", siteId, uploaded.asset.id, "variants"),
      ),
    ).toBe(false);
  }, 30000);

  it("never upscales and leaves GIF untouched", async () => {
    const siteId = (await createTestSite(env.api, "Varianten Grenzen")).id;
    const small = await uploadAsset(
      siteId,
      "winzig.png",
      await realPng(100, 60),
      "image/png",
    );
    expect([...new Set(small.asset.variants.map((variant) => variant.width))]).toEqual([
      64,
    ]);
    expect(small.asset.variants).toHaveLength(2);

    const gif = await uploadAsset(
      siteId,
      "animiert.gif",
      gifBytes(200, 120),
      "image/gif",
    );
    expect(gif.asset.variants).toEqual([]);
    expect(gif.asset.blurhash).toBeNull();
  }, 30000);
});

describe("asset reference checks", () => {
  const site: Site = {
    id: "site-media-checks",
    name: "Checks",
    slug: "checks",
    profile: "standard",
    themeId: null,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };

  function galleryPage(assetId: string): Page {
    const tree: NodeTree = {
      rootNodeId: "root",
      nodes: {
        root: { id: "root", type: PAGE_ROOT_TYPE, props: {} },
        gallery: {
          id: "gallery",
          type: "gallery",
          props: { items: [{ asset: { assetId } }] },
        },
      },
    };
    return {
      id: "page-1",
      siteId: site.id,
      path: "/",
      title: "Seite",
      meta: { description: "Beschreibung" },
      draft: tree,
      draftVersion: 1,
      template: null,
      layoutId: null,
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    };
  }

  function usage(entries: [string, AssetUsage][]): Map<string, AssetUsage> {
    return new Map(entries);
  }

  it("exempts assets marked as decorative from the alt-text rule", () => {
    const decorative = runChecks({
      stage: "submit",
      pages: [galleryPage("a1")],
      site,
      theme: defaultTheme(),
      assets: usage([["a1", { status: "ready", decorative: true }]]),
    });
    expect(
      decorative.hard.filter((issue) => issue.code === "missing-alt-text"),
    ).toHaveLength(0);

    const contentful = runChecks({
      stage: "submit",
      pages: [galleryPage("a1")],
      site,
      theme: defaultTheme(),
      assets: usage([["a1", { status: "ready", decorative: false }]]),
    });
    expect(
      contentful.hard.some((issue) => issue.code === "missing-alt-text"),
    ).toBe(true);
  });

  it("flags unknown and trashed assets as broken", () => {
    const unknown = runChecks({
      stage: "publish",
      pages: [galleryPage("fehlt")],
      site,
      theme: defaultTheme(),
      assets: usage([]),
    });
    const unknownIssue = unknown.hard.find(
      (issue) => issue.code === "broken-asset",
    );
    expect(unknownIssue?.message).toContain("does not exist");
    expect(unknownIssue?.field).toBe("items[0].asset");

    const trashed = runChecks({
      stage: "publish",
      pages: [galleryPage("weg")],
      site,
      theme: defaultTheme(),
      assets: usage([["weg", { status: "trashed", decorative: false }]]),
    });
    expect(
      trashed.hard.find((issue) => issue.code === "broken-asset")?.message,
    ).toContain("trash");
  });

  it("blocks submit when a section references a missing asset", async () => {
    const siteId = (await createTestSite(env.api, "Broken Asset")).id;
    const page = await createTestPage(env.api, siteId, { title: "Start" });
    const inserted = await insertBlock(page.id, "block-1", "nicht-vorhanden");
    expect(inserted.status).toBe(200);

    const blocked = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/reviews`,
      body: { author: TEST_AUTHOR },
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.message).toContain("does not exist");

    const uploaded = await uploadAsset(
      siteId,
      "motiv.png",
      pngBytes(30, 30),
      "image/png",
    );
    const fixed = await setBlockAsset(page.id, "block-1", uploaded.asset.id);
    expect(fixed.status).toBe(200);

    // Soft-delete the referenced asset: the reference turns broken again.
    await env.api.request({
      method: "DELETE",
      path: `/api/sites/${siteId}/assets/${uploaded.asset.id}`,
    });
    const trashedAgain = await env.api.request<ErrorResponse>({
      method: "POST",
      path: `/api/sites/${siteId}/reviews`,
      body: { author: TEST_AUTHOR },
    });
    expect(trashedAgain.status).toBe(422);
    expect(trashedAgain.body.error.message).toContain("trash");

    await env.api.request({
      method: "POST",
      path: `/api/sites/${siteId}/assets/${uploaded.asset.id}/restore`,
    });
    // The restored asset clears the check: verified against the real store,
    // because submit also bakes a preview and the test registry has no
    // registry-backed section to bake.
    const report = runChecks({
      stage: "submit",
      pages: [await env.engine.store.getPage(page.id)],
      site: await env.engine.store.getSite(siteId),
      theme: (await env.engine.store.getTheme(siteId)).theme,
      assets: await env.engine.store.assetUsageMap(siteId),
    });
    expect(report.hard).toEqual([]);
  });
});

async function loadPage(pageId: string): Promise<PageResponse> {
  const response = await env.api.request<PageResponse>({
    method: "GET",
    path: `/api/pages/${pageId}`,
  });
  expect(response.status).toBe(200);
  return response.body;
}

async function insertBlock(
  pageId: string,
  nodeId: string,
  assetId: string,
): Promise<{ status: number }> {
  const page = await loadPage(pageId);
  return applyMutationsRequest(env.api, page, [
    {
      op: "insertNode",
      parent: { nodeId: page.draft.rootNodeId },
      node: {
        id: nodeId,
        type: "block",
        props: { headline: nodeId, cover: { assetId } },
      },
    },
  ]);
}

async function setBlockAsset(
  pageId: string,
  nodeId: string,
  assetId: string,
): Promise<{ status: number }> {
  const page = await loadPage(pageId);
  return applyMutationsRequest(env.api, page, [
    { op: "updateNodeProps", id: nodeId, patch: { cover: { assetId } } },
  ]);
}

describe("bake delivers referenced assets", () => {
  it("builds <picture>/srcset for a real image and copies the ladder", async () => {
    const siteId = (await createTestSite(env.api, "Bake Media")).id;
    const uploaded = await uploadAsset(
      siteId,
      "werkstatt.png",
      await realPng(1024, 768),
      "image/png",
      { altText: "Werkstatt" },
    );
    const site = await env.engine.store.getSite(siteId);
    const page: Page = {
      id: "page-bake",
      siteId,
      path: "/",
      title: "Start",
      meta: { description: "Beschreibung" },
      draftVersion: 1,
      template: null,
      layoutId: null,
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
      draft: {
        rootNodeId: "root",
        nodes: {
          root: { id: "root", type: PAGE_ROOT_TYPE, props: {}, children: ["media"] },
          media: {
            id: "media",
            type: "media",
            variant: "image",
            props: {
              asset: { assetId: uploaded.asset.id },
              caption: "Blick in die Werkstatt",
            },
          },
        },
      },
    };

    const baked = await bakePages(env.engine.store, {
      site,
      pages: [page],
      outDir: join(env.engine.dataDir, "bake-test"),
      dataDir: env.engine.dataDir,
    });

    const copied = join(
      baked.outDir,
      "assets",
      uploaded.asset.id,
      uploaded.asset.filename,
    );
    expect(existsSync(copied)).toBe(true);
    const html = readFileSync(join(baked.outDir, "index.html"), "utf8");
    expect(html).toContain(`/assets/${uploaded.asset.id}/`);
    expect(html).toContain("<picture>");
    expect(html).toContain('type="image/avif"');
    expect(html).toContain('type="image/webp"');
    // React emits the camelCase `srcSet`; HTML parsers lowercase it to `srcset`.
    expect(html).toMatch(/srcset=/i);
    expect(html).toContain('sizes="100vw"');
    expect(html).toContain('width="1024"');
    expect(html).toContain('height="768"');
    expect(html).toContain("data-blurhash=");
    expect(html).toContain(`/assets/${uploaded.asset.id}/variants/`);

    // The ladder is copied next to the original into the build output.
    expect(
      existsSync(
        join(baked.outDir, "assets", uploaded.asset.id, "variants", "640.webp"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(baked.outDir, "assets", uploaded.asset.id, "variants", "640.avif"),
      ),
    ).toBe(true);
  }, 90000);
});

describe("release files are served with their own type", () => {
  it("names the media, font and script types a build can hold", async () => {
    const site = await createTestSite(env.api, "Dateitypen");
    const page = await createTestPage(env.api, site.id, { title: "Start", path: "/" });
    await applyMutationsRequest(env.api, await loadPage(page.id), [
      {
        op: "insertNode",
        parent: { nodeId: page.draft.rootNodeId },
        node: { id: "hero-1", type: "hero", props: { headline: "Dateitypen" } },
      },
    ]);
    const published = await env.api.request<{
      release: { id: string; buildRef: string | null };
    }>({
      method: "POST",
      path: `/api/sites/${site.id}/releases`,
      body: { author: TEST_AUTHOR },
    });
    expect(published.status).toBe(201);
    const { id, buildRef } = published.body.release;
    expect(buildRef).not.toBeNull();

    // Uploads may be any image/*, video/mp4, application/pdf or font/*; the
    // bake copies them under their own file name, so the extension decides.
    const expected: Record<string, string> = {
      "logo.gif": "image/gif",
      "clip.mp4": "video/mp4",
      "flyer.pdf": "application/pdf",
      "schrift.woff": "font/woff",
      "schrift.ttf": "font/ttf",
      "schrift.otf": "font/otf",
      "modul.mjs": "text/javascript; charset=utf-8",
      "app.js.map": "application/json; charset=utf-8",
      "site.webmanifest": "application/manifest+json; charset=utf-8",
    };
    for (const [name, type] of Object.entries(expected)) {
      writeFileSync(join(buildRef ?? "", name), "x");
      const response = await fetch(`${env.server.origin}/api/releases/${id}/files/${name}`);
      expect(response.status, name).toBe(200);
      expect(response.headers.get("content-type"), name).toBe(type);
    }
  }, 120000);
});
