import { afterEach, describe, expect, it } from "vitest";
import { ensureSchema, Store } from "@senify/engine";
import { McpAuditRepository } from "../src/store-mcp-audit.ts";
import { createTestDatabase } from "./helpers.ts";

// ADR 0019: the MCP audit log lives in `McpAuditRepository`; `Store` only delegates.

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture() {
  const database = await createTestDatabase();
  await ensureSchema(database.db);
  cleanup.push(() => database.close());
  return { db: database.db, repo: new McpAuditRepository(database.db) };
}

const call = (tool = "list_pages") => ({
  tokenId: "tok-1" as string | null,
  client: "claude",
  tool,
  args: { siteId: "s1" } as Record<string, unknown>,
  result: "ok" as const,
  entity: "s1" as string | null,
  durationMs: 12,
});

describe("McpAuditRepository", () => {
  it("returns the appended entry with id and time, and lists it back unchanged", async () => {
    const { repo } = await fixture();
    const entry = await repo.appendMcpAudit(call());
    expect(entry).toMatchObject({ ...call(), id: expect.any(String), createdAt: expect.any(String) });
    expect(await repo.listMcpAudit()).toEqual([entry]);
  });

  it("keeps a call without a token or entity as null", async () => {
    const { repo } = await fixture();
    const entry = await repo.appendMcpAudit({ ...call(), tokenId: null, entity: null, result: "error" });
    expect((await repo.listMcpAudit())[0]).toEqual(entry);
    expect(entry).toMatchObject({ tokenId: null, entity: null, result: "error" });
  });

  it("lists newest first and clamps the limit to 1..500", async () => {
    const { db, repo } = await fixture();
    const first = await repo.appendMcpAudit(call("first"));
    const second = await repo.appendMcpAudit(call("second"));
    await db.query(`UPDATE mcp_audit_entries SET created_at = $2 WHERE id = $1`, [first.id, "2026-10-01T10:00:00.000Z"]);
    await db.query(`UPDATE mcp_audit_entries SET created_at = $2 WHERE id = $1`, [second.id, "2026-10-02T10:00:00.000Z"]);
    expect((await repo.listMcpAudit()).map((e) => e.tool)).toEqual(["second", "first"]);
    expect((await repo.listMcpAudit(0)).map((e) => e.tool)).toEqual(["second"]);
    expect((await repo.listMcpAudit(-5)).map((e) => e.tool)).toEqual(["second"]);
    for (let i = 0; i < 500; i += 1) await repo.appendMcpAudit(call(`bulk-${i}`));
    expect(await repo.listMcpAudit(10_000)).toHaveLength(500);
  });

  it("reads an unknown result value as ok and a non-text token as no token", async () => {
    const { db, repo } = await fixture();
    const entry = await repo.appendMcpAudit(call());
    await db.query(`UPDATE mcp_audit_entries SET result = 'weird', token_id = NULL WHERE id = $1`, [entry.id]);
    expect((await repo.listMcpAudit())[0]).toMatchObject({ result: "ok", tokenId: null });
  });

  it("is what Store delegates to: both see the same log", async () => {
    const { db, repo } = await fixture();
    const store = new Store(db);
    const viaStore = await store.appendMcpAudit(call("via_store"));
    const viaRepo = await repo.appendMcpAudit(call("via_repo"));
    const listed = await store.listMcpAudit();
    expect(listed).toEqual(await repo.listMcpAudit());
    expect(listed.map((e) => e.id).sort()).toEqual([viaStore.id, viaRepo.id].sort());
  });
});
