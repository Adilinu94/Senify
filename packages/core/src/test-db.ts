import { newDb, type IMemoryDb } from "pg-mem";

export function createTestDb(): IMemoryDb {
  return newDb({ autoCreateForeignKeyIndices: true });
}
