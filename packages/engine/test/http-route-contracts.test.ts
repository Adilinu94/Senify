import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RateLimiter, type ImageSettings } from "@senify/engine";
import { createUploadSigner } from "../src/media.ts";
import type { EngineContext, Route } from "../src/http-contract.ts";
import { pageRoutes } from "../src/http-routes-pages.ts";
import { opsRoutes } from "../src/http-routes-ops.ts";
import { mediaRoutes } from "../src/http-routes-media.ts";
import { bootEngine, createTestPage, createTestSite, type BootEnv } from "./helpers.ts";

describe("HTTP-Routenvertrag", () => {
  let env: BootEnv;
  let context: EngineContext;
  let pageId: string;
  let siteId: string;
  beforeAll(async () => {
    env = await bootEngine();
    const rateLimiter = new RateLimiter({ perMinute: 1000, burst: 1000, destructivePerMinute: 1000 });
    context = { ...env.engine, rateLimiter, formRateLimiter: rateLimiter, uploadSigner: createUploadSigner("test-secret") };
    siteId = (await createTestSite(env.api)).id;
    pageId = (await createTestPage(env.api, siteId)).id;
  });
  afterAll(async () => { await env.close(); });

  it.each(["GET /api/pages/:pageId", "DELETE /api/pages/:pageId", "POST /api/pages/:pageId/mutations", "POST /api/pages/:pageId/editor-mutations", "POST /api/pages/:pageId/undo-batch", "GET /api/pages/:pageId/audit"])(
    "weist fehlende Page-Parameter vor jedem Lesen oder Schreiben zurück: %s",
    async (signature) => {
      const route: Route | undefined = pageRoutes.find((entry) => `${entry.method} /${entry.segments.join("/")}` === signature);
      if (route === undefined) throw new Error(`Route fehlt: ${signature}`);
      const req = new IncomingMessage(new Socket());
      await expect(route.handler(context, {}, req, new URL("http://localhost"), undefined)).rejects.toMatchObject({ category: "validation", field: "pageId" });
    },
  );

  it("weist fehlende Token-ID und fehlende AuthInfo am Modulvertrag zurück", async () => {
    const req = new IncomingMessage(new Socket());
    const revoke = opsRoutes.find((route) => route.method === "DELETE" && route.segments.includes(":tokenId"))!;
    await expect(revoke.handler(context, {}, req, new URL("http://localhost"), undefined)).rejects.toMatchObject({ category: "validation", field: "tokenId" });
    const whoami = opsRoutes.find((route) => route.segments.at(-1) === "whoami")!;
    await expect(whoami.handler(context, {}, req, new URL("http://localhost"), undefined)).rejects.toMatchObject({ category: "auth" });
  });

  it("weist ungültige Audit-Limits und Proposal-Status über HTTP zurück", async () => {
    for (const path of [`/api/pages/${pageId}/audit?limit=nope`, "/api/mcp/audit?limit=nope", `/api/pages/${pageId}/redesign-proposals?status=unknown`]) {
      const response = await env.api.request<{ error: { category: string; field: string } }>({ method: "GET", path });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({ category: "validation", field: path.includes("status=") ? "status" : "limit" });
    }
  });

  it("liest eine gespeicherte Revision über ihre eigene Route", async () => {
    const page = await env.engine.store.getPage(pageId);
    const revision = await env.engine.store.createRevision({ pageId, siteId: page.siteId, title: page.title, path: page.path, tree: page.draft, author: { kind: "human", id: "test", label: "Test" }, note: null });
    const response = await env.api.request<{ id: string; tree: unknown }>({ method: "GET", path: `/api/revisions/${revision.id}` });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: revision.id, tree: page.draft });
  });

  it("weist abgelaufene, falsche und fremde Upload-Tokens vor dem Lesen des Bodys zurück", async () => {
    const route = mediaRoutes.find((entry) => entry.method === "PUT")!;
    const ticket = { uploadId: "upload", siteId, assetId: "asset", replaceAssetId: null, filename: "photo.png", mime: "image/png", byteSize: 24, expiresAt: "2000-01-01T00:00:00.000Z", altText: null, decorative: true, folderId: null, tags: [] };
    for (const [token, uploadId, status] of [["invalid", "upload", 401], [context.uploadSigner.sign(ticket), "other", 401], [context.uploadSigner.sign(ticket), "upload", 400]] as const) {
      const req = new IncomingMessage(new Socket());
      const result = route.handler(context, { uploadId }, req, new URL(`http://localhost?token=${token}`), undefined);
      await expect(result).rejects.toMatchObject(status === 401 ? { status } : { category: "validation", field: "uploadId" });
    }
    expect(await env.engine.store.listAssets(siteId)).toEqual([]);
  });

  it("beschränkt Vendor- und Astro-Dateinamen auf die registrierten Pfade", async () => {
    expect((await env.api.request({ method: "GET", path: "/api/motion-vendor/unknown.js" })).status).toBe(404);
    const astro = mediaRoutes.find((entry) => entry.segments[0] === "_astro")!;
    await expect(astro.handler(context, { filename: "../secret" }, new IncomingMessage(new Socket()), new URL("http://localhost"), undefined)).rejects.toMatchObject({ category: "validation", field: "filename" });
  });

  it("liefert Originale und AVIF-Varianten und verweigert kaputte StorageRefs", async () => {
    const folder = join(env.dataDir, "assets", "route-asset");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "photo.png"), "original");
    writeFileSync(join(folder, "320.avif"), "variant");
    const asset = await env.engine.store.createAsset({ id: "route-asset", siteId, filename: "photo.png", mime: "image/png", kind: "image", byteSize: 8, width: 640, height: 480, hash: "route-hash", altText: "Foto", decorative: false, folderId: null, tags: [], storageRef: "assets/route-asset/photo.png" });
    await env.db.query("INSERT INTO asset_variants (id, asset_id, width, format, storage_ref, byte_size, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", ["route-variant", asset.id, 320, "avif", "assets/route-asset/320.avif", 7, new Date().toISOString()]);
    const original = await fetch(`${env.server.origin}/assets/${asset.id}/photo.png`);
    expect(original.status).toBe(200);
    expect(original.headers.get("content-type")).toBe("image/png");
    expect(await original.text()).toBe("original");
    const variant = await fetch(`${env.server.origin}/assets/${asset.id}/variants/320.avif`);
    expect(variant.status).toBe(200);
    expect(variant.headers.get("content-type")).toBe("image/avif");
    expect(await variant.text()).toBe("variant");
    expect((await fetch(`${env.server.origin}/assets/${asset.id}/wrong.png`)).status).toBe(404);
    await env.db.query("UPDATE assets SET storage_ref = '../outside/photo.png' WHERE id = $1", [asset.id]);
    expect((await fetch(`${env.server.origin}/assets/${asset.id}/photo.png`)).status).toBe(404);
    await env.db.query("UPDATE asset_variants SET storage_ref = '../outside/320.avif' WHERE id = $1", ["route-variant"]);
    expect((await fetch(`${env.server.origin}/assets/${asset.id}/variants/320.avif`)).status).toBe(404);
    await env.engine.store.updateAsset(asset.id, { status: "trashed" });
    expect((await fetch(`${env.server.origin}/assets/${asset.id}/variants/320.avif`)).status).toBe(404);
  });

  it("normalisiert sämtliche Image-Einstellungen und erhält ausgelassene Werte", async () => {
    const image = { provider: "off", fallbackProvider: "none", cooldownMinutes: 12, cliPath: " image-use ", baseUrl: " http://localhost:8188 ", diffusionModel: " model.safetensors ", textEncoder: " text.safetensors ", vae: " vae.safetensors ", defaultSteps: 15, maxPixels: 1024 * 1024, timeoutMinutes: 4, customBaseUrl: " https://example.test/api ", customModel: " custom-model ", customFormat: "openai", customApiKey: "test-custom-secret" };
    const response = await env.api.request({ method: "PUT", path: "/api/settings", body: { image } });
    expect(response.status).toBe(200);
    const settings = await env.engine.store.getImageSettings();
    const { customApiKey, ...publicSettings } = image;
    expect(settings).toMatchObject({ ...publicSettings, cliPath: "image-use", baseUrl: "http://localhost:8188", diffusionModel: "model.safetensors", textEncoder: "text.safetensors", vae: "vae.safetensors", customBaseUrl: "https://example.test/api", customModel: "custom-model" });
    expect(settings.customApiKeyEncrypted).toBeTruthy();
    expect(settings.customApiKeyEncrypted).not.toBe(customApiKey);
    expect(JSON.stringify(response.body)).not.toContain("test-custom-secret");
    expect((await env.api.request({ method: "PUT", path: "/api/settings", body: { image: {} } })).status).toBe(200);
    expect(await env.engine.store.getImageSettings()).toEqual(settings);
    const cleared = await env.api.request({ method: "PUT", path: "/api/settings", body: { image: { customApiKey: null } } });
    expect(cleared.status).toBe(200);
    expect((await env.engine.store.getImageSettings()).customApiKeyEncrypted).toBeNull();
    const health = await env.api.request<{ provider: ImageSettings["provider"]; providers: unknown }>({ method: "GET", path: "/api/images/health" });
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ provider: "off", providers: { "image-use": null, comfyui: null, custom: null } });
  });
});
