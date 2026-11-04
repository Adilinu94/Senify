import { describe, expect, it } from "vitest";
import { Store, type Db, type DbClient } from "@senify/engine";
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
});
