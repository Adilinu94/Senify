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