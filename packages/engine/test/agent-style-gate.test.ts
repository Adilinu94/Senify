import { describe, expect, it } from "vitest";
import { bootEngine, createTestSite, TEST_AUTHOR, type ErrorResponse } from "./helpers.ts";

// The default theme's brand anchors (packages/tokens/src/default-theme.ts):
// `#006092` is `color.accent` and the semantic role `accent`; `#024364` is
// `color.brand`. Both are raw values the fence must catch for agents.
const ACCENT_HEX = "#006092";
const BRAND_HEX = "#024364";

type StyleRuleResponse = {
  id: string;
  name: string;
  kind: "class" | "ambient" | "scoped";
  selector: string;
  styles: Record<string, unknown>;
  states?: Record<string, Record<string, unknown>>;
  contextStyles: Record<string, Record<string, unknown>>;
  rawCss?: string;
  authoredBy?: "user" | "agent" | "preset";
  scope?: { type: "node"; nodeId: string; role: "module-style" };
};

type AuditResponse = {
  entries: {
    mutation: string;
    params: Record<string, unknown>;
    author: { kind: string; id: string; label: string };
  }[];
};

function createRule(
  env: Awaited<ReturnType<typeof bootEngine>>,
  siteId: string,
  body: Record<string, unknown>,
  client: "agent" | "human" = "agent",
): Promise<{ status: number; body: StyleRuleResponse & ErrorResponse }> {
  const api = client === "human" ? env.humanApi : env.api;
  return api.request<StyleRuleResponse & ErrorResponse>({
    method: "POST",
    path: `/api/sites/${siteId}/style-rules`,
    body: { ...body, author: TEST_AUTHOR },
  });
}

