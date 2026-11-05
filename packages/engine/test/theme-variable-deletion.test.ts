import { describe, expect, it } from "vitest";
import { Store, type Db, type DbClient } from "@senify/engine";
import { bootEngine, createTestPage, createTestSite, TEST_AUTHOR } from "./helpers.ts";

describe("unused theme variables", () => {
  it("deletes and restores an unused variable across page versions, with idempotent retries", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Variable löschen");
      const first = await createTestPage(env.api, site.id, { path: "/" });
      const second = await createTestPage(env.api, site.id, { path: "/zwei" });
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { spacing: { luft: "12px" } } } }, TEST_AUTHOR, initial.version);
      const body = { receiptId: "variable-receipt-0001", baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } };
      const path = `/api/sites/${site.id}/theme/variables/spacing/luft`;
      const deleted = await env.humanApi.request<{ receiptId: string; version: number; pageDraftVersion: number }>({ method: "POST", path: `${path}/delete`, body });
      expect(deleted.status).toBe(200);
      expect(deleted.body).toEqual({ receiptId: body.receiptId, version: theme.version + 1, pageDraftVersion: first.draftVersion + 1 });
      expect((await env.humanApi.request({ method: "POST", path: `${path}/delete`, body })).body).toEqual(deleted.body);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.spacing).not.toHaveProperty("luft");
      expect((await env.engine.store.getPage(second.id)).draftVersion).toBe(second.draftVersion + 1);
      const restoreBody = { receiptId: body.receiptId, baseThemeVersion: deleted.body.version, pageContext: { pageId: first.id, baseDraftVersion: deleted.body.pageDraftVersion } };
      const restored = await env.humanApi.request<{ version: number; pageDraftVersion: number }>({ method: "POST", path: `${path}/restore`, body: restoreBody });
      expect(restored.status).toBe(200);
      expect(restored.body).toEqual({ version: theme.version + 2, pageDraftVersion: first.draftVersion + 2 });
      expect((await env.humanApi.request({ method: "POST", path: `${path}/restore`, body: restoreBody })).body).toEqual(restored.body);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.spacing).toMatchObject({ luft: "12px" });
      expect((await env.engine.store.getPage(second.id)).draftVersion).toBe(second.draftVersion + 2);
    } finally { await env.close(); }
  });

  it("refuses used variables and generated base values without changing the theme", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Variable verwendet");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456", brand: "#234567" } } } }, TEST_AUTHOR, initial.version);
      const draft = await env.engine.store.getPage(page.id);
      draft.draft.nodes[draft.draft.rootNodeId]!.props.background = { $token: "color.marker" };
      const pageVersion = await env.engine.store.updatePage(page.id, draft.draftVersion, { draft: draft.draft, title: draft.title, path: draft.path });
      const body = { receiptId: "variable-receipt-0002", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: pageVersion } };
      const used = await env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/theme/variables/color/marker/delete`, body });
      expect(used.status).toBe(409);
      const generated = await env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/theme/variables/color/brand/delete`, body });
      expect(generated.status).toBe(409);
      const alias = await env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/theme/variables/color/accent/delete`, body });
      expect(alias.status).toBe(409);
      expect((await env.engine.store.getTheme(site.id)).version).toBe(theme.version);
      expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(pageVersion);
    } finally { await env.close(); }
  });

  it("protects class restoration receipts and refuses restoration after a later edit", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Variable und Klassenbeleg");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456", spare: "#abcdef" } } } }, TEST_AUTHOR, initial.version);
      const rule = await env.humanApi.request<{ id: string }>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "cta", styles: { color: { $token: "color.marker" } } } });
      expect(rule.status).toBe(201);
      const removed = await env.engine.store.deleteGlobalClass(site.id, rule.body.id, { baseVersion: 1, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
      const base = { receiptId: "variable-receipt-0003", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: removed.pageDraftVersion } };
      await expect(env.engine.store.deleteUnusedVariable(site.id, "color", "marker", base, TEST_AUTHOR)).rejects.toThrow(/Klassenwiederherstellung/);
      const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "spare", base, TEST_AUTHOR);
      const current = await env.engine.store.getPage(page.id);
      await env.engine.store.updatePage(page.id, current.draftVersion, { draft: current.draft, title: "Geändert", path: current.path });
      await expect(env.engine.store.restoreVariable(site.id, "color", "spare", { receiptId: base.receiptId, baseThemeVersion: deleted.version, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion } }, TEST_AUTHOR)).rejects.toThrow(/Seitenentwurf/);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).not.toHaveProperty("spare");
    } finally { await env.close(); }
  });

  it("refuses deletion while a library component is installed", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Variable und Bibliothek");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const now = new Date().toISOString();
      await env.db.query(`INSERT INTO library_components (id, name, slug, kind, definition, fingerprint, tags, provenance, license, notes, version, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11,$11)`, ["library-one", "Bibliothek", "bibliothek", "component", "{}", "library-fingerprint", "[]", "{}", "{}", "", now]);
      await env.db.query(`INSERT INTO site_library_installs (id, site_id, library_component_id, installed_version, mode, created_at, updated_at) VALUES ($1,$2,$3,1,$4,$5,$5)`, ["installation-one", site.id, "library-one", "linked", now]);
      await expect(env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { receiptId: "variable-receipt-0006", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR)).rejects.toThrow(/Bibliothekskomponenten/);
      expect((await env.engine.store.getTheme(site.id)).version).toBe(theme.version);
    } finally { await env.close(); }
  });

  it("protects variables referenced by a deleted variable's restoration receipt", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Variablenbeleg mit Verweis");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { spacing: { basis: "12px", abstand: "var(--space-basis)" } } } }, TEST_AUTHOR, initial.version);
      const deleted = await env.engine.store.deleteUnusedVariable(site.id, "spacing", "abstand", { receiptId: "variable-receipt-0007", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
      await expect(env.engine.store.deleteUnusedVariable(site.id, "spacing", "basis", { receiptId: "variable-receipt-0008", baseThemeVersion: deleted.version, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion } }, TEST_AUTHOR)).rejects.toThrow(/Variablenwiederherstellung/);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.spacing).toMatchObject({ basis: "12px" });
    } finally { await env.close(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("rolls back all version changes if the receipt cannot be written", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Variablen-Rollback");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const sabotaged: Db = {
        query: (text, params) => env.db.query(text, params),
        withTransaction: (task) => env.db.withTransaction((tx) => {
          const guarded: DbClient = { query: (text, params) => {
            if (text.startsWith("INSERT INTO theme_variable_deletions")) throw new Error("Simulated receipt failure");
            return tx.query(text, params);
          } };
          return task(guarded);
        }),
      };
      await expect(new Store(sabotaged).deleteUnusedVariable(site.id, "color", "marker", { receiptId: "variable-receipt-0004", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR)).rejects.toThrow("Simulated receipt failure");
      expect((await env.engine.store.getTheme(site.id)).version).toBe(theme.version);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).toMatchObject({ marker: "#123456" });
      expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(page.draftVersion);
    } finally { await env.close(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("detects a reference added by a concurrent page write", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Variable parallel zuweisen");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const draft = (await env.engine.store.getPage(page.id)).draft;
      draft.nodes[draft.rootNodeId]!.props.background = { $token: "color.marker" };
      let deletion: Promise<{ status: number }> | undefined;
      await env.db.withTransaction(async (tx) => {
        await tx.query(`SELECT id FROM pages WHERE id = $1 FOR UPDATE`, [page.id]);
        deletion = env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/theme/variables/color/marker/delete`, body: {
          receiptId: "variable-receipt-0005", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion },
        } });
        const deadline = Date.now() + 10000;
        let blocked = false;
        while (Date.now() < deadline) {
          await tx.query(`SELECT pg_stat_clear_snapshot()`);
          const activity = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'SELECT id, draft, draft_version FROM pages WHERE site_id = % FOR UPDATE%'`);
          if (Number(activity.rows[0]?.count) > 0) { blocked = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(blocked).toBe(true);
        await tx.query(`UPDATE pages SET draft = $2, draft_version = draft_version + 1 WHERE id = $1`, [page.id, JSON.stringify(draft)]);
      });
      expect((await deletion)?.status).toBe(409);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).toMatchObject({ marker: "#123456" });
    } finally { await env.close(); }
  }, 30000);
});
