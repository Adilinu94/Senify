import { describe, expect, it } from "vitest";
import { Store, type Db, type DbClient } from "@senify/engine";
import { ensureSchema, SCHEMA_STATEMENTS } from "../src/db.ts";
import { bootEngine, createTestPage, createTestSite, TEST_AUTHOR } from "./helpers.ts";

describe("unused theme variables", () => {
  it("restores after page, registry and theme edits are reverted and binds retries to that request", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Restore nach gemischten Schritten");
      const first = await createTestPage(env.api, site.id, { path: "/" });
      const second = await createTestPage(env.api, site.id, { path: "/zwei" });
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456", andere: "#abcdef" } } } }, TEST_AUTHOR, initial.version);
      const human = { ...TEST_AUTHOR, kind: "human" as const };
      const rule = await env.engine.store.createStyleRule(site.id, { name: "cta", styles: { color: "#abcdef" } }, human);
      const deletion = { receiptId: "delete-restored-state-1", baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } };
      const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", deletion, TEST_AUTHOR);
      for (const page of [first, second]) {
        const before = await env.engine.store.getPage(page.id);
        const draft = structuredClone(before.draft);
        draft.nodes[draft.rootNodeId]!.props.text = "Zwischenstand";
        const changed = await env.engine.store.updatePage(page.id, before.draftVersion, { draft, title: "Zwischentitel", path: before.path });
        await env.engine.store.updatePage(page.id, changed, { draft: before.draft, title: before.title, path: before.path });
      }
      await env.engine.store.updateStyleRule(site.id, rule.id, { styles: { color: "#112233" } }, human);
      await env.engine.store.updateStyleRule(site.id, rule.id, { styles: { color: "#abcdef" } }, human);
      const changedTheme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { andere: "#112233" } } } }, TEST_AUTHOR, deleted.version);
      const revertedTheme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { andere: "#abcdef" } } } }, TEST_AUTHOR, changedTheme.version);
      const currentPage = await env.engine.store.getPage(first.id);
      const input = { receiptId: deleted.receiptId, baseThemeVersion: revertedTheme.version, pageContext: { pageId: first.id, baseDraftVersion: currentPage.draftVersion } };
      const restored = await env.engine.store.restoreVariable(site.id, "color", "marker", input, TEST_AUTHOR);
      expect(restored).toEqual({ version: input.baseThemeVersion + 1, pageDraftVersion: input.pageContext.baseDraftVersion + 1 });
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).toMatchObject({ marker: "#123456" });
      expect((await env.engine.store.getPage(second.id)).draftVersion).toBe(second.draftVersion + 4);
      const currentTheme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#445566" } } } }, TEST_AUTHOR, restored.version);
      expect(await env.engine.store.restoreVariable(site.id, "color", "marker", input, TEST_AUTHOR)).toEqual(restored);
      expect((await env.engine.store.getTheme(site.id)).version).toBe(currentTheme.version);
      await expect(env.engine.store.restoreVariable(site.id, "color", "marker", { ...input, baseThemeVersion: deleted.version, pageContext: { pageId: first.id, baseDraftVersion: deleted.pageDraftVersion } }, TEST_AUTHOR)).rejects.toThrow(/bereits wiederhergestellt/);
      await expect(env.engine.store.restoreVariable(site.id, "color", "marker", { ...input, pageContext: { pageId: second.id, baseDraftVersion: input.pageContext.baseDraftVersion } }, TEST_AUTHOR)).rejects.toThrow(/bereits wiederhergestellt/);
    } finally { await env.close(); }
  });

  it("binds a new deletion receipt to the exact originating page request", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Delete Request-Basis");
      const first = await createTestPage(env.api, site.id, { path: "/" });
      const second = await createTestPage(env.api, site.id, { path: "/zwei" });
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const input = { receiptId: "delete-bound-request-1", baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } };
      const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", input, TEST_AUTHOR);
      expect(await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", input, TEST_AUTHOR)).toEqual(deleted);
      await expect(env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { ...input, pageContext: { pageId: second.id, baseDraftVersion: second.draftVersion } }, TEST_AUTHOR)).rejects.toThrow(/anderen Änderung/);
    } finally { await env.close(); }
  });

  it("rejects content or page identity changes despite current request versions", async () => {
    const env = await bootEngine();
    try {
      for (const change of ["theme", "registry", "draft", "title", "path", "meta", "pages", "identity", "legacy", "partial", "page-hash"] as const) {
        const site = await createTestSite(env.api, `Restore Schutz ${change}`);
        const first = await createTestPage(env.api, site.id, { path: "/" });
        const second = await createTestPage(env.api, site.id, { path: "/zwei" });
        const initial = await env.engine.store.getTheme(site.id);
        const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
        const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { receiptId: `delete-content-${change}-1`, baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } }, TEST_AUTHOR);
        if (change === "theme") await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { extra: "#abcdef" } } } }, TEST_AUTHOR, deleted.version);
        if (change === "registry") await env.engine.store.createStyleRule(site.id, { name: "spaeter" }, TEST_AUTHOR);
        if (change === "draft") {
          const page = await env.engine.store.getPage(second.id);
          page.draft.nodes[page.draft.rootNodeId]!.props.text = "Anderer Inhalt";
          await env.engine.store.updatePage(page.id, page.draftVersion, { draft: page.draft, title: page.title, path: page.path });
        }
        if (change === "title") await env.db.query(`UPDATE pages SET title = $2, draft_version = draft_version + 1 WHERE id = $1`, [second.id, "Anderer Titel"]);
        if (change === "path") await env.db.query(`UPDATE pages SET path = $2, draft_version = draft_version + 1 WHERE id = $1`, [second.id, "/anders"]);
        if (change === "meta") await env.db.query(`UPDATE pages SET meta = $2, draft_version = draft_version + 1 WHERE id = $1`, [second.id, JSON.stringify({ description: "Anderer Inhalt" })]);
        if (change === "pages") await createTestPage(env.api, site.id, { path: "/neu" });
        if (change === "identity") await env.db.query(`UPDATE pages SET id = $2 WHERE id = $1`, [second.id, "ersetzte-page-identitaet"]);
        if (change === "legacy" || change === "partial" || change === "page-hash") {
          await env.db.query(`UPDATE pages SET draft_version = draft_version + 1 WHERE id = $1`, [second.id]);
          if (change === "page-hash") await env.db.query(`UPDATE theme_variable_deletions SET pages = $2 WHERE id = $1`, [deleted.receiptId, JSON.stringify([{ pageId: first.id, version: deleted.pageDraftVersion }, { pageId: second.id, version: second.draftVersion + 1 }])]);
          else await env.db.query(`UPDATE theme_variable_deletions SET resource_hashes = $2 WHERE id = $1`, [deleted.receiptId, change === "legacy" ? null : JSON.stringify({ theme: "invalid" })]);
        }
        const currentTheme = await env.engine.store.getTheme(site.id);
        const currentPage = await env.engine.store.getPage(first.id);
        await expect(env.engine.store.restoreVariable(site.id, "color", "marker", { receiptId: deleted.receiptId, baseThemeVersion: currentTheme.version, pageContext: { pageId: first.id, baseDraftVersion: currentPage.draftVersion } }, TEST_AUTHOR)).rejects.toThrow(/seit dem Löschen/);
        expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).not.toHaveProperty("marker");
        expect((await env.engine.store.getPage(first.id)).draftVersion).toBe(currentPage.draftVersion);
      }
    } finally { await env.close(); }
  });

  it("does not hide raw registry changes behind its tolerant read parser", async () => {
    const env = await bootEngine();
    try {
      for (const change of ["invalid-entry", "unknown-field", "stored-order"] as const) {
        const site = await createTestSite(env.api, `Restore Registry-Rohinhalt ${change}`);
        const page = await createTestPage(env.api, site.id);
        const initial = await env.engine.store.getTheme(site.id);
        const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
        const rule = await env.engine.store.createStyleRule(site.id, { name: "cta", styles: { color: "#abcdef" } }, TEST_AUTHOR);
        const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { receiptId: `delete-raw-registry-${change}`, baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
        const rules: unknown[] = change === "invalid-entry" ? [rule, { styles: { color: "#112233" } }] : [{ ...rule, ...(change === "unknown-field" ? { futureContent: { reference: "color.extra" } } : { order: 99 }) }];
        await env.db.query(`UPDATE sites SET style_rules_json = $2, style_rules_version = style_rules_version + 1 WHERE id = $1`, [site.id, JSON.stringify(rules)]);
        await expect(env.engine.store.restoreVariable(site.id, "color", "marker", { receiptId: deleted.receiptId, baseThemeVersion: deleted.version, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion } }, TEST_AUTHOR)).rejects.toThrow(/seit dem Löschen/);
        expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).not.toHaveProperty("marker");
        expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(deleted.pageDraftVersion);
      }
    } finally { await env.close(); }
  });

  it("checks current theme and page request versions even when content matches", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Restore veraltete Request-Basis");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { receiptId: "delete-stale-request-1", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
      await env.db.query(`UPDATE pages SET draft_version = draft_version + 1 WHERE id = $1`, [page.id]);
      await env.db.query(`UPDATE themes SET version = version + 1 WHERE site_id = $1`, [site.id]);
      const input = { receiptId: deleted.receiptId, baseThemeVersion: deleted.version + 1, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion + 1 } };
      await expect(env.engine.store.restoreVariable(site.id, "color", "marker", { ...input, baseThemeVersion: deleted.version }, TEST_AUTHOR)).rejects.toThrow();
      await expect(env.engine.store.restoreVariable(site.id, "color", "marker", { ...input, pageContext: { ...input.pageContext, baseDraftVersion: deleted.pageDraftVersion } }, TEST_AUTHOR)).rejects.toThrow();
      expect(await env.engine.store.restoreVariable(site.id, "color", "marker", input, TEST_AUTHOR)).toEqual({ version: input.baseThemeVersion + 1, pageDraftVersion: input.pageContext.baseDraftVersion + 1 });
    } finally { await env.close(); }
  });

  it("migrates legacy deletion receipts and retains their strict restoration and retry contract", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Migration Delete-Belege");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const input = { receiptId: "delete-migration-1", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } };
      const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", input, TEST_AUTHOR);
      for (const column of ["resource_hashes", "request_basis", "restore_result"]) await env.db.query(`ALTER TABLE theme_variable_deletions DROP COLUMN ${column}`);
      if (process.env.TEST_DATABASE_URL) await ensureSchema(env.db);
      else for (const column of ["resource_hashes", "request_basis", "restore_result"]) {
        const migration = SCHEMA_STATEMENTS.find((statement) => statement.includes(`ALTER TABLE theme_variable_deletions ADD COLUMN IF NOT EXISTS ${column}`));
        expect(migration).toBeDefined();
        await env.db.query(migration!);
      }
      expect(await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", input, TEST_AUTHOR)).toEqual(deleted);
      const restoreInput = { receiptId: deleted.receiptId, baseThemeVersion: deleted.version, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion } };
      const restored = await env.engine.store.restoreVariable(site.id, "color", "marker", restoreInput, TEST_AUTHOR);
      await env.db.query(`UPDATE theme_variable_deletions SET restore_result = NULL WHERE id = $1`, [deleted.receiptId]);
      expect(await env.engine.store.restoreVariable(site.id, "color", "marker", restoreInput, TEST_AUTHOR)).toEqual(restored);
    } finally { await env.close(); }
  });

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
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { spacing: { basis: "12px", abstand: "VAR(--space-basis)" } } } }, TEST_AUTHOR, initial.version);
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

  it.skipIf(!process.env.TEST_DATABASE_URL)("rolls back restoration and its result if receipt or audit persistence fails", async () => {
    const env = await bootEngine();
    try {
      for (const failure of ["receipt", "audit"] as const) {
        const site = await createTestSite(env.api, `Restore Rollback ${failure}`);
        const first = await createTestPage(env.api, site.id, { path: "/" });
        const second = await createTestPage(env.api, site.id, { path: "/zwei" });
        const initial = await env.engine.store.getTheme(site.id);
        const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
        const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { receiptId: `restore-rollback-${failure}-1`, baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } }, TEST_AUTHOR);
        const input = { receiptId: deleted.receiptId, baseThemeVersion: deleted.version, pageContext: { pageId: first.id, baseDraftVersion: deleted.pageDraftVersion } };
        const sabotaged: Db = {
          query: (text, params) => env.db.query(text, params),
          withTransaction: (task) => env.db.withTransaction((tx) => task({ query: (text, params) => {
            if ((failure === "receipt" && text.startsWith("UPDATE theme_variable_deletions")) || (failure === "audit" && text.startsWith("INSERT INTO audit_entries"))) throw new Error("Simulated restoration failure");
            return tx.query(text, params);
          } })),
        };
        await expect(new Store(sabotaged).restoreVariable(site.id, "color", "marker", input, TEST_AUTHOR)).rejects.toThrow("Simulated restoration failure");
        expect((await env.engine.store.getTheme(site.id)).version).toBe(deleted.version);
        expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).not.toHaveProperty("marker");
        expect((await env.engine.store.getPage(first.id)).draftVersion).toBe(deleted.pageDraftVersion);
        expect((await env.engine.store.getPage(second.id)).draftVersion).toBe(second.draftVersion + 1);
        const receipt = await env.db.query<{ restored_at: unknown; restore_result: unknown }>(`SELECT restored_at, restore_result FROM theme_variable_deletions WHERE id = $1`, [deleted.receiptId]);
        expect(receipt.rows[0]).toMatchObject({ restored_at: null, restore_result: null });
        const restored = await env.engine.store.restoreVariable(site.id, "color", "marker", input, TEST_AUTHOR);
        expect(restored.version).toBe(deleted.version + 1);
        expect(await env.engine.store.restoreVariable(site.id, "color", "marker", input, TEST_AUTHOR)).toEqual(restored);
      }
    } finally { await env.close(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("rejects restoration when another page changes while its lock is pending", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Restore parallel zu Page-Write");
      const first = await createTestPage(env.api, site.id, { path: "/" });
      const second = await createTestPage(env.api, site.id, { path: "/zwei" });
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { receiptId: "restore-concurrent-page-1", baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } }, TEST_AUTHOR);
      let operation: Promise<{ status: number }> | undefined;
      await env.db.withTransaction(async (tx) => {
        await tx.query(`SELECT id FROM pages WHERE id = $1 FOR UPDATE`, [second.id]);
        operation = env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/theme/variables/color/marker/restore`, body: { receiptId: deleted.receiptId, baseThemeVersion: deleted.version, pageContext: { pageId: first.id, baseDraftVersion: deleted.pageDraftVersion } } });
        const deadline = Date.now() + 10000;
        let blocked = false;
        while (Date.now() < deadline) {
          await tx.query(`SELECT pg_stat_clear_snapshot()`);
          const activity = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'SELECT id, site_id, path, title, meta, draft, draft_version FROM pages WHERE site_id = % FOR UPDATE%'`);
          if (Number(activity.rows[0]?.count) > 0) { blocked = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(blocked).toBe(true);
        await tx.query(`UPDATE pages SET title = $2, draft_version = draft_version + 1 WHERE id = $1`, [second.id, "Parallel geändert"]);
      });
      expect((await operation)?.status).toBe(409);
      expect((await env.engine.store.getPage(second.id)).title).toBe("Parallel geändert");
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).not.toHaveProperty("marker");
      expect((await env.engine.store.getPage(first.id)).draftVersion).toBe(deleted.pageDraftVersion);
    } finally { await env.close(); }
  }, 30000);

  it.skipIf(!process.env.TEST_DATABASE_URL)("rejects restoration against a concurrent theme write under its lock", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Restore parallel zu Theme-Write");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { receiptId: "restore-concurrent-theme-1", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
      let operation: Promise<{ status: number }> | undefined;
      await env.db.withTransaction(async (tx) => {
        await tx.query(`SELECT id FROM themes WHERE site_id = $1 FOR UPDATE`, [site.id]);
        operation = env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/theme/variables/color/marker/restore`, body: { receiptId: deleted.receiptId, baseThemeVersion: deleted.version, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion } } });
        const deadline = Date.now() + 10000;
        let blocked = false;
        while (Date.now() < deadline) {
          await tx.query(`SELECT pg_stat_clear_snapshot()`);
          const activity = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'SELECT id, site_id, name, definition, version, created_at, updated_at FROM themes WHERE site_id = % FOR UPDATE%'`);
          if (Number(activity.rows[0]?.count) > 0) { blocked = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(blocked).toBe(true);
        await tx.query(`UPDATE themes SET version = version + 1 WHERE site_id = $1`, [site.id]);
      });
      expect((await operation)?.status).toBe(409);
      expect((await env.engine.store.getTheme(site.id)).version).toBe(deleted.version + 1);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).not.toHaveProperty("marker");
      expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(deleted.pageDraftVersion);
    } finally { await env.close(); }
  }, 30000);

  it.skipIf(!process.env.TEST_DATABASE_URL)("serializes duplicate restoration requests without a second version increment", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Parallele Restore-Wiederholung");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { receiptId: "restore-duplicate-1", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
      const input = { receiptId: deleted.receiptId, baseThemeVersion: deleted.version, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion } };
      const results = await Promise.all([env.engine.store.restoreVariable(site.id, "color", "marker", input, TEST_AUTHOR), env.engine.store.restoreVariable(site.id, "color", "marker", input, TEST_AUTHOR)]);
      expect(results[0]).toEqual({ version: deleted.version + 1, pageDraftVersion: deleted.pageDraftVersion + 1 });
      expect(results[1]).toEqual(results[0]);
      expect((await env.engine.store.getTheme(site.id)).version).toBe(deleted.version + 1);
      expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(deleted.pageDraftVersion + 1);
    } finally { await env.close(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("rejects restoration after a concurrent registry change under the site lock", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Restore parallel zu Registry-Write");
      const page = await createTestPage(env.api, site.id);
      const initial = await env.engine.store.getTheme(site.id);
      const theme = await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, initial.version);
      const deleted = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { receiptId: "restore-concurrent-registry-1", baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
      let operation: Promise<{ status: number }> | undefined;
      await env.db.withTransaction(async (tx) => {
        await tx.query(`SELECT id FROM sites WHERE id = $1 FOR UPDATE`, [site.id]);
        operation = env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/theme/variables/color/marker/restore`, body: { receiptId: deleted.receiptId, baseThemeVersion: deleted.version, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion } } });
        const deadline = Date.now() + 10000;
        let blocked = false;
        while (Date.now() < deadline) {
          await tx.query(`SELECT pg_stat_clear_snapshot()`);
          const activity = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'SELECT style_rules_json, style_rules_version FROM sites WHERE id = % FOR UPDATE%'`);
          if (Number(activity.rows[0]?.count) > 0) { blocked = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(blocked).toBe(true);
        await tx.query(`UPDATE sites SET style_rules_json = $2, style_rules_version = style_rules_version + 1 WHERE id = $1`, [site.id, JSON.stringify([{ id: "parallel-cta", name: "cta", kind: "class", selector: ".cta", order: 0, styles: { color: "#abcdef" }, contextStyles: {} }])]);
      });
      expect((await operation)?.status).toBe(409);
      expect((await env.engine.store.getStyleRegistry(site.id)).rules).toHaveLength(1);
      expect((await env.engine.store.getTheme(site.id)).theme.tokens.primitive?.color).not.toHaveProperty("marker");
      expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(deleted.pageDraftVersion);
    } finally { await env.close(); }
  }, 30000);

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
          const activity = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'SELECT id, site_id, path, title, meta, draft, draft_version FROM pages WHERE site_id = % FOR UPDATE%'`);
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
