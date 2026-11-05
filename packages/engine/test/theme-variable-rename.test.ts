import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bakePages, Store, type Db, type DbClient } from "@senify/engine";
import { ensureSchema, SCHEMA_STATEMENTS } from "../src/db.ts";
import { bootEngine, createTestPage, createTestSite, TEST_AUTHOR } from "./helpers.ts";

describe("renaming global variables", () => {
  it("renames references atomically across theme, classes and page drafts, and accepts a retry", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Variable umbenennen");
      const first = await createTestPage(env.api, site.id, { path: "/" });
      const second = await createTestPage(env.api, site.id, { path: "/zwei" });
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { spacing: { luft: "12px", abstand: "VAR(--space-luft)" } } } }, TEST_AUTHOR, initial.version);
      const page = await env.engine.store.getPage(first.id);
      page.draft.nodes[page.draft.rootNodeId]!.props.padding = { $token: "spacing.luft" };
      page.draft.nodes[page.draft.rootNodeId]!.props.margin = "var(--space-luft)";
      const pageVersion = await env.engine.store.updatePage(page.id, page.draftVersion, { draft: page.draft, title: page.title, path: page.path });
      const rule = await env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "luftig", styles: { margin: { $token: "spacing.luft" } } } });
      expect(rule.status).toBe(201);
      const beforeRegistry = await env.engine.store.getStyleRegistry(site.id);
      const body = { receiptId: "rename-receipt-0001", newName: "weit", baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: pageVersion } };
      const path = `/api/sites/${site.id}/theme/variables/spacing/luft/rename`;
      const renamed = await env.humanApi.request<{ receiptId: string; version: number; pageDraftVersion: number; registryVersion: number }>({ method: "POST", path, body });
      expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
      expect(renamed.body).toEqual({ receiptId: body.receiptId, version: theme.version + 1, pageDraftVersion: pageVersion + 1, registryVersion: beforeRegistry.version + 1 });
      expect((await env.humanApi.request({ method: "POST", path, body })).body).toEqual(renamed.body);
      const savedTheme = await env.engine.store.getTheme(site.id);
      expect(savedTheme.theme.tokens.primitive?.spacing).toMatchObject({ weit: "12px", abstand: "var(--space-weit)" });
      expect(savedTheme.theme.tokens.primitive?.spacing).not.toHaveProperty("luft");
      const savedPage = await env.engine.store.getPage(first.id);
      expect(savedPage.draft.nodes[savedPage.draft.rootNodeId]!.props.padding).toEqual({ $token: "spacing.weit" });
      expect(savedPage.draft.nodes[savedPage.draft.rootNodeId]!.props.margin).toBe("var(--space-weit)");
      expect((await env.engine.store.getPage(second.id)).draftVersion).toBe(second.draftVersion + 1);
      expect(JSON.stringify((await env.engine.store.getStyleRegistry(site.id)).rules)).toContain('"$token":"spacing.weit"');
      const built = await bakePages(env.engine.store, {
        site: await env.engine.store.getSite(site.id), pages: await env.engine.store.listPageDrafts(site.id),
        outDir: join(env.engine.dataDir, "rename-build"), dataDir: env.engine.dataDir,
      });
      const themeCss = readFileSync(join(built.outDir, "assets", "theme.css"), "utf8");
      const rulesCss = readFileSync(join(built.outDir, "assets", "style-rules.css"), "utf8");
      expect(themeCss).toContain("--space-weit");
      expect(themeCss).not.toContain("--space-luft");
      expect(rulesCss).toContain("var(--space-weit)");
      expect(rulesCss).not.toContain("--space-luft");
      const conflict = await env.humanApi.request({ method: "POST", path, body: { ...body, newName: "anders" } });
      expect(conflict.status).toBe(409);
    } finally { await env.close(); }
  }, 120_000);

  it("undoes and redoes a rename only while every resource is unchanged", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Umbenennung rückgängig");
      const first = await createTestPage(env.api, site.id, { path: "/" });
      const second = await createTestPage(env.api, site.id, { path: "/zwei" });
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const page = await env.engine.store.getPage(first.id);
      page.draft.nodes[page.draft.rootNodeId]!.props.background = { $token: "color.marker" };
      const pageVersion = await env.engine.store.updatePage(page.id, page.draftVersion, { draft: page.draft, title: page.title, path: page.path });
      const renamed = await env.engine.store.renameVariable(site.id, "color", "marker", { receiptId: "rename-undo-receipt-1", newName: "marke", baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: pageVersion } }, TEST_AUTHOR);
      const undo = { receiptId: "rename-undo-receipt-2", newName: "marker", undoOf: renamed.receiptId, baseThemeVersion: renamed.version, pageContext: { pageId: first.id, baseDraftVersion: renamed.pageDraftVersion } };
      const undone = await env.engine.store.renameVariable(site.id, "color", "marke", undo, TEST_AUTHOR);
      expect(await env.engine.store.renameVariable(site.id, "color", "marke", undo, TEST_AUTHOR)).toEqual(undone);
      await expect(env.engine.store.renameVariable(site.id, "color", "marke", { ...undo, undoOf: "another-rename-receipt" }, TEST_AUTHOR)).rejects.toThrow(/Beleg gehört/);
      const restored = await env.engine.store.getPage(first.id);
      expect(restored.draft.nodes[restored.draft.rootNodeId]!.props.background).toEqual({ $token: "color.marker" });
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).toMatchObject({ marker: "#123456" });
      const redo = { receiptId: "rename-undo-receipt-3", newName: "marke", undoOf: undone.receiptId, baseThemeVersion: undone.version, pageContext: { pageId: first.id, baseDraftVersion: undone.pageDraftVersion } };
      const redone = await env.engine.store.renameVariable(site.id, "color", "marker", redo, TEST_AUTHOR);
      const otherPage = await env.engine.store.getPage(second.id);
      await env.engine.store.updatePage(otherPage.id, otherPage.draftVersion, { draft: otherPage.draft, title: "Geändert", path: otherPage.path });
      const rejected = { receiptId: "rename-undo-receipt-4", newName: "marker", undoOf: redone.receiptId, baseThemeVersion: redone.version, pageContext: { pageId: first.id, baseDraftVersion: redone.pageDraftVersion } };
      await expect(env.engine.store.renameVariable(site.id, "color", "marke", rejected, TEST_AUTHOR)).rejects.toThrow(/zwischenzeitlichen Änderungen/);
      const saved = await env.engine.store.getPage(first.id);
      expect(saved.draft.nodes[saved.draft.rootNodeId]!.props.background).toEqual({ $token: "color.marke" });
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).toMatchObject({ marke: "#123456" });
    } finally { await env.close(); }
  });

  it("rejects undo after changes to the theme, registry or page list", async () => {
    const env = await bootEngine();
    try {
      for (const change of ["theme", "registry", "pages"] as const) {
        const site = await createTestSite(env.api, `Umbenennung ${change}`);
        const page = await createTestPage(env.api, site.id);
        const initial = await env.engine.store.getTheme(site.id);
        const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
        const renamed = await env.engine.store.renameVariable(site.id, "color", "marker", { receiptId: `rename-guard-${change}-01`, newName: "marke", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
        if (change === "theme") await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { extra: "#abcdef" } } } }, TEST_AUTHOR, renamed.version);
        if (change === "registry") await env.engine.store.createStyleRule(site.id, { name: "spaeter", styles: { color: { $token: "color.marke" } } }, TEST_AUTHOR);
        if (change === "pages") await createTestPage(env.api, site.id, { path: "/neu" });
        await expect(env.engine.store.renameVariable(site.id, "color", "marke", { receiptId: `rename-guard-${change}-02`, newName: "marker", undoOf: renamed.receiptId, baseThemeVersion: renamed.version, pageContext: { pageId: page.id, baseDraftVersion: renamed.pageDraftVersion } }, TEST_AUTHOR)).rejects.toThrow();
        expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).toMatchObject({ marke: "#123456" });
      }
    } finally { await env.close(); }
  });

  it("adds undo metadata to an existing rename table without losing its receipt", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Migration der Umbenennungsbelege");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const body = { receiptId: "rename-migration-receipt-1", newName: "marke", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } };
      const renamed = await env.engine.store.renameVariable(site.id, "color", "marker", body, TEST_AUTHOR);
      await env.db.query(`ALTER TABLE theme_variable_renames DROP COLUMN undo_of`);
      if (process.env.TEST_DATABASE_URL) await ensureSchema(env.db);
      else {
        const migration = SCHEMA_STATEMENTS.find((statement) => statement.includes("ALTER TABLE theme_variable_renames ADD COLUMN IF NOT EXISTS undo_of"));
        expect(migration).toBeDefined();
        await env.db.query(migration!);
      }
      expect(await env.engine.store.renameVariable(site.id, "color", "marker", body, TEST_AUTHOR)).toEqual(renamed);
      const undone = await env.engine.store.renameVariable(site.id, "color", "marke", { receiptId: "rename-migration-receipt-2", newName: "marker", undoOf: renamed.receiptId, baseThemeVersion: renamed.version, pageContext: { pageId: page.id, baseDraftVersion: renamed.pageDraftVersion } }, TEST_AUTHOR);
      expect(undone.version).toBe(renamed.version + 1);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).toMatchObject({ marker: "#123456" });
    } finally { await env.close(); }
  });

  it("refuses names already referenced and stale page versions without partial updates", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Variablenkonflikt");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const draft = await env.engine.store.getPage(page.id);
      draft.draft.nodes[draft.draft.rootNodeId]!.props.background = { $token: "color.neu" };
      const pageVersion = await env.engine.store.updatePage(page.id, draft.draftVersion, { draft: draft.draft, title: draft.title, path: draft.path });
      const base = { receiptId: "rename-receipt-0002", newName: "neu", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: pageVersion } };
      await expect(env.engine.store.renameVariable(site.id, "color", "marker", base, TEST_AUTHOR)).rejects.toThrow(/bereits referenziert/);
      await expect(env.engine.store.renameVariable(site.id, "color", "constructor", { ...base, newName: "frisch" }, TEST_AUTHOR)).rejects.toThrow(/ungültig/);
      await expect(env.engine.store.renameVariable(site.id, "color", "marker", { ...base, newName: "prototype" }, TEST_AUTHOR)).rejects.toThrow(/ungültig/);
      await expect(env.engine.store.renameVariable(site.id, "color", "marker", { ...base, newName: "frisch", pageContext: { ...base.pageContext, baseDraftVersion: pageVersion - 1 } }, TEST_AUTHOR)).rejects.toThrow();
      expect((await env.engine.store.getTheme(site.id)).version).toBe(theme.version);
      expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(pageVersion);
    } finally { await env.close(); }
  });

  it("refuses to alter CSS-like text in an unclassified content field", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Text mit CSS-Beispiel");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const draft = await env.engine.store.getPage(page.id);
      draft.draft.nodes[draft.draft.rootNodeId]!.props.text = "Beispiel: var(--color-marker)";
      const pageVersion = await env.engine.store.updatePage(page.id, draft.draftVersion, { draft: draft.draft, title: draft.title, path: draft.path });
      await expect(env.engine.store.renameVariable(site.id, "color", "marker", { receiptId: "rename-receipt-0005", newName: "neu", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: pageVersion } }, TEST_AUTHOR)).rejects.toThrow(/nicht sicher umbenannt/);
      const saved = await env.engine.store.getPage(page.id);
      expect(saved.draft.nodes[saved.draft.rootNodeId]!.props.text).toBe("Beispiel: var(--color-marker)");
      expect(saved.draftVersion).toBe(pageVersion);
      expect((await env.engine.store.getTheme(site.id)).version).toBe(theme.version);
    } finally { await env.close(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("rejects a concurrent page edit while waiting for its lock", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Umbenennen parallel");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const draft = (await env.engine.store.getPage(page.id)).draft;
      draft.nodes[draft.rootNodeId]!.props.background = { $token: "color.marker" };
      let operation: Promise<{ status: number }> | undefined;
      await env.db.withTransaction(async (tx) => {
        await tx.query(`SELECT id FROM pages WHERE id = $1 FOR UPDATE`, [page.id]);
        operation = env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/theme/variables/color/marker/rename`, body: {
          receiptId: "rename-receipt-0004", newName: "neu", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion },
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
      expect((await operation)?.status).toBe(409);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).toMatchObject({ marker: "#123456" });
    } finally { await env.close(); }
  }, 30000);

  it.skipIf(!process.env.TEST_DATABASE_URL)("rejects undo when another page changes while locks are pending", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Undo parallel");
      const first = await createTestPage(env.api, site.id, { path: "/" });
      const second = await createTestPage(env.api, site.id, { path: "/zwei" });
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const renamed = await env.engine.store.renameVariable(site.id, "color", "marker", { receiptId: "rename-concurrent-undo-1", newName: "marke", baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } }, TEST_AUTHOR);
      let operation: Promise<{ status: number }> | undefined;
      await env.db.withTransaction(async (tx) => {
        await tx.query(`SELECT id FROM pages WHERE id = $1 FOR UPDATE`, [second.id]);
        operation = env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/theme/variables/color/marke/rename`, body: {
          receiptId: "rename-concurrent-undo-2", newName: "marker", undoOf: renamed.receiptId, baseThemeVersion: renamed.version, pageContext: { pageId: first.id, baseDraftVersion: renamed.pageDraftVersion },
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
        await tx.query(`UPDATE pages SET draft_version = draft_version + 1 WHERE id = $1`, [second.id]);
      });
      expect((await operation)?.status).toBe(409);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).toMatchObject({ marke: "#123456" });
    } finally { await env.close(); }
  }, 30000);

  it.skipIf(!process.env.TEST_DATABASE_URL)("rolls back pages, rules and theme if receipt persistence fails", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Variablen-Rollback");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const registry = await env.engine.store.getStyleRegistry(site.id);
      const sabotaged: Db = {
        query: (text, params) => env.db.query(text, params),
        withTransaction: (task) => env.db.withTransaction((tx) => {
          const guarded: DbClient = { query: (text, params) => {
            if (text.startsWith("INSERT INTO theme_variable_renames")) throw new Error("Simulated receipt failure");
            return tx.query(text, params);
          } };
          return task(guarded);
        }),
      };
      await expect(new Store(sabotaged).renameVariable(site.id, "color", "marker", { receiptId: "rename-receipt-0003", newName: "neu", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR)).rejects.toThrow("Simulated receipt failure");
      expect((await env.engine.store.getTheme(site.id)).version).toBe(theme.version);
      expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(page.draftVersion);
      expect((await env.engine.store.getStyleRegistry(site.id)).version).toBe(registry.version);
    } finally { await env.close(); }
  });
});