describe("agent style gate (ticket 18, slice 3)", () => {
  it("rejects an agent raw color that matches a theme token and writes nothing", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Fence");
      const rejected = await createRule(env, site.id, {
        name: "cta",
        styles: { background: ACCENT_HEX },
      });
      expect(rejected.status).toBe(400);
      expect(rejected.body.error.category).toBe("validation");
      expect(rejected.body.error.field).toBe("rule.styles.background");
      expect(rejected.body.error.suggestion).toContain('$token: "accent"');

      // Transaction guarantee: the rejection leaves no trace.
      const rules = await env.api.request<{ rules: StyleRuleResponse[] }>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules`,
      });
      expect(rules.body.rules).toEqual([]);
      const audit = await env.api.request<AuditResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/audit`,
      });
      expect(audit.body.entries.filter((entry) => entry.mutation === "create_style_rule")).toEqual([]);
    } finally {
      await env.close();
    }
  });

  it("lets an agent write the token reference and free values without a matching token", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Durchlass");
      const tokenRule = await createRule(env, site.id, {
        name: "token-rule",
        styles: { background: { $token: "accent" } },
      });
      expect(tokenRule.status).toBe(201);
      expect(tokenRule.body.styles.background).toEqual({ $token: "accent" });

      // No token matches #123456: the fence must not become a straitjacket.
      const freeRule = await createRule(env, site.id, {
        name: "free-rule",
        styles: { background: "#123456" },
      });
      expect(freeRule.status).toBe(201);
      expect(freeRule.body.styles.background).toBe("#123456");

      // A primitive token is suggested when no semantic role matches.
      const primitive = await createRule(env, site.id, {
        name: "primitive-rule",
        styles: { color: BRAND_HEX },
      });
      expect(primitive.status).toBe(400);
      expect(primitive.body.error.suggestion).toContain('$token: "color.brand"');
    } finally {
      await env.close();
    }
  });

  it("lets the editor write raw values and derives the provenance from the token", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Editor");
      const human = await createRule(
        env,
        site.id,
        { name: "editor-rule", styles: { background: ACCENT_HEX } },
        "human",
      );
      expect(human.status).toBe(201);
      expect(human.body.authoredBy).toBe("user");

      // The body cannot forge the provenance: the token decides.
      const agentForged = await createRule(env, site.id, {
        name: "forged-agent",
        authoredBy: "user",
      });
      expect(agentForged.status).toBe(201);
      expect(agentForged.body.authoredBy).toBe("agent");

      const humanForged = await createRule(
        env,
        site.id,
        { name: "forged-human", authoredBy: "agent" },
        "human",
      );
      expect(humanForged.status).toBe(201);
      expect(humanForged.body.authoredBy).toBe("user");
    } finally {
      await env.close();
    }
  });

  it("fences the pseudo states and the custom conditions, not just the base bag", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Zustaende");
      const state = await createRule(env, site.id, {
        name: "state-rule",
        states: { hover: { color: ACCENT_HEX } },
      });
      expect(state.status).toBe(400);
      expect(state.body.error.field).toBe("rule.states.hover.color");

      const context = await createRule(env, site.id, {
        name: "context-rule",
        contextStyles: { landscape: { color: ACCENT_HEX } },
      });
      expect(context.status).toBe(400);
      expect(context.body.error.field).toBe("rule.contextStyles.landscape.color");

      // The pass case: the same bags with a token reference.
      const allowed = await createRule(env, site.id, {
        name: "state-ok",
        states: { hover: { color: { $token: "accent" } } },
        contextStyles: { landscape: { color: { $token: "accent" } } },
      });
      expect(allowed.status).toBe(201);
    } finally {
      await env.close();
    }
  });

  it("rejects an agent update with a raw token color and leaves the rule unchanged", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Update");
      const created = await createRule(
        env,
        site.id,
        { name: "user-rule", styles: { background: "#cbff97" } },
        "human",
      );
      expect(created.status).toBe(201);

      const rejected = await env.api.request<ErrorResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { styles: { color: ACCENT_HEX }, author: TEST_AUTHOR },
      });
      expect(rejected.status).toBe(400);
      expect(rejected.body.error.field).toBe("rule.styles.color");

      const reread = await env.api.request<StyleRuleResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
      });
      expect(reread.body.styles).toEqual({ background: "#cbff97" });
      expect(reread.body.authoredBy).toBe("user");

      // The same patch with a token reference is allowed and keeps the
      // user provenance (an agent edit does not re-label the rule).
      const allowed = await env.api.request<StyleRuleResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { styles: { color: { $token: "accent" } }, author: TEST_AUTHOR },
      });
      expect(allowed.status).toBe(200);
      expect(allowed.body.authoredBy).toBe("user");

      const audit = await env.api.request<AuditResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/audit`,
      });
      const update = audit.body.entries.find(
        (entry) => entry.mutation === "update_style_rule",
      );
      expect(update?.author.kind).toBe("agent");
      expect(update?.author.id).toBe("engine-tests");
    } finally {
      await env.close();
    }
  });

  it("rejects ambient rules and rawCss from agents, lets the editor write them", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Ambient");
      const ambient = await createRule(env, site.id, {
        name: "h1",
        kind: "ambient",
        selector: "h1",
      });
      expect(ambient.status).toBe(400);
      expect(ambient.body.error.field).toBe("rule.kind");

      const rawCss = await createRule(env, site.id, {
        name: "pulse",
        rawCss: "@keyframes pulse { from { opacity: 1; } to { opacity: 0.5; } }",
      });
      expect(rawCss.status).toBe(400);
      expect(rawCss.body.error.field).toBe("rule.rawCss");

      const humanAmbient = await createRule(
        env,
        site.id,
        { name: "h1", kind: "ambient", selector: "h1" },
        "human",
      );
      expect(humanAmbient.status).toBe(201);
      const humanRawCss = await createRule(
        env,
        site.id,
        {
          name: "pulse",
          rawCss: "@keyframes pulse { from { opacity: 1; } to { opacity: 0.5; } }",
        },
        "human",
      );
      expect(humanRawCss.status).toBe(201);

      // An agent cannot flip an existing ambient rule's selector either.
      const selectorPatch = await env.api.request<ErrorResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${humanAmbient.body.id}`,
        body: { selector: "h2", author: TEST_AUTHOR },
      });
      expect(selectorPatch.status).toBe(400);
      expect(selectorPatch.body.error.field).toBe("rule.selector");
    } finally {
      await env.close();
    }
  });

  it("marks a reorder of a foreign rule in the audit", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Fremd");
      const first = await createRule(
        env,
        site.id,
        { name: "eins" },
        "human",
      );
      await createRule(env, site.id, { name: "zwei" }, "human");

      const moved = await env.api.request<{ rules: StyleRuleResponse[] }>({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules/${first.body.id}/reorder`,
        body: { index: 1, author: TEST_AUTHOR },
      });
      expect(moved.status).toBe(200);

      const audit = await env.api.request<AuditResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/audit`,
      });
      const reorder = audit.body.entries.find(
        (entry) => entry.mutation === "reorder_style_rule",
      );
      expect(reorder?.params.foreignAuthoredBy).toBe("user");
      expect(reorder?.author.kind).toBe("agent");

      // An agent reordering its own rule carries no foreign marker.
      const own = await createRule(env, site.id, { name: "drei" });
      const ownMove = await env.api.request({
        method: "POST",
        path: `/api/sites/${site.id}/style-rules/${own.body.id}/reorder`,
        body: { index: 0, author: TEST_AUTHOR },
      });
      expect(ownMove.status).toBe(200);
      const auditAfter = await env.api.request<AuditResponse>({
        method: "GET",
        path: `/api/sites/${site.id}/audit`,
      });
      const ownEntry = auditAfter.body.entries.find(
        (entry) =>
          entry.mutation === "reorder_style_rule" &&
          entry.params.ruleId === own.body.id,
      );
      expect(ownEntry?.params.foreignAuthoredBy).toBeUndefined();
    } finally {
      await env.close();
    }
  });

  it("bounds rawCss length and rejects foreign-host url() references", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Grenzen");
      const tooLong = await createRule(
        env,
        site.id,
        {
          name: "long",
          rawCss: `@keyframes long { ${"opacity: 1; ".repeat(180)} }`,
        },
        "human",
      );
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.error.field).toBe("rule.rawCss");
      expect(tooLong.body.error.message).toMatch(/2000 characters/);

      const foreign = await createRule(
        env,
        site.id,
        {
          name: "foreign",
          rawCss:
            "@keyframes spin { from { background-image: url(https://cdn.example.test/x.png); } }",
        },
        "human",
      );
      expect(foreign.status).toBe(400);
      expect(foreign.body.error.message).toMatch(/foreign host/);

      const relative = await createRule(
        env,
        site.id,
        {
          name: "relative",
          rawCss:
            "@keyframes spin { from { background-image: url(/assets/x.png); } }",
        },
        "human",
      );
      expect(relative.status).toBe(201);
    } finally {
      await env.close();
    }
  });

  it("keeps a scoped rule on its own node anchor and refuses a foreign selector", async () => {
    const env = await bootEngine();
    try {
      const site = await createTestSite(env.api, "Scoped");
      // The selector input is ignored for scoped rules: the anchor is derived
      // from the node, so it can only reference the rule's own node.
      const created = await createRule(
        env,
        site.id,
        { name: "ignored", kind: "scoped", nodeId: "node-7", selector: "body" },
        "human",
      );
      expect(created.status).toBe(201);
      expect(created.body.selector).toBe(".__senify_scope_node-7");
      expect(created.body.scope?.nodeId).toBe("node-7");

      const foreign = await env.api.request<ErrorResponse>({
        method: "PATCH",
        path: `/api/sites/${site.id}/style-rules/${created.body.id}`,
        body: { selector: "body", author: TEST_AUTHOR },
      });
      expect(foreign.status).toBe(400);
      expect(foreign.body.error.field).toBe("selector");
    } finally {
      await env.close();
    }
  });
});
