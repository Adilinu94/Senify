import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Store } from "@senify/engine";
import { SCHEMA_STATEMENTS, SITE_SCOPED_TABLES } from "../src/db.ts";
import { removeSiteFiles } from "../src/storage.ts";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  TEST_AUTHOR,
  type BootEnv,
  type MutationsResponse,
} from "./helpers.ts";

// Deleting a site must delete everything that belongs to it. Six tables carry a
// foreign key to `sites` and cascade; the others hold a bare `site_id` and used
// to survive: audit entries, releases, previews (a valid token kept serving the
// site), assets, import jobs - and the e-mail addresses in `newsletter_tokens`.

function siteTables(): { cascaded: string[]; bare: string[] } {
  const cascaded: string[] = [];
  const bare: string[] = [];
  for (const statement of SCHEMA_STATEMENTS) {
    const created = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*)\)\s*$/.exec(statement);
    if (created?.[1] === undefined || created[2] === undefined) continue;
    if (!/\bsite_id\b/.test(created[2])) continue;
    (/REFERENCES\s+sites\s*\(id\)\s+ON DELETE CASCADE/.test(created[2]) ? cascaded : bare).push(created[1]);
  }
  return { cascaded, bare };
}

describe("the list of site-scoped tables", () => {
  it("names exactly the tables with a bare site_id, so none is forgotten", () => {
    const { bare } = siteTables();
    expect([...SITE_SCOPED_TABLES].sort()).toEqual([...bare].sort());
  });
});

