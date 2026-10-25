import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildRootFile } from "../src/http-build-files.ts";
import { bootEngine, createTestSite, TEST_AUTHOR, type BootEnv } from "./helpers.ts";

describe("Dateien eines Builds ausliefern", () => {
  let env: BootEnv;
  let siteId: string;
  let root: string;
  const url = (query = "") => new URL(`/assets/theme.css${query}`, env.server.origin);

  beforeAll(async () => {
    env = await bootEngine();
    siteId = (await createTestSite(env.api)).id;
    root = join(env.dataDir, "test-build");
    mkdirSync(join(root, "assets"), { recursive: true });
    mkdirSync(join(root, "nested"), { recursive: true });
    writeFileSync(join(root, "assets", "theme.css"), "body{color:red}");
    writeFileSync(join(root, "index.html"), '<a href="/nested?x=1#part">Local</a><a href="//example.test/x">Foreign</a><a href="#part">Fragment</a><img src="/assets/photo.png" srcset="/assets/photo.png 1x, /assets/photo2.png?size=2#crop 2x">');
    writeFileSync(join(root, "nested", "index.html"), "Nested index");
  });
  afterAll(async () => { await env.close(); });

  const preview = (expiresAt = "2099-01-01T00:00:00.000Z", buildRef = root) => env.engine.store.createPreview({
    siteId, buildRef, token: "preview-secret", createdBy: TEST_AUTHOR, expiresAt,
  });
  const release = (buildRef: string | null = root) => env.engine.store.createRelease({
    siteId, buildRef, pageRevisions: [], themeSnapshot: {}, author: TEST_AUTHOR,
    note: null, basisReleaseId: null,
  });

  it("meldet ohne verfügbaren Build not_found", async () => {
    await expect(buildRootFile(env.engine, url(), "assets/theme.css")).rejects.toMatchObject({ category: "not_found" });
  });

  it("wählt explizite Releases und verweigert fehlende, fremde und Verzeichnis-Pfade", async () => {
    const built = await release();
    const query = `?release=${built.id}`;
    expect(await buildRootFile(env.engine, url(query), "assets/theme.css")).toEqual({
      status: 200, file: { path: join(root, "assets", "theme.css"), headers: { "cache-control": "public, max-age=0, must-revalidate" } },
    });
    for (const path of ["../outside.css", "assets/missing.css", "nested"]) {
      await expect(buildRootFile(env.engine, url(query), path)).rejects.toMatchObject({ category: "not_found", field: "filename" });
    }
    const unbuilt = await release(null);
    await expect(buildRootFile(env.engine, url(`?release=${unbuilt.id}`), "assets/theme.css")).rejects.toMatchObject({ category: "not_found" });
  });

  it("prüft den Token auch beim expliziten Preview-Build", async () => {
    const signed = await preview();
    for (const token of ["", "x", "preview-secreX"]) {
      await expect(buildRootFile(env.engine, url(`?preview=${signed.id}&token=${token}`), "assets/theme.css")).rejects.toMatchObject({ status: 401 });
    }
    expect((await buildRootFile(env.engine, url(`?preview=${signed.id}&token=${signed.token}`), "assets/theme.css")).file.path).toBe(join(root, "assets", "theme.css"));
  });

  it("liefert Preview-HTML mit Token-Rewriting, Query und Fragment sowie Directory-Fallback", async () => {
    const signed = await preview();
    const prefix = `/api/previews/${signed.id}/files/`;
    const response = await fetch(`${env.server.origin}${prefix}?token=${signed.token}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain(`href="${prefix}nested?x=1&token=${signed.token}#part"`);
    expect(html).toContain('href="//example.test/x"');
    expect(html).toContain('href="#part"');
    expect(html).toContain(`srcset="${prefix}assets/photo.png?token=${signed.token} 1x, ${prefix}assets/photo2.png?size=2&token=${signed.token}#crop 2x"`);
    for (const path of ["nested", "nested/"]) {
      const nested = await fetch(`${env.server.origin}${prefix}${path}?token=${signed.token}`);
      expect(nested.status).toBe(200);
      expect(await nested.text()).toBe("Nested index");
    }
    const wrong = await fetch(`${env.server.origin}${prefix}?token=x`);
    expect(wrong.status).toBe(401);
    const expired = await preview("2000-01-01T00:00:00.000Z");
    const stale = await fetch(`${env.server.origin}/api/previews/${expired.id}/files/?token=${expired.token}`);
    expect(stale.status).toBe(404);
    expect((await env.engine.store.getPreview(expired.id)).status).toBe("expired");
  });

  it("überspringt veraltete Previews und priorisiert ein aktives Release vor der neuesten Preview", async () => {
    const newerRoot = join(env.dataDir, "newer-build");
    mkdirSync(join(newerRoot, "assets"), { recursive: true });
    writeFileSync(join(newerRoot, "assets", "theme.css"), "newer");
    await preview();
    const newer = await preview(undefined, newerRoot);
    await env.db.query("UPDATE previews SET created_at = $2 WHERE site_id = $1", [siteId, "2020-01-01T00:00:00.000Z"]);
    await env.db.query("UPDATE previews SET created_at = $2 WHERE id = $1", [newer.id, "2021-01-01T00:00:00.000Z"]);
    await preview("2000-01-01T00:00:00.000Z");
    const failed = await preview();
    await env.db.query("UPDATE previews SET status = 'failed' WHERE id = $1", [failed.id]);
    expect((await buildRootFile(env.engine, url(), "assets/theme.css")).file.path).toBe(join(newerRoot, "assets", "theme.css"));
    const active = await release(null);
    await env.engine.store.activateRelease({ siteId, releaseId: active.id, buildRef: root });
    expect((await buildRootFile(env.engine, url(), "assets/theme.css")).file.path).toBe(join(root, "assets", "theme.css"));
    const css = await fetch(`${env.server.origin}/assets/theme.css`);
    expect(css.status).toBe(200);
    expect(await css.text()).toBe("body{color:red}");
  });

  it("liefert Release-Verzeichnisse ohne Token und benennt Releases ohne Build", async () => {
    const built = await release();
    const response = await fetch(`${env.server.origin}/api/releases/${built.id}/files/nested`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Nested index");
    const unbuilt = await release(null);
    expect((await fetch(`${env.server.origin}/api/releases/${unbuilt.id}/files/`)).status).toBe(404);
  });
});
