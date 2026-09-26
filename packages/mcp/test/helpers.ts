import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiHarness, createTestDb, type ApiHarness } from "@senify/core/testing";
import {
  createEngine,
  type Db,
  type DbResult,
  type Engine,
  type ReferenceDiffDeps,
  type Row,
} from "@senify/engine";
import { createRegistry } from "@senify/registry";

export type McpTestEnv = {
  origin: string;
  token: string;
  operatorToken: string;
  api: ApiHarness;
  humanApi: ApiHarness;
  // The running engine: suites that need the worker (image jobs) run their own
  // claim-and-run cycle against this instance.
  engine: Engine;
  close(): Promise<void>;
};

// pg-mem double for the engine: the same shape engine/test/helpers.ts uses.
function memoryDb(): { db: Db; close(): Promise<void> } {
  const memory = createTestDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  const db: Db = {
    query: async <R extends Row>(
      text: string,
      params?: readonly unknown[],
    ): Promise<DbResult<R>> => {
      const result = await pool.query(text, params as unknown[] | undefined);
      return { rows: result.rows as R[] };
    },
    async withTransaction(task) {
      return task(db);
    },
  };
  return { db, close: () => pool.end() };
}

export async function bootMcpEnv(options: { referenceDiffs?: ReferenceDiffDeps } = {}): Promise<McpTestEnv> {
  const database = memoryDb();
  // Temp data dir: releases, previews and uploaded assets stay out of the
  // user's home directory.
  const dataDir = mkdtempSync(join(tmpdir(), "senify-mcp-"));
  const engine = await createEngine({
    db: database.db,
    registry: createRegistry(),
    dataDir,
    // Suites fire many calls per token; rate limits are covered by
    // engine/test/auth.test.ts with explicit tight limits.
    rateLimits: { perMinute: 10_000, burst: 10_000, destructivePerMinute: 10_000 },
    ...(options.referenceDiffs === undefined
      ? {}
      : { referenceDiffs: options.referenceDiffs }),
  });
  const server = await engine.listen({ port: 0 });
  const token = (
    await engine.store.createToken({
      name: "mcp-tests",
      kind: "agent",
      scopes: ["read", "write", "publish"],
      expiresAt: null,
    })
  ).secret;
  const api = createApiHarness(server.origin, { token });
  const humanToken = (
    await engine.store.createToken({
      name: "mcp-human",
      kind: "human",
      scopes: ["read", "write", "publish"],
      expiresAt: null,
    })
  ).secret;
  return {
    origin: server.origin,
    token,
    operatorToken: humanToken,
    api,
    humanApi: createApiHarness(server.origin, { token: humanToken }),
    engine,
    async close() {
      await server.close();
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export async function createToken(
  env: McpTestEnv,
  name: string,
  scopes: string[],
): Promise<string> {
  const created = await env.humanApi.request<{ secret: string }>({
    method: "POST",
    path: "/api/tokens",
    body: { name, scopes },
  });
  if (created.status !== 201) {
    throw new Error(`Token creation failed: ${JSON.stringify(created.body)}`);
  }
  return created.body.secret;
}

export async function createSite(env: McpTestEnv, name: string): Promise<string> {
  const created = await env.api.request<{ id: string }>({
    method: "POST",
    path: "/api/sites",
    body: { name },
  });
  if (created.status !== 201) {
    throw new Error(`Site creation failed: ${JSON.stringify(created.body)}`);
  }
  return created.body.id;
}
