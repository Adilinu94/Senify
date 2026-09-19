import { describe, expect, it } from "vitest";
import { bootEngine, createTestSite, TEST_AUTHOR, type ErrorResponse } from "./helpers.ts";

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
      const created = await env.api.request<StyleRuleResponse>({
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
      const created = await env.api.request<StyleRuleResponse>({
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
});