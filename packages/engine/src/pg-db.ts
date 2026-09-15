import { Pool, type PoolClient } from "pg";
import type { Db, DbClient } from "./db.ts";

export type PgDb = Db & {
  close(): Promise<void>;
};

function wrapClient(client: PoolClient): DbClient {
  return {
    async query(text, params) {
      const result = await client.query(
        text,
        params === undefined ? undefined : [...params],
      );
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

export function createPgDb(connectionString: string): PgDb {
  const pool = new Pool({ connectionString });
  return {
    async query(text, params) {
      const result = await pool.query(
        text,
        params === undefined ? undefined : [...params],
      );
      return { rows: result.rows, rowCount: result.rowCount };
    },
    async withTransaction(task) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await task(wrapClient(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
