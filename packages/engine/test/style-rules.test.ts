import { describe, expect, it } from "vitest";
import { Store, type Db, type DbClient } from "@senify/engine";
import { ensureSchema, SCHEMA_STATEMENTS } from "../src/db.ts";
import { bootEngine, createTestPage, createTestSite, TEST_AUTHOR, type ErrorResponse, type PageResponse } from "./helpers.ts";

type StyleRuleResponse = {
  id: string;
  name: string;
  kind: "class" | "ambient" | "scoped";
  selector: string;
  order: number;
  styles: Record<string, unknown>;
  states?: Record<string, Record<string, unknown>>;
  contextStyles: Record<string, Record<string, unknown>>;
  authoredBy?: "user" | "agent" | "preset";
  scope?: { type: "node"; nodeId: string; role: "module-style" };
};

describe("style rule registry (site-wide)", () => {
  it("verweigert Klassen-Restore bei abweichendem Inhalt, Seitenidentität oder unvollständigem Inhaltsbeleg", async () => {
    const env = await bootEngine();
    try {
      for (const change of ["draft", "title", "path", "meta", "pages", "removed-page", "identity", "legacy", "partial", "page-hash"] as const) {
        const site = await createTestSite(env.api, `Klassen-Restore Schutz ${change}`);
        const first = await createTestPage(env.api, site.id);
        const second = await createTestPage(env.api, site.id, { path: "/zwei" });
        const rule = await env.engine.store.createStyleRule(site.id, { name: "cta" }, TEST_AUTHOR);
        const deleted = await env.engine.store.deleteGlobalClass(site.id, rule.id, { receiptId: `class-content-${change}`, baseVersion: 1, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } }, TEST_AUTHOR);
        if (change === "draft") {
          const page = await env.engine.store.getPage(second.id);
          page.draft.nodes[page.draft.rootNodeId]!.props.text = "Anderer Inhalt";
          await env.engine.store.updatePage(page.id, page.draftVersion, { draft: page.draft, title: page.title, path: page.path });
        }
        if (change === "title") await env.db.query(`UPDATE pages SET title = $2, draft_version = draft_version + 1 WHERE id = $1`, [second.id, "Anderer Titel"]);
        if (change === "path") await env.db.query(`UPDATE pages SET path = $2, draft_version = draft_version + 1 WHERE id = $1`, [second.id, "/anders"]);
        if (change === "meta") await env.db.query(`UPDATE pages SET meta = $2, draft_version = draft_version + 1 WHERE id = $1`, [second.id, JSON.stringify({ description: "Andere Metadaten" })]);
        if (change === "pages") await createTestPage(env.api, site.id, { path: "/neu" });
        if (change === "removed-page") await env.db.query(`DELETE FROM pages WHERE id = $1`, [second.id]);
        if (change === "identity") await env.db.query(`UPDATE pages SET id = $2 WHERE id = $1`, [second.id, "ersetzte-klassen-page"]);
        if (change === "legacy" || change === "partial" || change === "page-hash") {
          await env.db.query(`UPDATE pages SET draft_version = draft_version + 1 WHERE id = $1`, [second.id]);
          if (change === "page-hash") await env.db.query(`UPDATE style_class_deletions SET pages = $2 WHERE id = $1`, [deleted.receiptId, JSON.stringify([
            { pageId: first.id, version: deleted.pageDraftVersion, classes: {} }, { pageId: second.id, version: second.draftVersion + 1, classes: {} },
          ])]);
          else await env.db.query(`UPDATE style_class_deletions SET resource_hashes = $2 WHERE id = $1`, [deleted.receiptId, change === "legacy" ? null : JSON.stringify({ registry: "invalid" })]);
        }
        const registry = await env.engine.store.getStyleRegistry(site.id);
        const origin = await env.engine.store.getPage(first.id);
        await expect(env.engine.store.restoreGlobalClass(site.id, rule.id, { receiptId: deleted.receiptId, baseVersion: registry.version, pageContext: { pageId: first.id, baseDraftVersion: origin.draftVersion } }, TEST_AUTHOR)).rejects.toThrow(/seit dem Löschen/);
        expect((await env.engine.store.getStyleRegistry(site.id)).version).toBe(registry.version);
        expect((await env.engine.store.getStyleRegistry(site.id)).rules).toEqual([]);
        expect((await env.engine.store.getPage(first.id)).draftVersion).toBe(origin.draftVersion);
        const receipt = await env.db.query<{ restored_at: unknown; restore_result: unknown }>(`SELECT restored_at, restore_result FROM style_class_deletions WHERE id = $1`, [deleted.receiptId]);
        expect(receipt.rows[0]).toMatchObject({ restored_at: null, restore_result: null });
      }
    } finally { await env.close(); }
  });

  it("vergleicht beim Klassen-Restore rohe Registry inklusive unbekannter Felder und gespeicherter Reihenfolge", async () => {
    const env = await bootEngine();
    try {
      for (const change of ["invalid-entry", "unknown-field", "stored-order"] as const) {
        const site = await createTestSite(env.api, `Klassen-Rohinhalt ${change}`);
        const page = await createTestPage(env.api, site.id);
        const rule = await env.engine.store.createStyleRule(site.id, { name: "cta" }, TEST_AUTHOR);
        await env.engine.store.createStyleRule(site.id, { name: "andere", styles: { color: "#abcdef" } }, TEST_AUTHOR);
        const deleted = await env.engine.store.deleteGlobalClass(site.id, rule.id, { receiptId: `class-raw-${change}`, baseVersion: 2, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
        const other = (await env.engine.store.getStyleRegistry(site.id)).rules[0]!;
        const rules = change === "invalid-entry" ? [other, { styles: { color: "#112233" } }] : [{ ...other, ...(change === "unknown-field" ? { futureContent: { reference: "color.extra" } } : { order: 99 }) }];
        await env.db.query(`UPDATE sites SET style_rules_json = $2, style_rules_version = style_rules_version + 1 WHERE id = $1`, [site.id, JSON.stringify(rules)]);
        await expect(env.engine.store.restoreGlobalClass(site.id, rule.id, { receiptId: deleted.receiptId, baseVersion: deleted.version + 1, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion } }, TEST_AUTHOR)).rejects.toThrow(/seit dem Löschen/);
        expect((await env.engine.store.getStyleRegistry(site.id)).version).toBe(deleted.version + 1);
        expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(deleted.pageDraftVersion);
      }
    } finally { await env.close(); }
  });

  it("bindet neue Klassen-Delete- und Restore-Retries an die exakte Request-Basis", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Klassen Request-Bindung");
      const first = await createTestPage(env.api, site.id);
      const second = await createTestPage(env.api, site.id, { path: "/zwei" });
      const rule = await env.engine.store.createStyleRule(site.id, { name: "cta" }, TEST_AUTHOR);
      const input = { receiptId: "class-bound-request", baseVersion: 1, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } };
      const deleted = await env.engine.store.deleteGlobalClass(site.id, rule.id, input, TEST_AUTHOR);
      expect(await env.engine.store.deleteGlobalClass(site.id, rule.id, input, TEST_AUTHOR)).toEqual(deleted);
      for (const changed of [
        { ...input, baseVersion: input.baseVersion + 1 },
        { ...input, pageContext: { ...input.pageContext, baseDraftVersion: first.draftVersion + 1 } },
        { ...input, pageContext: { pageId: second.id, baseDraftVersion: second.draftVersion } },
      ]) await expect(env.engine.store.deleteGlobalClass(site.id, rule.id, changed, TEST_AUTHOR)).rejects.toMatchObject({ field: "receiptId" });
      await expect(env.engine.store.deleteGlobalClass(site.id, "fremde-regel", input, TEST_AUTHOR)).rejects.toMatchObject({ field: "receiptId" });
      await env.db.query(`UPDATE sites SET style_rules_version = style_rules_version + 1 WHERE id = $1`, [site.id]);
      await env.db.query(`UPDATE pages SET draft_version = draft_version + 1 WHERE site_id = $1`, [site.id]);
      const theme = await env.engine.store.getTheme(site.id);
      const restoration = { receiptId: deleted.receiptId, baseVersion: deleted.version + 1, baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: deleted.pageDraftVersion + 1 } };
      await expect(env.engine.store.restoreGlobalClass(site.id, rule.id, { ...restoration, baseVersion: deleted.version }, TEST_AUTHOR)).rejects.toMatchObject({ field: "baseVersion" });
      await expect(env.engine.store.restoreGlobalClass(site.id, rule.id, { ...restoration, pageContext: { ...restoration.pageContext, baseDraftVersion: deleted.pageDraftVersion } }, TEST_AUTHOR)).rejects.toMatchObject({ field: "baseDraftVersion" });
      const restored = await env.engine.store.restoreGlobalClass(site.id, rule.id, restoration, TEST_AUTHOR);
      await env.engine.store.createStyleRule(site.id, { name: "spaeter" }, TEST_AUTHOR);
      await env.engine.store.updateTheme(site.id, { scales: { brand: "#abcdef" } }, TEST_AUTHOR, theme.version);
      expect(await env.engine.store.restoreGlobalClass(site.id, rule.id, restoration, TEST_AUTHOR)).toEqual(restored);
      for (const changed of [
        { ...restoration, baseVersion: restored.version },
        { ...restoration, pageContext: { ...restoration.pageContext, baseDraftVersion: restored.pageDraftVersion } },
        { ...restoration, pageContext: { ...restoration.pageContext, pageId: second.id } },
        { ...restoration, baseThemeVersion: theme.version + 1 },
        { ...restoration, baseThemeVersion: undefined },
      ]) await expect(env.engine.store.restoreGlobalClass(site.id, rule.id, changed, TEST_AUTHOR)).rejects.toMatchObject({ field: "receiptId" });
      await expect(env.engine.store.deleteGlobalClass(site.id, rule.id, input, TEST_AUTHOR)).rejects.toMatchObject({ field: "receiptId" });
      expect((await env.engine.store.getStyleRegistry(site.id)).version).toBe(restored.version + 1);
      expect((await env.engine.store.getPage(first.id)).draftVersion).toBe(restored.pageDraftVersion);
    } finally { await env.close(); }
  });

  it("migriert alte Klassenbelege additiv und behält deren strengen Versions- und Retry-Vertrag", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Migration Klassenbeleg");
      const page = await createTestPage(env.api, site.id);
      const rule = await env.engine.store.createStyleRule(site.id, { name: "cta" }, TEST_AUTHOR);
      const input = { receiptId: "class-migration", baseVersion: 1, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } };
      const deleted = await env.engine.store.deleteGlobalClass(site.id, rule.id, input, TEST_AUTHOR);
      // pg-mem can revive dropped column values when re-adding their names.
      // Seed an actual legacy receipt without new evidence before the migration.
      await env.db.query(`UPDATE style_class_deletions SET resource_hashes = NULL, request_basis = NULL, restore_result = NULL WHERE id = $1`, [deleted.receiptId]);
      for (const column of ["resource_hashes", "request_basis", "restore_result"]) await env.db.query(`ALTER TABLE style_class_deletions DROP COLUMN ${column}`);
      if (process.env.TEST_DATABASE_URL) await ensureSchema(env.db);
      else for (const column of ["resource_hashes", "request_basis", "restore_result"]) {
        const migration = SCHEMA_STATEMENTS.find((statement) => statement.includes(`ALTER TABLE style_class_deletions ADD COLUMN IF NOT EXISTS ${column}`));
        expect(migration).toBeDefined();
        await env.db.query(migration!);
      }
      const migrated = await env.db.query<{ resource_hashes: unknown; request_basis: unknown; restore_result: unknown }>(`SELECT resource_hashes, request_basis, restore_result FROM style_class_deletions WHERE id = $1`, [deleted.receiptId]);
      expect(migrated.rows[0]).toMatchObject({ resource_hashes: null, request_basis: null, restore_result: null });
      expect(await env.engine.store.deleteGlobalClass(site.id, rule.id, input, TEST_AUTHOR)).toEqual(deleted);
      const restoration = { receiptId: deleted.receiptId, baseVersion: deleted.version, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion } };
      await env.db.query(`UPDATE pages SET draft_version = draft_version + 1 WHERE id = $1`, [page.id]);
      await expect(env.engine.store.restoreGlobalClass(site.id, rule.id, { ...restoration, pageContext: { ...restoration.pageContext, baseDraftVersion: deleted.pageDraftVersion + 1 } }, TEST_AUTHOR)).rejects.toThrow(/seit dem Löschen/);
      await env.db.query(`UPDATE pages SET draft_version = $2 WHERE id = $1`, [page.id, deleted.pageDraftVersion]);
      const restored = await env.engine.store.restoreGlobalClass(site.id, rule.id, restoration, TEST_AUTHOR);
      await env.db.query(`UPDATE style_class_deletions SET restore_result = NULL WHERE id = $1`, [deleted.receiptId]);
      expect(await env.engine.store.restoreGlobalClass(site.id, rule.id, restoration, TEST_AUTHOR)).toEqual(restored);
    } finally { await env.close(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("rollt Klassen-Restore samt Ergebnis bei Page-, Beleg- oder Auditfehler vollständig zurück", async () => {
    const env = await bootEngine();
    try {
      for (const failure of ["page", "receipt", "audit"] as const) {
        const site = await createTestSite(env.api, `Klassen-Restore Rollback ${failure}`);
        const pages = [await createTestPage(env.api, site.id), await createTestPage(env.api, site.id, { path: "/zwei" })];
        const rule = await env.engine.store.createStyleRule(site.id, { name: "cta" }, TEST_AUTHOR);
        for (const page of pages) {
          const current = await env.engine.store.getPage(page.id);
          current.draft.nodes[current.draft.rootNodeId]!.classes = ["cta"];
          page.draftVersion = await env.engine.store.updatePage(page.id, page.draftVersion, { draft: current.draft, title: page.title, path: page.path });
        }
        const first = pages[0]!;
        const deleted = await env.engine.store.deleteGlobalClass(site.id, rule.id, { receiptId: `class-rollback-${failure}`, baseVersion: 1, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } }, TEST_AUTHOR);
        await env.db.query(`UPDATE pages SET draft_version = draft_version + 1 WHERE site_id = $1`, [site.id]);
        const input = { receiptId: deleted.receiptId, baseVersion: deleted.version, pageContext: { pageId: first.id, baseDraftVersion: deleted.pageDraftVersion + 1 } };
        let writes = 0;
        const sabotaged: Db = {
          query: (text, params) => env.db.query(text, params),
          withTransaction: (task) => env.db.withTransaction((tx) => task({ query: (text, params) => {
            if ((failure === "page" && text.startsWith("UPDATE pages SET draft") && ++writes === 2) ||
                (failure === "receipt" && text.startsWith("UPDATE style_class_deletions")) ||
                (failure === "audit" && text.startsWith("INSERT INTO audit_entries"))) throw new Error("Simulierter Klassen-Restore-Fehler");
            return tx.query(text, params);
          } })),
        };
        await expect(new Store(sabotaged).restoreGlobalClass(site.id, rule.id, input, TEST_AUTHOR)).rejects.toThrow("Simulierter Klassen-Restore-Fehler");
        expect((await env.engine.store.getStyleRegistry(site.id)).version).toBe(deleted.version);
        expect((await env.engine.store.getStyleRegistry(site.id)).rules).toEqual([]);
        for (const page of pages) {
          const current = await env.engine.store.getPage(page.id);
          expect(current.draftVersion).toBe(page.draftVersion + 2);
          expect(current.draft.nodes[current.draft.rootNodeId]?.classes).toBeUndefined();
        }
        const receipt = await env.db.query<{ restored_at: unknown; restore_result: unknown }>(`SELECT restored_at, restore_result FROM style_class_deletions WHERE id = $1`, [deleted.receiptId]);
        expect(receipt.rows[0]).toMatchObject({ restored_at: null, restore_result: null });
        const restored = await env.engine.store.restoreGlobalClass(site.id, rule.id, input, TEST_AUTHOR);
        expect(await env.engine.store.restoreGlobalClass(site.id, rule.id, input, TEST_AUTHOR)).toEqual(restored);
      }
    } finally { await env.close(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("prüft Klassen-Restore gegen parallele Page-, Registry- und Theme-Writes unter Sperren", async () => {
    const env = await bootEngine();
    try {
      for (const resource of ["page", "registry", "theme"] as const) {
        const site = await createTestSite(env.api, `Klassen-Restore parallel ${resource}`);
        const first = await createTestPage(env.api, site.id);
        const second = await createTestPage(env.api, site.id, { path: "/zwei" });
        const rule = await env.engine.store.createStyleRule(site.id, { name: "cta" }, TEST_AUTHOR);
        const theme = await env.engine.store.getTheme(site.id);
        const deleted = await env.engine.store.deleteGlobalClass(site.id, rule.id, { receiptId: `class-concurrent-${resource}`, baseVersion: 1, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } }, TEST_AUTHOR);
        let pending: Promise<{ status: number }> | undefined;
        await env.db.withTransaction(async (tx) => {
          await tx.query(resource === "page" ? `SELECT id FROM pages WHERE id = $1 FOR UPDATE` : resource === "registry" ? `SELECT id FROM sites WHERE id = $1 FOR UPDATE` : `SELECT id FROM themes WHERE site_id = $1 FOR UPDATE`, [resource === "page" ? second.id : site.id]);
          pending = env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/style-rules/${rule.id}/restore-globally`, body: { receiptId: deleted.receiptId, baseVersion: deleted.version, baseThemeVersion: theme.version, pageContext: { pageId: first.id, baseDraftVersion: deleted.pageDraftVersion } } });
          const query = resource === "page" ? "SELECT id, site_id, path, title, meta, draft, draft_version FROM pages WHERE site_id = % ORDER BY id FOR UPDATE%" : resource === "registry" ? "SELECT style_rules_json, style_rules_version FROM sites WHERE id = % FOR UPDATE%" : "SELECT version FROM themes WHERE site_id = % FOR UPDATE%";
          const deadline = Date.now() + 10000;
          let blocked = false;
          while (Date.now() < deadline) {
            await tx.query(`SELECT pg_stat_clear_snapshot()`);
            const activity = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE $1`, [query]);
            if (Number(activity.rows[0]?.count) > 0) { blocked = true; break; }
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          expect(blocked).toBe(true);
          if (resource === "page") await tx.query(`UPDATE pages SET title = $2, draft_version = draft_version + 1 WHERE id = $1`, [second.id, "Parallel geändert"]);
          if (resource === "registry") await tx.query(`UPDATE sites SET style_rules_version = style_rules_version + 1 WHERE id = $1`, [site.id]);
          if (resource === "theme") await tx.query(`UPDATE themes SET version = version + 1 WHERE site_id = $1`, [site.id]);
        });
        expect((await pending)?.status).toBe(409);
        expect((await env.engine.store.getStyleRegistry(site.id)).rules).toEqual([]);
        expect((await env.engine.store.getPage(first.id)).draftVersion).toBe(deleted.pageDraftVersion);
        if (resource === "page") expect((await env.engine.store.getPage(second.id)).title).toBe("Parallel geändert");
      }
    } finally { await env.close(); }
  }, 45000);

  it.skipIf(!process.env.TEST_DATABASE_URL)("serialisiert doppelte Klassen-Restores ohne zweite Versionsanhebung", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Klassen-Restore doppelt");
      const page = await createTestPage(env.api, site.id);
      const rule = await env.engine.store.createStyleRule(site.id, { name: "cta" }, TEST_AUTHOR);
      const deleted = await env.engine.store.deleteGlobalClass(site.id, rule.id, { receiptId: "class-duplicate-restore", baseVersion: 1, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
      await env.db.query(`UPDATE pages SET draft_version = draft_version + 1 WHERE id = $1`, [page.id]);
      const input = { receiptId: deleted.receiptId, baseVersion: deleted.version, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion + 1 } };
      const results = await Promise.all([env.engine.store.restoreGlobalClass(site.id, rule.id, input, TEST_AUTHOR), env.engine.store.restoreGlobalClass(site.id, rule.id, input, TEST_AUTHOR)]);
      expect(results[0]).toEqual({ version: deleted.version + 1, pageDraftVersion: input.pageContext.baseDraftVersion + 1 });
      expect(results[1]).toEqual(results[0]);
      expect((await env.engine.store.getStyleRegistry(site.id)).version).toBe(deleted.version + 1);
      expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(input.pageContext.baseDraftVersion + 1);
    } finally { await env.close(); }
  });

  it("stellt Klassen nach vollständig zurückgenommenen Variablen- und Dokumentaktionen wieder her", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Gemischtes Klassen-Undo");
      const pages = [await createTestPage(env.api, site.id), await createTestPage(env.api, site.id, { path: "/zwei" })];
      const theme = await env.engine.store.getTheme(site.id);
      await env.engine.store.updateTheme(site.id, { tokens: { primitive: { color: { marker: "#123456" } } } }, TEST_AUTHOR, theme.version);
      const rule = await env.engine.store.createStyleRule(site.id, { name: "cta" }, TEST_AUTHOR);
      const other = await env.engine.store.createStyleRule(site.id, { name: "andere", styles: { color: "#abcdef" } }, TEST_AUTHOR);
      for (const page of pages) {
        const current = await env.engine.store.getPage(page.id);
        current.draft.nodes[current.draft.rootNodeId]!.classes = ["cta", "andere"];
        page.draftVersion = await env.engine.store.updatePage(page.id, page.draftVersion, { draft: current.draft, title: page.title, path: page.path });
      }
      const first = pages[0]!;
      const deleted = await env.engine.store.deleteGlobalClass(site.id, rule.id, { receiptId: "class-mixed-delete", baseVersion: 2, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } }, TEST_AUTHOR);
      const currentTheme = await env.engine.store.getTheme(site.id);
      const variable = await env.engine.store.deleteUnusedVariable(site.id, "color", "marker", { receiptId: "class-mixed-variable", baseThemeVersion: currentTheme.version, pageContext: { pageId: first.id, baseDraftVersion: deleted.pageDraftVersion } }, TEST_AUTHOR);
      await env.engine.store.restoreVariable(site.id, "color", "marker", { receiptId: variable.receiptId, baseThemeVersion: variable.version, pageContext: { pageId: first.id, baseDraftVersion: variable.pageDraftVersion } }, TEST_AUTHOR);
      for (const page of pages) {
        const before = await env.engine.store.getPage(page.id);
        const draft = structuredClone(before.draft);
        draft.nodes[draft.rootNodeId]!.props.text = "Zwischenstand";
        const changed = await env.engine.store.updatePage(page.id, before.draftVersion, { draft, title: "Zwischentitel", path: before.path });
        await env.engine.store.updatePage(page.id, changed, { draft: before.draft, title: before.title, path: before.path });
      }
      await env.engine.store.updateStyleRule(site.id, other.id, { styles: { color: "#112233" } }, TEST_AUTHOR);
      await env.engine.store.updateStyleRule(site.id, other.id, { styles: { color: "#abcdef" } }, TEST_AUTHOR);
      const input = { receiptId: deleted.receiptId, baseVersion: (await env.engine.store.getStyleRegistry(site.id)).version,
        baseThemeVersion: (await env.engine.store.getTheme(site.id)).version, pageContext: { pageId: first.id, baseDraftVersion: (await env.engine.store.getPage(first.id)).draftVersion } };
      const restored = await env.engine.store.restoreGlobalClass(site.id, rule.id, input, TEST_AUTHOR);
      expect(restored).toEqual({ version: input.baseVersion + 1, pageDraftVersion: input.pageContext.baseDraftVersion + 1 });
      for (const page of pages) expect((await env.engine.store.getPage(page.id)).draft.nodes[page.draft.rootNodeId]?.classes).toEqual(["cta", "andere"]);
      expect(await env.engine.store.restoreGlobalClass(site.id, rule.id, input, TEST_AUTHOR)).toEqual(restored);
      await expect(env.engine.store.restoreGlobalClass(site.id, rule.id, { ...input, pageContext: { ...input.pageContext, pageId: pages[1]!.id } }, TEST_AUTHOR)).rejects.toThrow();
    } finally { await env.close(); }
  });

  it("entfernt optionale Stilfelder explizit und erhält ausgelassene Felder", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Exaktes Klassen-Undo");
      const created = await env.humanApi.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: {
        name: "cta", styles: { color: "#123456" }, states: { hover: { color: "#abcdef" } }, stylePriorities: { color: "important" },
        statePriorities: { hover: { color: "important" } }, contextStylePriorities: { "(orientation: landscape)": { color: "important" } },
      } });
      expect(created.status).toBe(201);
      const endpoint = `/api/sites/${site.id}/style-rules/${created.body.id}`;
      expect((await env.humanApi.request({ method: "PATCH", path: endpoint, body: { replaceStyleValues: true, styles: {} } })).status).toBe(200);
      expect((await env.engine.store.getStyleRegistry(site.id)).rules[0]?.states?.hover).toBeDefined();
      expect((await env.humanApi.request({ method: "PATCH", path: endpoint, body: { replaceStyleValues: true, styles: { color: "#123456" },
        states: null, stylePriorities: null, statePriorities: null, contextStylePriorities: null } })).status).toBe(200);
      const raw = await env.db.query<{ style_rules_json: unknown }>("SELECT style_rules_json FROM sites WHERE id = $1", [site.id]);
      const data = raw.rows[0]!.style_rules_json;
      const rules = (typeof data === "string" ? JSON.parse(data) : data) as Record<string, unknown>[];
      expect(rules[0]?.styles).toEqual({ color: "#123456" });
      for (const field of ["states", "stylePriorities", "statePriorities", "contextStylePriorities"]) expect(Object.hasOwn(rules[0]!, field)).toBe(false);
    } finally { await env.close(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("serializes class writes with concurrent theme changes", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Klasse und Theme gleichzeitig");
      const theme = await env.engine.store.getTheme(site.id);
      let pending: Promise<{ status: number }> | undefined;
      await env.db.withTransaction(async (tx) => {
        await tx.query(`SELECT id FROM themes WHERE site_id = $1 FOR UPDATE`, [site.id]);
        pending = env.api.request({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "cta", baseThemeVersion: theme.version } });
        const deadline = Date.now() + 10000;
        let blocked = false;
        while (Date.now() < deadline) {
          await tx.query(`SELECT pg_stat_clear_snapshot()`);
          const activity = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'SELECT version FROM themes WHERE site_id = % FOR UPDATE%'`);
          if (Number(activity.rows[0]?.count) > 0) { blocked = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(blocked).toBe(true);
        await tx.query(`UPDATE themes SET version = version + 1 WHERE site_id = $1`, [site.id]);
      });
      expect((await pending)?.status).toBe(409);
      expect((await env.engine.store.getStyleRegistry(site.id)).rules).toEqual([]);
    } finally { await env.close(); }
  }, 30000);

  it("rejects stale theme versions for class creation and updates", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Klassen und Theme");
      const theme = await env.engine.store.getTheme(site.id);
      const created = await env.api.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "cta", baseThemeVersion: theme.version } });
      expect(created.status).toBe(201);
      await env.engine.store.updateTheme(site.id, { scales: { brand: "#123456" } }, TEST_AUTHOR, theme.version);
      const staleCreate = await env.api.request<{ error: { field: string } }>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "neu", baseThemeVersion: theme.version } });
      expect(staleCreate.status).toBe(409);
      expect(staleCreate.body.error.field).toBe("baseThemeVersion");
      const staleUpdate = await env.api.request<{ error: { field: string } }>({ method: "PATCH", path: `/api/sites/${site.id}/style-rules/${created.body.id}`, body: { styles: { color: "#abcdef" }, baseThemeVersion: theme.version } });
      expect(staleUpdate.status).toBe(409);
      expect(staleUpdate.body.error.field).toBe("baseThemeVersion");
      const registry = await env.engine.store.getStyleRegistry(site.id);
      expect(registry.rules).toHaveLength(1);
      expect(registry.rules[0]?.styles.color).toBeUndefined();
      expect((await env.api.request({ method: "PATCH", path: `/api/sites/${site.id}/style-rules/${created.body.id}`, body: { styles: { color: "#abcdef" }, baseThemeVersion: theme.version + 1 } })).status).toBe(200);
    } finally { await env.close(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("rolls back a global deletion if any page write fails", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Löschung Rollback");
      const pages = [await createTestPage(env.api, site.id, { path: "/" }), await createTestPage(env.api, site.id, { path: "/zwei" })];
      const created = await env.api.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "cta" } });
      for (const page of pages) {
        const draft = (await env.engine.store.getPage(page.id)).draft;
        draft.nodes[draft.rootNodeId]!.classes = ["cta"];
        page.draftVersion = await env.engine.store.updatePage(page.id, page.draftVersion, { draft, title: page.title, path: page.path });
      }
      let writes = 0;
      const sabotaged: Db = {
        query: (text, params) => env.db.query(text, params),
        withTransaction: (task) => env.db.withTransaction((tx) => {
          const guarded: DbClient = { query: (text, params) => {
            if (text.startsWith("UPDATE pages SET draft") && ++writes === 2) throw new Error("Simulated deletion failure");
            return tx.query(text, params);
          } };
          return task(guarded);
        }),
      };
      const first = pages[0]!;
      await expect(new Store(sabotaged).deleteGlobalClass(site.id, created.body.id, { baseVersion: 1, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } }, TEST_AUTHOR)).rejects.toThrow("Simulated deletion failure");
      expect((await env.engine.store.getStyleRegistry(site.id)).rules[0]?.name).toBe("cta");
      for (const page of pages) {
        const fresh = await env.engine.store.getPage(page.id);
        expect(fresh.draft.nodes[fresh.draft.rootNodeId]?.classes).toEqual(["cta"]);
        expect(fresh.draftVersion).toBe(page.draftVersion);
      }
      const receipts = await env.db.query<{ count: string }>(`SELECT count(*)::text AS count FROM style_class_deletions WHERE site_id = $1`, [site.id]);
      expect(Number(receipts.rows[0]?.count)).toBe(0);
    } finally {
      await env.close();
    }
  });

  it("deletes a class and restores its exact assignments on every page", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Löschen und Wiederherstellen");
      const pages = [await createTestPage(env.api, site.id, { path: "/" }), await createTestPage(env.api, site.id, { path: "/zwei" })];
      const created = await env.api.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "cta", styles: { color: "#123456" } } });
      for (const page of pages) {
        const draft = (await env.engine.store.getPage(page.id)).draft;
        draft.nodes[draft.rootNodeId]!.classes = ["vorher", "cta", "nachher"];
        page.draftVersion = await env.engine.store.updatePage(page.id, page.draftVersion, { draft, title: page.title, path: page.path });
      }
      const origin = pages[0]!;
      const deletion = { receiptId: "receipt-delete-123456", baseVersion: 1, pageContext: { pageId: origin.id, baseDraftVersion: origin.draftVersion } };
      const removed = await env.engine.store.deleteGlobalClass(site.id, created.body.id, deletion, TEST_AUTHOR);
      expect(removed).toMatchObject({ version: 2, pageDraftVersion: origin.draftVersion + 1 });
      expect(await env.engine.store.deleteGlobalClass(site.id, created.body.id, deletion, TEST_AUTHOR)).toEqual(removed);
      expect((await env.engine.store.getStyleRegistry(site.id)).rules).toHaveLength(0);
      for (const page of pages) {
        const current = await env.engine.store.getPage(page.id);
        expect(current.draft.nodes[current.draft.rootNodeId]?.classes).toEqual(["vorher", "nachher"]);
        expect(current.draftVersion).toBe(page.draftVersion + 1);
      }
      const restoration = { receiptId: removed.receiptId, baseVersion: 2, pageContext: { pageId: origin.id, baseDraftVersion: removed.pageDraftVersion } };
      const restored = await env.engine.store.restoreGlobalClass(site.id, created.body.id, restoration, TEST_AUTHOR);
      expect(restored).toEqual({ version: 3, pageDraftVersion: origin.draftVersion + 2 });
      expect(await env.engine.store.restoreGlobalClass(site.id, created.body.id, restoration, TEST_AUTHOR)).toEqual(restored);
      expect((await env.engine.store.getStyleRule(site.id, created.body.id)).styles).toEqual({ color: "#123456" });
      for (const page of pages) {
        const current = await env.engine.store.getPage(page.id);
        expect(current.draft.nodes[current.draft.rootNodeId]?.classes).toEqual(["vorher", "cta", "nachher"]);
        expect(current.draftVersion).toBe(page.draftVersion + 2);
      }
      await expect(env.engine.store.restoreGlobalClass(site.id, created.body.id, { receiptId: removed.receiptId, baseVersion: 3, pageContext: { pageId: origin.id, baseDraftVersion: restored.pageDraftVersion } }, TEST_AUTHOR)).rejects.toThrow();
    } finally {
      await env.close();
    }
  });

  it("does not restore a deletion over a later page edit", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Späterer Seitenstand");
      const first = await createTestPage(env.api, site.id, { path: "/" });
      const second = await createTestPage(env.api, site.id, { path: "/zwei" });
      const created = await env.api.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "cta" } });
      const removed = await env.engine.store.deleteGlobalClass(site.id, created.body.id, { baseVersion: 1, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } }, TEST_AUTHOR);
      const page = await env.engine.store.getPage(second.id);
      page.draft.nodes[page.draft.rootNodeId]!.classes = ["fremd"];
      await env.engine.store.updatePage(page.id, page.draftVersion, { draft: page.draft, title: page.title, path: page.path });
      await expect(env.engine.store.restoreGlobalClass(site.id, created.body.id, { receiptId: removed.receiptId, baseVersion: 2, pageContext: { pageId: first.id, baseDraftVersion: removed.pageDraftVersion } }, TEST_AUTHOR)).rejects.toThrow(/seit dem Löschen geändert/);
      expect((await env.engine.store.getStyleRegistry(site.id)).rules).toHaveLength(0);
      expect((await env.engine.store.getPage(second.id)).draft.nodes[page.draft.rootNodeId]?.classes).toEqual(["fremd"]);
    } finally {
      await env.close();
    }
  });

  it("does not restore a deleted class against a stale theme", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Wiederherstellung und Theme");
      const page = await createTestPage(env.api, site.id, { path: "/" });
      const theme = await env.engine.store.getTheme(site.id);
      const rule = await env.api.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "cta" } });
      const deleted = await env.engine.store.deleteGlobalClass(site.id, rule.body.id, { baseVersion: 1, pageContext: { pageId: page.id, baseDraftVersion: page.draftVersion } }, TEST_AUTHOR);
      await env.engine.store.updateTheme(site.id, { scales: { brand: "#123456" } }, TEST_AUTHOR, theme.version);
      const restore = { receiptId: deleted.receiptId, baseVersion: 2, baseThemeVersion: theme.version, pageContext: { pageId: page.id, baseDraftVersion: deleted.pageDraftVersion } };
      await expect(env.engine.store.restoreGlobalClass(site.id, rule.body.id, restore, TEST_AUTHOR)).rejects.toMatchObject({ field: "baseThemeVersion" });
      expect((await env.engine.store.getStyleRegistry(site.id)).rules).toHaveLength(0);
      const restored = await env.engine.store.restoreGlobalClass(site.id, rule.body.id, { ...restore, baseThemeVersion: theme.version + 1 }, TEST_AUTHOR);
      expect(restored.version).toBe(3);
    } finally { await env.close(); }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("detects a class assignment that commits while deletion waits", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Gleichzeitige Zuweisung");
      const page = await createTestPage(env.api, site.id, { path: "/" });
      const created = await env.api.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "cta" } });
      const draft = (await env.engine.store.getPage(page.id)).draft;
      draft.nodes[draft.rootNodeId]!.classes = ["cta"];
      let pending: Promise<{ status: number }> | undefined;
      await env.db.withTransaction(async (tx) => {
        await tx.query(`SELECT id FROM pages WHERE id = $1 FOR UPDATE`, [page.id]);
        pending = env.api.request({ method: "DELETE", path: `/api/sites/${site.id}/style-rules/${created.body.id}`, body: { author: TEST_AUTHOR } });
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
      expect((await pending)?.status).toBe(409);
      expect((await env.engine.store.getStyleRule(site.id, created.body.id)).name).toBe("cta");
      expect((await env.engine.store.getPage(page.id)).draft.nodes[draft.rootNodeId]?.classes).toEqual(["cta"]);
    } finally {
      await env.close();
    }
  }, 30000);

  it("refuses to delete a global class while any page draft still uses it", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Verwendete Klasse");
      const page = await createTestPage(env.api, site.id, { path: "/" });
      const created = await env.api.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "cta", styles: { color: "#123456" } } });
      const draft = (await env.engine.store.getPage(page.id)).draft;
      draft.nodes[draft.rootNodeId]!.classes = ["cta"];
      await env.engine.store.updatePage(page.id, page.draftVersion, { draft, title: page.title, path: page.path });
      const path = `/api/sites/${site.id}/style-rules/${created.body.id}`;
      const refused = await env.api.request<ErrorResponse>({ method: "DELETE", path, body: { author: TEST_AUTHOR } });
      expect(refused.status).toBe(409);
      expect(refused.body.error.field).toBe("ruleId");
      expect((await env.engine.store.getStyleRule(site.id, created.body.id)).name).toBe("cta");
      expect((await env.engine.store.getPage(page.id)).draft.nodes[draft.rootNodeId]?.classes).toEqual(["cta"]);
      const current = await env.engine.store.getPage(page.id);
      delete current.draft.nodes[draft.rootNodeId]!.classes;
      const cleanVersion = await env.engine.store.updatePage(page.id, current.draftVersion, { draft: current.draft, title: current.title, path: current.path });
      const stale = await env.api.request({ method: "DELETE", path, body: { pageContext: { pageId: page.id, baseDraftVersion: cleanVersion - 1 } } });
      expect(stale.status).toBe(409);
      expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(cleanVersion);
      const deleted = await env.api.request<{ version: number; pageDraftVersion: number }>({ method: "DELETE", path, body: { pageContext: { pageId: page.id, baseDraftVersion: cleanVersion }, author: TEST_AUTHOR } });
      expect(deleted.status).toBe(200);
      expect(deleted.body).toEqual({ version: 2, pageDraftVersion: cleanVersion + 1 });
      expect((await env.engine.store.getPage(page.id)).draftVersion).toBe(cleanVersion + 1);
    } finally {
      await env.close();
    }
  });

  it("does not rename a Framer class that a later reimport would replace", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Framer-Klasse");
      await env.engine.store.appendImportedStyleRules(site.id, [{
        id: "fi-abcdef-1", name: "framer-abcdef-1", kind: "class", selector: ".framer-abcdef-1", order: 0,
        styles: { color: "#123456" }, contextStyles: {}, origin: { source: "framer-import", ordinal: 0 }, authoredBy: "preset",
      }], TEST_AUTHOR);
      const response = await env.humanApi.request({ method: "PATCH", path: `/api/sites/${site.id}/style-rules/fi-abcdef-1`, body: { name: "umbenannt" } });
      expect(response.status).toBe(409);
      expect((await env.engine.store.getStyleRule(site.id, "fi-abcdef-1")).name).toBe("framer-abcdef-1");
    } finally {
      await env.close();
    }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("does not overwrite concurrent unversioned registry writes", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Parallele Klassen");
      const requests: Array<Promise<{ status: number }>> = [];
      await env.db.withTransaction(async (tx) => {
        await tx.query(`SELECT id FROM sites WHERE id = $1 FOR UPDATE`, [site.id]);
        for (const name of ["eins", "zwei"]) requests.push(env.api.request({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name } }));
        const deadline = Date.now() + 10000;
        let blocked = 0;
        while (Date.now() < deadline) {
          await tx.query(`SELECT pg_stat_clear_snapshot()`);
          const activity = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'SELECT style_rules_json, style_rules_version FROM sites WHERE id = % FOR UPDATE%'`);
          blocked = Number(activity.rows[0]?.count);
          if (blocked >= 2) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(blocked).toBeGreaterThanOrEqual(2);
      });
      expect((await Promise.all(requests)).map((response) => response.status).sort()).toEqual([201, 409]);
      expect((await env.engine.store.getStyleRegistry(site.id)).rules).toHaveLength(1);
    } finally {
      await env.close();
    }
  }, 30000);

  it("refuses a rename that would break a free selector, including CSS escapes", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Freie Selektoren");
      const created = await env.humanApi.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "cta" } });
      const ambient = await env.humanApi.request({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: ".unused", kind: "ambient", selector: ".\\63 ta:hover" } });
      expect(ambient.status).toBe(201);
      const response = await env.humanApi.request({ method: "PATCH", path: `/api/sites/${site.id}/style-rules/${created.body.id}`, body: { name: "neu" } });
      expect(response.status).toBe(409);
      expect((await env.engine.store.getStyleRule(site.id, created.body.id)).name).toBe("cta");
    } finally {
      await env.close();
    }
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("rolls back every page and the registry if a rename write fails", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Rename Rollback");
      const pages = [await createTestPage(env.api, site.id, { path: "/" }), await createTestPage(env.api, site.id, { path: "/zwei" })];
      const created = await env.api.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "alt" } });
      for (const page of pages) {
        const draft = (await env.engine.store.getPage(page.id)).draft;
        draft.nodes[draft.rootNodeId]!.classes = ["alt"];
        page.draftVersion = await env.engine.store.updatePage(page.id, page.draftVersion, { draft, title: page.title, path: page.path });
      }
      let writes = 0;
      const sabotaged: Db = {
        query: (text, params) => env.db.query(text, params),
        withTransaction: (task) => env.db.withTransaction((tx) => {
          const guarded: DbClient = { query: (text, params) => {
            if (text.startsWith("UPDATE pages SET draft") && ++writes === 2) throw new Error("Simulated rename failure");
            return tx.query(text, params);
          } };
          return task(guarded);
        }),
      };
      await expect(new Store(sabotaged).updateStyleRule(site.id, created.body.id, { name: "neu" }, TEST_AUTHOR)).rejects.toThrow("Simulated rename failure");
      expect((await env.engine.store.getStyleRegistry(site.id)).rules[0]?.name).toBe("alt");
      for (const page of pages) {
        const fresh = await env.engine.store.getPage(page.id);
        expect(fresh.draft.nodes[fresh.draft.rootNodeId]?.classes).toEqual(["alt"]);
        expect(fresh.draftVersion).toBe(page.draftVersion);
      }
    } finally {
      await env.close();
    }
  });

  it("renames a class across page drafts and rejects stale editor versions", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Klassen auf mehreren Seiten");
      const first = await createTestPage(env.api, site.id, { path: "/" });
      const second = await createTestPage(env.api, site.id, { path: "/zwei" });
      const untouched = await createTestPage(env.api, site.id, { path: "/drei" });
      const created = await env.api.request<StyleRuleResponse>({ method: "POST", path: `/api/sites/${site.id}/style-rules`, body: { name: "alt" } });
      for (const page of [first, second]) {
        const draft = (await env.engine.store.getPage(page.id)).draft;
        draft.nodes[draft.rootNodeId]!.classes = ["alt", "andere"];
        page.draftVersion = await env.engine.store.updatePage(page.id, page.draftVersion, { draft, title: page.title, path: page.path });
      }
      const path = `/api/sites/${site.id}/style-rules/${created.body.id}`;
      const stale = await env.api.request({ method: "PATCH", path, body: { name: "neu", baseVersion: 1, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion - 1 } } });
      expect(stale.status).toBe(409);
      const afterConflict = await env.api.request<StyleRuleResponse>({ method: "GET", path });
      expect(afterConflict.body.name).toBe("alt");
      const occupied = await env.api.request({ method: "PATCH", path, body: { name: "andere", baseVersion: 1 } });
      expect(occupied.status).toBe(409);
      expect((await env.engine.store.getPage(first.id)).draftVersion).toBe(first.draftVersion);
      const renamed = await env.api.request<StyleRuleResponse & { pageDraftVersion: number; version: number }>({ method: "PATCH", path, body: { name: "neu", baseVersion: 1, pageContext: { pageId: first.id, baseDraftVersion: first.draftVersion } } });
      expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
      expect(renamed.body).toMatchObject({ name: "neu", selector: ".neu", pageDraftVersion: first.draftVersion + 1, version: 2 });
      for (const page of [first, second]) {
        const fresh = await env.api.request<PageResponse>({ method: "GET", path: `/api/pages/${page.id}` });
        expect(fresh.body.draft.nodes[page.draft.rootNodeId]?.classes).toEqual(["neu", "andere"]);
        expect(fresh.body.draftVersion).toBe(page.draftVersion + 1);
      }
      const untouchedAfter = await env.api.request<PageResponse>({ method: "GET", path: `/api/pages/${untouched.id}` });
      expect(untouchedAfter.body.draft).toEqual(untouched.draft);
      expect(untouchedAfter.body.draftVersion).toBe(untouched.draftVersion + 1);
    } finally {
      await env.close();
    }
  });

  it("replaces supplied style bags when the editor clears values", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Zurücksetzen");
      const created = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: {
          name: "cta",
          styles: { color: "#123456", color_mobile: "#abcdef" },
          states: { hover: { color: "#654321" } },
          contextStyles: { "(orientation: landscape)": { padding: 4 } },
          author: TEST_AUTHOR,
        },
      });
      expect(created.status).toBe(201);
      const agentUpdate = await env.api.request({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { replaceStyleValues: true, styles: {}, author: TEST_AUTHOR },
      });
      expect(agentUpdate.status).toBe(400);
      const updated = await env.humanApi.request({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { replaceStyleValues: true, styles: { color: "#123456" }, states: {}, contextStyles: {}, author: TEST_AUTHOR },
      });
      expect(updated.status).toBe(200);
      const listed = await env.api.request<{ rules: StyleRuleResponse[] }>({ method: "GET", path: `/api/sites/${site.id}/style-rules` });
      expect(listed.body.rules[0]).toMatchObject({ styles: { color: "#123456" }, contextStyles: {} });
      expect(listed.body.rules[0]?.states?.hover).toBeUndefined();
    } finally {
      await env.close();
    }
  });

  it("creates, reads, updates, reorders and deletes a class rule", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Stilregeln");

      const created = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: {
          name: "hero-button",
          styles: { background: "#cbff97", padding: 12, padding_mobile: 8 },
          author: TEST_AUTHOR,
        },
      });
      expect(created.status).toBe(201);
      expect(created.body.kind).toBe("class");
      expect(created.body.selector).toBe(".hero-button");
      expect(created.body.order).toBe(0);
      expect(created.body.styles).toEqual({
        background: "#cbff97",
        padding: 12,
        padding_mobile: 8,
      });

      const listed = await env.api.request<{ rules: StyleRuleResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules`,
      });
      expect(listed.status).toBe(200);
      expect(listed.body.rules.map((rule) => rule.id)).toEqual([created.body.id]);

      const updated = await env.api.request<StyleRuleResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: {
          styles: { color: "#01283c" },
          contextStyles: { "(orientation: landscape)": { padding: 4 } },
          author: TEST_AUTHOR,
        },
      });
      expect(updated.status).toBe(200);
      // A patch merges: the earlier values survive.
      expect(updated.body.styles).toEqual({
        background: "#cbff97",
        padding: 12,
        padding_mobile: 8,
        color: "#01283c",
      });
      expect(updated.body.contextStyles).toEqual({
        "(orientation: landscape)": { padding: 4 },
      });

      const deleted = await env.api.request({
        method: "DELETE",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { author: TEST_AUTHOR },
      });
      expect(deleted.status).toBe(204);

      const after = await env.api.request<{ rules: StyleRuleResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules`,
      });
      expect(after.body.rules).toEqual([]);
    } finally {
      await env.close();
    }
  });

  it("versions the registry and rejects a stale baseVersion without writing", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Versionierte Registry");
      const initial = await env.api.request<{ rules: StyleRuleResponse[]; version: number }>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules`,
      });
      expect(initial.status).toBe(200);
      expect(initial.body.version).toBe(0);
      expect(initial.headers["x-senify-style-version"]).toBe("0");

      const created = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "versioned", baseVersion: initial.body.version, author: TEST_AUTHOR },
      });
      expect(created.status).toBe(201);
      expect(created.headers["x-senify-style-version"]).toBe("1");

      const stale = await env.api.request<ErrorResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { styles: { color: "#123456" }, baseVersion: 0, author: TEST_AUTHOR },
      });
      expect(stale.status).toBe(409);
      expect(stale.body.error.field).toBe("baseVersion");
      // The conflict names the version the server is on: without it the
      // client cannot resend its write, and the retry never ends.
      expect(stale.body.error.currentVersion).toBe(1);

      const after = await env.api.request<{ rules: StyleRuleResponse[]; version: number }>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules`,
      });
      expect(after.body.version).toBe(1);
      expect(after.body.rules[0]?.styles).toEqual({});
    } finally {
      await env.close();
    }
  });

  it("reorders by permutation and normalizes the order to the array position", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Reihenfolge");
      const ids: string[] = [];
      for (const name of ["a", "b", "c"]) {
        const created = await env.api.request<StyleRuleResponse>({
          method: "POST",
          path: `/api/sites/${site.id}/style-rules`,
          body: { name, author: TEST_AUTHOR },
        });
        ids.push(created.body.id);
      }

      const moved = await env.api.request<{ rules: StyleRuleResponse[] }>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules/${ids[2]}/reorder`,
        body: { index: 0, author: TEST_AUTHOR },
      });
      expect(moved.status).toBe(200);
      expect(moved.body.rules.map((rule) => rule.name)).toEqual(["c", "a", "b"]);
      expect(moved.body.rules.map((rule) => rule.order)).toEqual([0, 1, 2]);

      const reread = await env.api.request<{ rules: StyleRuleResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules`,
      });
      expect(reread.body.rules.map((rule) => rule.name)).toEqual(["c", "a", "b"]);
      const scoped = await env.api.request<StyleRuleResponse>({
        method: "POST", path: `/api/sites/${site.id}/style-rules`,
        body: { name: "ignored", kind: "scoped", nodeId: "node-other", author: TEST_AUTHOR },
      });
      expect(scoped.status).toBe(201);
      const reposition = await env.api.request({ method: "POST", path: `/api/sites/${site.id}/style-rules/${scoped.body.id}/reorder`, body: { index: 1, author: TEST_AUTHOR } });
      expect(reposition.status).toBe(200);
      const byClassIndex = await env.api.request<{ rules: StyleRuleResponse[] }>({ method: "POST", path: `/api/sites/${site.id}/style-rules/${ids[2]}/reorder`, body: { classIndex: 2, author: TEST_AUTHOR } });
      expect(byClassIndex.status).toBe(200);
      expect(byClassIndex.body.rules.filter((entry) => entry.kind === "class").map((entry) => entry.name)).toEqual(["a", "b", "c"]);
      expect(byClassIndex.body.rules.some((entry) => entry.id === scoped.body.id)).toBe(true);
      const invalid = await env.api.request({ method: "POST", path: `/api/sites/${site.id}/style-rules/${ids[2]}/reorder`, body: { index: 0, classIndex: 0, author: TEST_AUTHOR } });
      expect(invalid.status).toBe(400);
      const beforeNoOp = await env.api.request<{ version: number }>({ method: "GET", path: `/api/sites/${site.id}/style-rules` });
      const noOp = await env.api.request({ method: "POST", path: `/api/sites/${site.id}/style-rules/${ids[2]}/reorder`, body: { classIndex: 2, baseVersion: beforeNoOp.body.version, author: TEST_AUTHOR } });
      expect(noOp.status).toBe(200);
      const afterNoOp = await env.api.request<{ version: number }>({ method: "GET", path: `/api/sites/${site.id}/style-rules` });
      expect(afterNoOp.body.version).toBe(beforeNoOp.body.version + 1);
    } finally {
      await env.close();
    }
  });

  it("keeps scoped rules pinned to one node and rejects a second one", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Scoped");
      const first = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "ignored", kind: "scoped", nodeId: "node-1", author: TEST_AUTHOR },
      });
      expect(first.status).toBe(201);
      expect(first.body.kind).toBe("scoped");
      expect(first.body.scope).toEqual({
        type: "node",
        nodeId: "node-1",
        role: "module-style",
      });
      expect(first.body.name).toBe("__senify_scope_node-1");

      const second = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "ignored", kind: "scoped", nodeId: "node-1", author: TEST_AUTHOR },
      });
      expect(second.status).toBe(409);
      expect(second.body.error.message).toMatch(/already owns a scoped style rule/);
    } finally {
      await env.close();
    }
  });

  it("creates an ambient rule from a selector", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Ambient");
      // Ambient rules are a human capability (ticket 18, slice 3): the agent
      // token is rejected, the editor token is the one that writes them.
      const created = await env.humanApi.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "h1", kind: "ambient", selector: "h1 > span", author: TEST_AUTHOR },
      });
      expect(created.status).toBe(201);
      expect(created.body.kind).toBe("ambient");
      expect(created.body.selector).toBe("h1 > span");
      expect(created.body.name).toBe("h1 > span");
    } finally {
      await env.close();
    }
  });

  it("rejects a duplicate class name and a reserved context id", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Doppelt");
      const first = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "card", author: TEST_AUTHOR },
      });
      expect(first.status).toBe(201);

      const duplicate = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "card", author: TEST_AUTHOR },
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.field).toBe("name");

      // `mobile` is a device suffix, not a custom condition.
      const reserved = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: {
          name: "shadow",
          contextStyles: { mobile: { color: "#fff" } },
          author: TEST_AUTHOR,
        },
      });
      expect(reserved.status).toBe(400);
      expect(reserved.body.error.message).toMatch(/reserved/);
    } finally {
      await env.close();
    }
  });

  it("writes the registry through the audit log", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Audit");
      const created = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "card", author: TEST_AUTHOR },
      });
      await env.api.request({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { styles: { color: "#000" }, author: TEST_AUTHOR },
      });

      const audit = await env.api.request<{
        entries: { mutation: string; params: Record<string, unknown> }[];
      }>({ method: "GET", path: `/api/sites/${site.id}/audit` });
      const mutations = audit.body.entries.map((entry) => entry.mutation);
      expect(mutations).toContain("create_style_rule");
      expect(mutations).toContain("update_style_rule");
    } finally {
      await env.close();
    }
  });

  it("answers 404 for a rule of another site", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Eins");
      const other = await createTestSite(env.api, "Zwei");
      const created = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "card", author: TEST_AUTHOR },
      });

      const foreign = await env.api.request<ErrorResponse>({
        method: "GET",
        path: `/api/sites/${other.id}/style-rules/${created.body.id}`,
      });
      expect(foreign.status).toBe(404);

      const otherRules = await env.api.request<{ rules: StyleRuleResponse[] }>({
        method: "GET",
        path: `/api/sites/${other.id}/style-rules`,
      });
      expect(otherRules.body.rules).toEqual([]);
    } finally {
      await env.close();
    }
  });

  it("carries pseudo states and the author through the registry", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Zustaende");
      const created = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: {
          name: "cta",
          styles: { background: "#f00" },
          states: { hover: { background: "#00ff00" }, disabled: { opacity: 0.5 } },
          authoredBy: "agent",
          author: TEST_AUTHOR,
        },
      });
      expect(created.status).toBe(201);
      expect(created.body.states).toEqual({
        hover: { background: "#00ff00" },
        disabled: { opacity: 0.5 },
      });
      expect(created.body.authoredBy).toBe("agent");

      // A patch merges into the states instead of replacing them.
      const updated = await env.api.request<StyleRuleResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { states: { active: { color: "#0000ff" } }, author: TEST_AUTHOR },
      });
      expect(updated.status).toBe(200);
      expect(updated.body.states).toEqual({
        hover: { background: "#00ff00" },
        disabled: { opacity: 0.5 },
        active: { color: "#0000ff" },
      });

      const reread = await env.api.request<StyleRuleResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
      });
      expect(reread.body.states).toEqual(updated.body.states);
      expect(reread.body.authoredBy).toBe("agent");
    } finally {
      await env.close();
    }
  });

  it("takes a canonical editor-document rule unchanged", async () => {
    // The acceptance of ticket 07: a rule as the editor document holds it (the
    // canonical shape) is accepted by the site route and comes back the same.
    // rawCss is a human capability, so the editor token writes it (ticket 18).
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Roundtrip");
      const documentRule = {
        id: "r-document",
        name: "hero-cta",
        kind: "class" as const,
        selector: ".hero-cta",
        order: 0,
        description: "The hero call to action",
        styles: { background: "#cbff97", padding_tablet: 8 },
        states: { hover: { background: "#01283c" }, disabled: { opacity: 0.5 } },
        contextStyles: { "(orientation: landscape)": { padding: 12 } },
        rawCss: "@keyframes pulse { from { opacity: 1; } to { opacity: 0.5; } }",
        authoredBy: "user" as const,
      };
      // The document holds `order` because the array position is the cascade
      // order; the route owns the order instead (it has `reorder`), so the
      // save path drops the field and everything else travels unchanged.
      const { order, ...body } = documentRule;
      expect(order).toBe(0);
      const created = await env.humanApi.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { ...body, author: TEST_AUTHOR },
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        id: "r-document",
        name: "hero-cta",
        kind: "class",
        selector: ".hero-cta",
        order: 0,
        description: "The hero call to action",
        styles: { background: "#cbff97", padding_tablet: 8 },
        states: { hover: { background: "#01283c" }, disabled: { opacity: 0.5 } },
        contextStyles: { "(orientation: landscape)": { padding: 12 } },
        rawCss: "@keyframes pulse { from { opacity: 1; } to { opacity: 0.5; } }",
        authoredBy: "user",
      });
    } finally {
      await env.close();
    }
  });

  it("rejects an unknown state name", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Falscher Zustand");
      const rejected = await env.api.request<ErrorResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: {
          name: "cta",
          states: { banana: { color: "#000" } },
          author: TEST_AUTHOR,
        },
      });
      expect(rejected.status).toBe(400);
    } finally {
      await env.close();
    }
  });

  it("keeps the registry of a site that predates the column empty", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Altbestand");
      // The column is nullable and additive; a site created before Phase 2
      // reads as an empty registry, not as an error.
      const rules = await env.api.request<{ rules: StyleRuleResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules`,
      });
      expect(rules.status).toBe(200);
      expect(rules.body.rules).toEqual([]);
    } finally {
      await env.close();
    }
  });

  // R9: the class rename had an implementation but no test. A rename is the
  // one write in the registry that changes what the rule *means* rather than
  // how it looks, so it is exactly the kind of change that needs a proof: the
  // id survives, the selector follows the name, the styles stay put, and the
  // two kinds that must not be renamed say so instead of silently changing.
  it("renames a class rule and carries the selector, id and styles along", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Rename");
      const created = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: {
          name: "hero-button",
          styles: { background: "#cbff97", padding: 12 },
          author: TEST_AUTHOR,
        },
      });
      expect(created.status).toBe(201);
      expect(created.body.selector).toBe(".hero-button");

      const renamed = await env.api.request<StyleRuleResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { name: "cta-primary", author: TEST_AUTHOR },
      });
      expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
      // The id is the rule's identity and must not move; the selector is
      // derived from the name and must follow, or the CSS keeps addressing the
      // old class and the rename looks successful while changing nothing.
      expect(renamed.body.id).toBe(created.body.id);
      expect(renamed.body.name).toBe("cta-primary");
      expect(renamed.body.selector).toBe(".cta-primary");
      // A rename is not a restyle: the declarations travel unchanged.
      expect(renamed.body.styles).toEqual({ background: "#cbff97", padding: 12 });

      const reread = await env.api.request<StyleRuleResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
      });
      expect(reread.body.name).toBe("cta-primary");
      expect(reread.body.selector).toBe(".cta-primary");
    } finally {
      await env.close();
    }
  });

  it("refuses a rename onto a name that is already taken", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Kollision");
      const first = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "alpha", author: TEST_AUTHOR },
      });
      const second = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "beta", author: TEST_AUTHOR },
      });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      // Two rules with one class would make the cascade order decide which one
      // wins, silently and per element. The rename must lose instead.
      const clash = await env.api.request<ErrorResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${second.body.id}`,
        body: { name: "alpha", author: TEST_AUTHOR },
      });
      expect(clash.status).toBe(409);
      expect(clash.body.error.field).toBe("name");

      const unchanged = await env.api.request<StyleRuleResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules/${second.body.id}`,
      });
      expect(unchanged.body.name).toBe("beta");
    } finally {
      await env.close();
    }
  });

  it("refuses to rename an invalid class name and leaves the rule alone", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Ungueltig");
      const created = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "keep-me", author: TEST_AUTHOR },
      });
      expect(created.status).toBe(201);

      // A name that is not a CSS class would produce a selector that matches
      // nothing - the rule would exist and do nothing.
      const bad = await env.api.request<ErrorResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { name: "1nicht gültig", author: TEST_AUTHOR },
      });
      expect(bad.status).toBe(400);
      expect(bad.body.error.field).toBe("name");

      const unchanged = await env.api.request<StyleRuleResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
      });
      expect(unchanged.body.name).toBe("keep-me");
      expect(unchanged.body.selector).toBe(".keep-me");
    } finally {
      await env.close();
    }
  });

  it("renames an ambient rule through its selector and never through its name", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Ambient-Rename");
      const created = await env.humanApi.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "h1", kind: "ambient", selector: "h1 > span", author: TEST_AUTHOR },
      });
      expect(created.status).toBe(201);

      // An ambient rule's name mirrors its selector; renaming the name alone
      // would leave the CSS addressing the old selector under a new label.
      const byName = await env.humanApi.request<ErrorResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { name: "h2", author: TEST_AUTHOR },
      });
      expect(byName.status).toBe(400);
      expect(byName.body.error.message).toMatch(/selector/);

      const bySelector = await env.humanApi.request<StyleRuleResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { selector: "h2 > span", author: TEST_AUTHOR },
      });
      expect(bySelector.status, JSON.stringify(bySelector.body)).toBe(200);
      // Name and selector move together, or the registry describes a rule that
      // does not exist.
      expect(bySelector.body.name).toBe("h2 > span");
      expect(bySelector.body.selector).toBe("h2 > span");
    } finally {
      await env.close();
    }
  });

  it("refuses to rename a scoped rule, which belongs to its node", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Scoped-Rename");
      const created = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "ignored", kind: "scoped", nodeId: "node-1", author: TEST_AUTHOR },
      });
      expect(created.status).toBe(201);

      // A scoped rule is generated from its node. Renaming it by hand would
      // break the link between node and styles - the next bake would drop it.
      const denied = await env.api.request<ErrorResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { name: "hand-made", author: TEST_AUTHOR },
      });
      expect(denied.status).toBe(400);
      expect(denied.body.error.message).toMatch(/scoped/i);

      const unchanged = await env.api.request<StyleRuleResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
      });
      expect(unchanged.body.name).toBe("__senify_scope_node-1");
    } finally {
      await env.close();
    }
  });

  it("answers a write without a body the way the contract says", async () => {
    // Fuenf Schreibrouten des Moduls beginnen mit
    // `(await readJsonBody(req)) ?? {}`. Der Zweig "kein Koerper" war nach dem
    // Schnitt ungedeckt (Befund 24.10.2026: http-routes-theme.ts 65,38 %
    // Branches) - und ein Aufruf ohne Koerper ist der erste, den ein Client
    // falsch macht.
    //
    // Der Vertrag entscheidet, was richtig ist. Drei Formen, und nur eine davon
    // ist ein Fehler:
    //   - `PUT /theme` und `POST /style-rules` verlangen ein Pflichtfeld
    //     (`theme` bzw. `name`) - ein leerer Koerper ist 400.
    //   - `POST .../reorder` verlangt `index` - ebenfalls 400.
    //   - `PATCH` auf eine Regel und `DELETE` einer Regel tragen nur optionale
    //     Felder (`SiteEventBodySchema` = `baseVersion`/`author`). Ein leerer
    //     Koerper ist dort ein gueltiger No-op und antwortet 200 bzw. 204.
    // Das ist kein Versehen, sondern die Form des Vertrags; der Test haelt
    // beide Seiten fest, damit ein spaeterer Umbau die Unterscheidung nicht
    // still verliert.
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Ohne Koerper");
      const pflicht: Array<{ method: "PUT" | "POST"; pfad: string }> = [
        { method: "PUT", pfad: `/api/sites/${site.id}/theme` },
        { method: "POST", pfad: `/api/sites/${site.id}/style-rules` },
      ];
      for (const fall of pflicht) {
        const antwort = await env.api.request<{ error: { category: string } }>({
          method: fall.method,
          path: fall.pfad,
        });
        expect(antwort.status, `${fall.method} ${fall.pfad}`).toBe(400);
        expect(antwort.body.error.category, `${fall.method} ${fall.pfad}`).toBe("validation");
      }

      const regel = await env.api.request<StyleRuleResponse>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules`,
        body: { name: "ohne-koerper", kind: "class", author: TEST_AUTHOR },
      });
      expect(regel.status).toBe(201);

      // PATCH: alle Felder optional, ein leerer Koerper ist ein No-op.
      const leer = await env.api.request<StyleRuleResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${regel.body.id}`,
      });
      expect(leer.status).toBe(200);
      expect(leer.body.name).toBe("ohne-koerper");

      // reorder verlangt `index`.
      const ohneIndex = await env.api.request<{ error: { category: string } }>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules/${regel.body.id}/reorder`,
      });
      expect(ohneIndex.status).toBe(400);
      expect(ohneIndex.body.error.category).toBe("validation");

      // DELETE: nur optionale Felder, ein leerer Koerper loescht.
      const weg = await env.api.request<unknown>({
        method: "DELETE",
        path: `/api/sites/${site.id}/style-rules/${regel.body.id}`,
      });
      expect(weg.status).toBe(204);
    } finally {
      await env.close();
    }
  });
});
