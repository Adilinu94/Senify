import { newDb, type IMemoryDb } from "pg-mem";

export function createTestDb(): IMemoryDb {
  return newDb({ autoCreateForeignKeyIndices: true });
}

// pg-mem rejects a repeated `CREATE TABLE IF NOT EXISTS` (its AST coverage
// check); Postgres treats it as a no-op. Tests that boot the engine twice on
// the same in-memory database (self-healing paths) use this variant.
export function createReentrantTestDb(): IMemoryDb {
  return newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
}
