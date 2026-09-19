import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiHarness, type ApiHarness } from "@senify/core/testing";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  type BootEnv,
} from "./helpers.ts";

type ErrorBody = {
  error: { category: string; message: string; suggestion?: string; field?: string };
};

type TokenBody = {
  token: {
    id: string;
    name: string;
    kind: string;
    scopes: string[];
    prefix: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
    revokedAt: string | null;
  };
  secret: string;
};

let env: BootEnv;
let anon: ApiHarness;

beforeAll(async () => {
  env = await bootEngine();
  anon = createApiHarness(env.server.origin);
});

afterAll(async () => {
  await env.close();
});

describe("api tokens", () => {
  it("creates a token with a one-time secret and lists metadata only", async () => {
    const created = await env.api.request<TokenBody>({
      method: "POST",
      path: "/api/tokens",
      body: { name: "Claude Code", scopes: ["read", "write"], expires: "90d" },
    });
    expect(created.status).toBe(201);
    expect(created.body.secret).toMatch(/^snfy_[A-Za-z0-9_-]{20,}$/);
    expect(created.body.token.prefix).toBe(created.body.secret.slice(0, 12));
    expect(created.body.token.scopes).toEqual(["read", "write"]);
    // Tokens created by hand default to the agent identity (ticket 18).
    expect(created.body.token.kind).toBe("agent");
    expect(created.body.token.expiresAt).toBeTruthy();
    expect(created.body.token.lastUsedAt).toBeNull();

    const listed = await env.api.request<{ tokens: Record<string, unknown>[] }>({
      method: "GET",
      path: "/api/tokens",
    });
    expect(listed.status).toBe(200);
    const entry = listed.body.tokens.find(
      (token) => token.id === created.body.token.id,
    );
    expect(entry?.prefix).toBe(created.body.token.prefix);
    expect(entry?.kind).toBe("agent");
    expect(JSON.stringify(listed.body)).not.toContain(created.body.secret);
    expect(entry?.tokenHash).toBeUndefined();
  });

  it("accepts an explicit human kind and rejects unknown kinds", async () => {
    const human = await env.api.request<TokenBody>({
      method: "POST",
      path: "/api/tokens",
      body: { name: "Operator", kind: "human", scopes: ["read"] },
    });
    expect(human.status).toBe(201);
    expect(human.body.token.kind).toBe("human");

    const invalid = await env.api.request<ErrorBody>({
      method: "POST",
      path: "/api/tokens",
      body: { name: "Bot", kind: "bot", scopes: ["read"] },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.field).toBe("kind");
  });

  it("rejects missing, unknown, revoked and expired credentials with 401", async () => {
    const missing = await anon.request<ErrorBody>({
      method: "GET",
      path: "/api/sites",
    });
    expect(missing.status).toBe(401);
    expect(missing.body.error.category).toBe("auth");
    expect(missing.body.error.suggestion).toContain("senify tokens create");

    const unknown = await anon.request<ErrorBody>({
      method: "GET",
      path: "/api/sites",
      headers: { authorization: "Bearer snfy_nope" },
    });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toContain("unknown or revoked");

    const created = await env.api.request<TokenBody>({
      method: "POST",
      path: "/api/tokens",
      body: { name: "temp", scopes: ["read"] },
    });
    const revoked = await env.api.request({
      method: "DELETE",
      path: `/api/tokens/${created.body.token.id}`,
    });
    expect(revoked.status).toBe(204);
    const afterRevoke = await anon.request<ErrorBody>({
      method: "GET",
      path: "/api/sites",
      headers: { authorization: `Bearer ${created.body.secret}` },
    });
    expect(afterRevoke.status).toBe(401);
    expect(afterRevoke.body.error.message).toContain("unknown or revoked");

    const expired = await env.engine.store.createToken({
      name: "expired",
      scopes: ["read"],
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const stale = await anon.request<ErrorBody>({
      method: "GET",
      path: "/api/sites",
      headers: { authorization: `Bearer ${expired.secret}` },
    });
    expect(stale.status).toBe(401);
    expect(stale.body.error.message).toContain("expired");
  });

  it("enforces scopes server-side with actionable errors", async () => {
    const readOnly = await env.api.request<TokenBody>({
      method: "POST",
      path: "/api/tokens",
      body: { name: "reader", scopes: ["read"] },
    });
    const reader = createApiHarness(env.server.origin, {
      token: readOnly.body.secret,
    });
    const site = await createTestSite(env.api, "Scope Site");

    const read = await reader.request({ method: "GET", path: "/api/sites" });
    expect(read.status).toBe(200);

    const write = await reader.request<ErrorBody>({
      method: "POST",
      path: "/api/sites",
      body: { name: "Nope" },
    });
    expect(write.status).toBe(403);
    expect(write.body.error.message).toBe('Missing scope "write"');
    expect(write.body.error.suggestion).toContain("--scopes read,write");

    const page = await createTestPage(env.api, site.id);
    const del = await reader.request<ErrorBody>({
      method: "DELETE",
      path: `/api/pages/${page.id}`,
    });
    expect(del.status).toBe(403);
    expect(del.body.error.message).toBe('Missing scope "publish"');
  });

  it("reports token identity via whoami", async () => {
    const who = await env.api.request<{
      name: string;
      kind: string;
      scopes: string[];
      prefix: string;
      lastUsedAt: string | null;
    }>({ method: "GET", path: "/api/whoami" });
    expect(who.status).toBe(200);
    expect(who.body.name).toBe("engine-tests");
    expect(who.body.kind).toBe("agent");
    expect(who.body.scopes).toEqual(["read", "write", "publish"]);
    expect(who.body.prefix).toMatch(/^snfy_/);
    expect(who.body.lastUsedAt).toBeTruthy();
  });

  it("derives the audit kind from the token, not the body", async () => {
    // Counter-check to the forgery test: a human token records "human" even
    // when the body claims "agent" (ticket 18, slice 1).
    const site = await createTestSite(env.api, "Identity Site");
    const page = await createTestPage(env.api, site.id);
    const human = await env.api.request<TokenBody>({
      method: "POST",
      path: "/api/tokens",
      body: { name: "Operator", kind: "human", scopes: ["read", "write"] },
    });
    const operator = createApiHarness(env.server.origin, {
      token: human.body.secret,
    });
    const applied = await operator.request({
      method: "POST",
      path: `/api/pages/${page.id}/mutations`,
      body: {
        baseDraftVersion: page.draftVersion,
        author: { kind: "agent", id: "bot", label: "Bot" },
        mutations: [
          {
            op: "insertNode",
            parent: { nodeId: page.draft.rootNodeId },
            node: { id: "human-box", type: "container", props: {} },
          },
        ],
      },
    });
    expect(applied.status).toBe(200);

    const audit = await operator.request<{
      entries: { author: unknown }[];
    }>({ method: "GET", path: `/api/pages/${page.id}/audit?limit=1` });
    expect(audit.status).toBe(200);
    expect(audit.body.entries[0]?.author).toEqual({
      kind: "human",
      id: "Operator",
      label: "Operator",
    });
  });

  it("audits mcp calls with redacted secrets", async () => {
    const created = await env.api.request<{ id: string }>({
      method: "POST",
      path: "/api/mcp/audit",
      body: {
        client: "Claude Code",
        tool: "apply_mutations",
        args: { pageId: "p1", token: "snfy_secret", mutations: 2 },
        result: "ok",
        entity: "page:p1",
        durationMs: 41,
      },
    });
    expect(created.status).toBe(201);

    const listed = await env.api.request<{
      entries: {
        tool: string;
        args: Record<string, unknown>;
        client: string;
        durationMs: number;
        tokenId: string | null;
      }[];
    }>({ method: "GET", path: "/api/mcp/audit?limit=5" });
    expect(listed.status).toBe(200);
    const entry = listed.body.entries[0];
    expect(entry?.tool).toBe("apply_mutations");
    expect(entry?.client).toBe("Claude Code");
    expect(entry?.args).toEqual({
      pageId: "p1",
      token: "[redacted]",
      mutations: 2,
    });
    expect(entry?.durationMs).toBe(41);
    expect(entry?.tokenId).toBeTruthy();
  });
});

describe("rate limits", () => {
  it("returns 429 with retry-after once the burst is spent", async () => {
    const limited = await bootEngine({
      rateLimits: { perMinute: 60, burst: 2, destructivePerMinute: 1 },
    });
    try {
      const first = await limited.api.request({
        method: "GET",
        path: "/api/sites",
      });
      const second = await limited.api.request({
        method: "GET",
        path: "/api/sites",
      });
      const third = await limited.api.request<ErrorBody>({
        method: "GET",
        path: "/api/sites",
      });
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      expect(third.body.error.message).toContain("Rate limit exceeded");
      expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);
    } finally {
      await limited.close();
    }
  });

  it("limits destructive operations separately", async () => {
    const limited = await bootEngine({
      rateLimits: { perMinute: 100, burst: 100, destructivePerMinute: 1 },
    });
    try {
      const first = await createTestSite(limited.api, "Destructive");
      const firstPage = await createTestPage(limited.api, first.id);
      const deleted = await limited.api.request({
        method: "DELETE",
        path: `/api/pages/${firstPage.id}`,
      });
      expect(deleted.status).toBe(204);

      const second = await createTestSite(limited.api, "Destructive 2");
      const secondPage = await createTestPage(limited.api, second.id);
      const blocked = await limited.api.request<ErrorBody>({
        method: "DELETE",
        path: `/api/pages/${secondPage.id}`,
      });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.message).toContain("destructive");
    } finally {
      await limited.close();
    }
  });
});
