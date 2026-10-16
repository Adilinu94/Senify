import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEMA_STATEMENTS, SITE_SCOPED_TABLES } from "../src/db.ts";
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
    (/REFERENCES\s+sites\s*\(id\)/.test(created[2]) ? cascaded : bare).push(created[1]);
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
  it("leaves no row, token or file of the site behind - and none of another site is touched", async () => {
    const env = await bootEngine();
    try {
      const doomed = await createTestSite(env.api, "Zu loeschen");
      const kept = await createTestSite(env.api, "Bleibt");
      const page = await createTestPage(env.api, doomed.id, { title: "Start", path: "/" });
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

      const buildOf = (siteId: string) => join(env.dataDir, "previews", `build-${siteId}`);
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
      expect(await count(env, "newsletter_tokens", kept.id)).toBe(1);
      expect(await count(env, "previews", kept.id)).toBe(1);
      // The files go with it: the asset folder and the build directory.
      expect(existsSync(join(env.dataDir, "assets", doomed.id))).toBe(false);
      expect(existsSync(buildOf(doomed.id))).toBe(false);
      expect(existsSync(assetOf(kept.id))).toBe(true);
      expect(existsSync(buildOf(kept.id))).toBe(true);
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
});
