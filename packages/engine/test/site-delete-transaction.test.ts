import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Store, type Db, type DbClient } from "@senify/engine";
import { tableNames } from "../src/db.ts";
import { removeSiteFiles } from "../src/storage.ts";
import { bootEngine, createTestPage, createTestSite, TEST_AUTHOR } from "./helpers.ts";

const hasRealPostgres = (process.env.TEST_DATABASE_URL ?? "").length > 0;

describe.skipIf(!hasRealPostgres)("Site-Löschung mit echter PostgreSQL", () => {
  it("rollt nach einem späten SQL-Fehler alle direkten, indirekten und kaskadierten Löschungen zurück", async () => {
    const env = await bootEngine();
    try {
      const store = env.engine.store;
      const site = await createTestSite(env.api, "Rollback");
      const page = await createTestPage(env.api, site.id, { title: "Quelle", path: "/" });
      await store.createRevision({
        pageId: page.id, siteId: site.id, title: page.title, path: page.path,
        tree: (await store.getPage(page.id)).draft, author: TEST_AUTHOR, note: null,
      });
      await store.createAsset({
        id: "asset-tx", siteId: site.id, filename: "private.txt", mime: "text/plain",
        kind: "document", byteSize: 1, width: null, height: null, hash: "hash",
        altText: null, decorative: false, folderId: null, tags: [],
        storageRef: `assets/${site.id}/asset-tx/private.txt`,
      });
      await env.db.query(
        `INSERT INTO asset_history VALUES ('history-tx', 'asset-tx', 'history/private.txt', 'text/plain', 1, now())`,
      );
      await env.db.query(
        `INSERT INTO asset_variants VALUES ('variant-tx', 'asset-tx', 100, 'webp', 'variants/100.webp', 1, now())`,
      );
      await env.db.query(`INSERT INTO asset_blurhash VALUES ('asset-tx', 'hash', now())`);
      await store.createRedesignProposal({
        id: "proposal-tx", sourcePageId: page.id, cards: [],
        basis: {
          source: { siteId: site.id, pageId: page.id, title: page.title, path: "/", draftVersion: 1, themeVersion: 1 },
          references: [],
        },
      });
      const previewDir = join(env.dataDir, "previews", "preview-tx");
      await env.db.query(
        `INSERT INTO previews (id, site_id, build_ref, token, status, created_by, created_at, expires_at)
         VALUES ('preview-tx', $1, $2, 'preview-token-tx', 'ready', $3::jsonb, now(), now() + interval '1 day')`,
        [site.id, previewDir, JSON.stringify(TEST_AUTHOR)],
      );
      await env.db.query(
        `INSERT INTO newsletter_tokens (token, site_id, form_id, entry_id, email, kind, status, created_at)
         VALUES ('newsletter-tx', $1, 'f', 'e', 'private@example.test', 'confirm', 'open', now())`, [site.id],
      );
      const markers = [
        join(env.dataDir, "assets", site.id, "asset-tx"),
        previewDir,
        join(env.dataDir, "redesign-proposals", "proposal-tx"),
      ].map((dir) => {
        mkdirSync(dir, { recursive: true });
        const marker = join(dir, "index.html");
        writeFileSync(marker, "private");
        return marker;
      });
      const snapshot = async () => {
        const rows: Record<string, unknown[]> = {};
        for (const table of tableNames()) {
          rows[table] = (await env.db.query(`SELECT * FROM ${table}`)).rows;
        }
        return rows;
      };
      const before = await snapshot();
      let failedAfterDeletes = false;
      const failing: Db = {
        query: (text, params) => env.db.query(text, params),
        withTransaction: (task) => env.db.withTransaction((tx) => {
          const guarded: DbClient = {
            query: (text, params) => {
              if (text.startsWith("DELETE FROM newsletter_tokens")) {
                failedAfterDeletes = true;
                // An actual SQL error aborts the PostgreSQL transaction after
                // the Site cascade and most explicit deletes have run.
                return tx.query("SELECT 1 / 0");
              }
              return tx.query(text, params);
            },
          };
          return task(guarded);
        }),
      };
      await expect(new Store(failing).deleteSite(site.id).then((removed) => {
        removeSiteFiles(env.dataDir, site.id, removed.fileRefs);
      })).rejects.toThrow(/division by zero/);
      expect(failedAfterDeletes).toBe(true);
      expect(await snapshot()).toEqual(before);
      for (const marker of markers) expect(existsSync(marker)).toBe(true);
      const preview = await fetch(`${env.server.origin}/api/previews/preview-tx/files/index.html?token=preview-token-tx`);
      expect(preview.status).toBe(200);
    } finally {
      await env.close();
    }
  });
});