async function count(env: BootEnv, table: string, siteId: string): Promise<number> {
  const result = await env.db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${table} WHERE site_id = $1`,
    [siteId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

describe("deleting a site", () => {
  it("entfernt indirekte Asset-Daten, Review-Dateien und Proposals auch nach gelöschter Quellseite", async () => {
    const env = await bootEngine();
    try {
      const store = new Store(env.db);
      const doomed = await createTestSite(env.api, "Wird gelöscht");
      const kept = await createTestSite(env.api, "Bleibt");
      const markers: { siteId: string; kind: string; id: string }[] = [];
      for (const site of [doomed, kept]) {
        const page = await createTestPage(env.api, site.id, { title: "Quelle", path: "/" });
        const assetId = `asset-${site.id}`;
        await store.createAsset({
          id: assetId, siteId: site.id, filename: "x.txt", mime: "text/plain", kind: "document", byteSize: 1,
          width: null, height: null, hash: "hash", altText: null, decorative: false,
          folderId: null, tags: [], storageRef: `assets/${site.id}/${assetId}/x.txt`,
        });
        await env.db.query(
          `INSERT INTO asset_history (id, asset_id, storage_ref, mime, byte_size, created_at)
           VALUES ($1, $2, 'history/x.txt', 'text/plain', 1, now())`, [`hist-${site.id}`, assetId],
        );
        await env.db.query(
          `INSERT INTO asset_variants (id, asset_id, width, format, storage_ref, byte_size, created_at)
           VALUES ($1, $2, 100, 'webp', 'variants/100.webp', 1, now())`, [`var-${site.id}`, assetId],
        );
        await env.db.query(`INSERT INTO asset_blurhash VALUES ($1, 'hash', now())`, [assetId]);
        const releaseId = `rel-${site.id}`;
        await env.db.query(
          `INSERT INTO releases (id, site_id, page_revisions, theme_snapshot, build_ref, author, created_at)
           VALUES ($1, $2, '[]'::jsonb, '{}'::jsonb, $3, $4::jsonb, now())`,
          [releaseId, site.id, join(env.dataDir, "releases", releaseId), JSON.stringify(TEST_AUTHOR)],
        );
        const reviewId = `review-${site.id}`;
        await env.db.query(
          `INSERT INTO review_items (id, site_id, base_state, pages, author, status, structure_diff, guardrails, thread, created_at)
           VALUES ($1, $2, '{}'::jsonb, '[]'::jsonb, $3::jsonb, 'pending', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, now())`,
          [reviewId, site.id, JSON.stringify(TEST_AUTHOR)],
        );
        const proposalId = `proposal-${site.id}`;
        await store.createRedesignProposal({
          id: proposalId, sourcePageId: page.id, cards: [],
          basis: { source: { siteId: site.id, pageId: page.id, title: page.title, path: "/", draftVersion: 1, themeVersion: 1 }, references: [] },
        });
        for (const [kind, id] of [["releases", releaseId], ["reviews", reviewId], ["redesign-proposals", proposalId]] as const) {
          const dir = join(env.dataDir, kind, id);
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, "private.txt"), "private");
          markers.push({ siteId: site.id, kind, id });
        }
        // Proposals intentionally survive an individual Page deletion, but not
        // deletion of their Site. Ownership is still present in basis.source.
        if (site.id === doomed.id) await store.deletePage(page.id);
      }
      expect((await env.api.request({ method: "DELETE", path: `/api/sites/${doomed.id}` })).status).toBe(204);
      for (const table of ["asset_history", "asset_variants", "asset_blurhash"]) {
        expect((await env.db.query(`SELECT * FROM ${table} WHERE asset_id = $1`, [`asset-${doomed.id}`])).rows, table).toEqual([]);
        expect((await env.db.query(`SELECT * FROM ${table} WHERE asset_id = $1`, [`asset-${kept.id}`])).rows, table).toHaveLength(1);
      }
      expect((await env.db.query(`SELECT id FROM redesign_proposals`)).rows).toEqual([{ id: `proposal-${kept.id}` }]);
      for (const marker of markers) {
        expect(existsSync(join(env.dataDir, marker.kind, marker.id, "private.txt")), marker.kind).toBe(marker.siteId === kept.id);
      }
    } finally {
      await env.close();
    }
  });

  it("leaves no row, token or file of the site behind - and none of another site is touched", async () => {
    const env = await bootEngine();
    try {
      const doomed = await createTestSite(env.api, "Zu loeschen");
      const kept = await createTestSite(env.api, "Bleibt");
      const page = await createTestPage(env.api, doomed.id, { title: "Start", path: "/" });
      await createTestPage(env.api, kept.id, { title: "Bleibt", path: "/" });
      // A real write leaves an audit entry; the rest is seeded because the HTTP
      // surface needs a full bake to produce it.
      const mutation = await env.api.request<MutationsResponse>({
        method: "POST",
        path: `/api/pages/${page.id}/mutations`,
        body: {
          baseDraftVersion: page.draftVersion,
          author: TEST_AUTHOR,
          mutations: [{ op: "updatePageMeta", title: "Neuer Titel" }],
        },
      });
      expect(mutation.status).toBe(200);

      const buildOf = (siteId: string) => join(env.dataDir, "previews", `pv-${siteId}`);
      const assetOf = (siteId: string) => join(env.dataDir, "assets", siteId, "a1", "x.txt");
      for (const siteId of [doomed.id, kept.id]) {
        mkdirSync(buildOf(siteId), { recursive: true });
        writeFileSync(join(buildOf(siteId), "index.html"), "<html></html>");
        mkdirSync(join(env.dataDir, "assets", siteId, "a1"), { recursive: true });
        writeFileSync(assetOf(siteId), "x");
        await env.db.query(
          `INSERT INTO newsletter_tokens (token, site_id, form_id, entry_id, email, kind, status, created_at)
           VALUES ($1, $2, 'f', 'e', 'person@example.test', 'confirm', 'open', now())`,
          [`tok-${siteId}`, siteId],
        );
        await env.db.query(
          `INSERT INTO previews (id, site_id, build_ref, token, status, created_by, created_at, expires_at)
           VALUES ($1, $2, $3, $4, 'ready', $5::jsonb, now(), now() + interval '1 day')`,
          [`pv-${siteId}`, siteId, buildOf(siteId), `ptok-${siteId}`, JSON.stringify(TEST_AUTHOR)],
        );
      }
      expect(await count(env, "audit_entries", doomed.id)).toBeGreaterThan(0);

      const removed = await env.api.request({ method: "DELETE", path: `/api/sites/${doomed.id}` });
      expect(removed.status).toBe(204);

      for (const table of SITE_SCOPED_TABLES) {
        expect(await count(env, table, doomed.id), table).toBe(0);
      }
      for (const table of ["pages", "themes"]) {
        expect(await count(env, table, doomed.id), table).toBe(0);
        expect(await count(env, table, kept.id), table).toBe(1);
      }
      expect(await count(env, "newsletter_tokens", kept.id)).toBe(1);
      expect(await count(env, "previews", kept.id)).toBe(1);
      // The files go with it: the asset folder and the build directory.
      expect(existsSync(join(env.dataDir, "assets", doomed.id))).toBe(false);
      expect(existsSync(buildOf(doomed.id))).toBe(false);
      expect(existsSync(assetOf(kept.id))).toBe(true);
      expect(existsSync(buildOf(kept.id))).toBe(true);
      const preview = await fetch(`${env.server.origin}/api/previews/pv-${doomed.id}/files/index.html?token=ptok-${doomed.id}`);
      expect(preview.status).toBe(404);
    } finally {
      await env.close();
    }
  });

  it("still answers 404 for a site that does not exist", async () => {
    const env = await bootEngine();
    try {
      const response = await env.api.request({ method: "DELETE", path: "/api/sites/gibt-es-nicht" });
      expect(response.status).toBe(404);
    } finally {
      await env.close();
    }
  });

  it("entfernt unfertige Releases und ältere Proposals über ihre noch vorhandene Quellseite", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Unfertiger Build");
      const page = await createTestPage(env.api, site.id, { title: "Quelle", path: "/" });
      await env.db.query(
        `INSERT INTO releases (id, site_id, page_revisions, theme_snapshot, author, created_at)
         VALUES ('release-partial', $1, '[]'::jsonb, '{}'::jsonb, $2::jsonb, now())`,
        [site.id, JSON.stringify(TEST_AUTHOR)],
      );
      await env.db.query(
        `INSERT INTO redesign_proposals (id, source_page_id, status, cards, basis, created_at)
         VALUES ('proposal-old', $1, 'proposed', '[]'::jsonb, '{}'::jsonb, now())`, [page.id],
      );
      const directories = [
        join(env.dataDir, "releases", "release-partial"),
        join(env.dataDir, "redesign-proposals", "proposal-old"),
      ];
      for (const dir of directories) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "partial.txt"), "private");
      }
      expect((await env.api.request({ method: "DELETE", path: `/api/sites/${site.id}` })).status).toBe(204);
      expect((await env.db.query(`SELECT * FROM redesign_proposals`)).rows).toEqual([]);
      for (const dir of directories) expect(existsSync(dir)).toBe(false);
    } finally {
      await env.close();
    }
  });

  it("ignoriert beschädigte Build-Verweise und erhält fremde Dateien", async () => {
    const env = await bootEngine();
    try {
      const doomed = await createTestSite(env.api, "Beschädigte Verweise");
      const kept = await createTestSite(env.api, "Bleibt erhalten");
      const keptBuild = join(env.dataDir, "previews", "pv-kept");
      const keptAsset = join(env.dataDir, "assets", kept.id, "x.txt");
      mkdirSync(keptBuild, { recursive: true });
      mkdirSync(join(env.dataDir, "assets", kept.id), { recursive: true });
      writeFileSync(join(keptBuild, "index.html"), "kept");
      writeFileSync(keptAsset, "kept");
      const refs = [env.dataDir, join(env.dataDir, "assets"), keptBuild];
      for (const [index, ref] of refs.entries()) {
        await env.db.query(
          `INSERT INTO previews (id, site_id, build_ref, token, status, created_by, created_at, expires_at)
           VALUES ($1, $2, $3, $4, 'ready', $5::jsonb, now(), now() + interval '1 day')`,
          [`pv-corrupt-${index}`, doomed.id, ref, `ptok-corrupt-${index}`, JSON.stringify(TEST_AUTHOR)],
        );
      }
      expect((await env.api.request({ method: "DELETE", path: `/api/sites/${doomed.id}` })).status).toBe(204);
      expect(existsSync(keptAsset)).toBe(true);
      expect(existsSync(join(keptBuild, "index.html"))).toBe(true);
    } finally {
      await env.close();
    }
  });
});

describe("Dateigrenze beim Site-Löschen", () => {
  it("lässt Review- und Proposal-IDs weder Speicherwurzeln noch fremde Pfade entfernen", () => {
    const root = mkdtempSync(join(tmpdir(), "senify-delete-ids-"));
    try {
      const marker = join(root, "keep.txt");
      const nested = join(root, "reviews", "keep", "nested");
      const keptAssets = join(root, "assets", "keep");
      mkdirSync(nested, { recursive: true });
      mkdirSync(keptAssets, { recursive: true });
      writeFileSync(marker, "keep");
      writeFileSync(join(nested, "keep.txt"), "keep");
      writeFileSync(join(keptAssets, "keep.txt"), "keep");
      removeSiteFiles(root, "../assets/keep", [
        { kind: "reviews", id: ".." },
        { kind: "redesign-proposals", id: "../reviews" },
        { kind: "reviews", id: "keep/nested" },
        { kind: "reviews", id: "../reviews/keep" },
        { kind: "reviews", id: "unused/../keep" },
        { kind: "reviews", id: "..\\reviews\\keep" },
      ]);
      expect(existsSync(marker)).toBe(true);
      expect(existsSync(join(nested, "keep.txt"))).toBe(true);
      expect(existsSync(join(keptAssets, "keep.txt"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lässt eine Site-ID nicht aus dem Asset-Ordner ausbrechen", () => {
    const root = mkdtempSync(join(tmpdir(), "senify-delete-guard-"));
    try {
      const marker = join(root, "keep.txt");
      writeFileSync(marker, "keep");
      removeSiteFiles(root, "..", []);
      expect(existsSync(marker)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
