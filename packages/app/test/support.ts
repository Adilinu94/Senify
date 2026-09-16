import { existsSync } from "node:fs";
import { createTestDb } from "@senify/core/testing";
import type { Db, DbResult, Row } from "@senify/engine";

// pg-mem double, same shape as the engine and MCP test helpers use.
export function memoryDb(): { db: Db; close(): Promise<void> } {
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

// Playwright is an optional dev dependency: browser tests skip cleanly when
// the package or its chromium build is missing (same contract as the
// reference capture test).
export const playwright = await import("playwright").catch(() => undefined);

export const browserAvailable = (() => {
  if (playwright === undefined) return false;
  try {
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();
