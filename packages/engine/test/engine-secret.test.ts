import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureSchema, Store } from "@senify/engine";
import { createTestDatabase } from "./helpers.ts";

// The key that encrypts the stored credentials (SMTP, deploy tokens) lives in a
// file next to the data directory, not in the database the backup exports.

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function fixture(): Promise<{
  db: Awaited<ReturnType<typeof createTestDatabase>>["db"];
  file: string;
}> {
  const database = await createTestDatabase();
  // `createEngine` normally migrates; a bare Store needs the tables itself.
  await ensureSchema(database.db);
  const dir = mkdtempSync(join(tmpdir(), "senify-secret-"));
  cleanup.push(async () => {
    await database.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { db: database.db, file: join(dir, "engine-secret.key") };
}

const rowCount = async (db: Awaited<ReturnType<typeof fixture>>["db"]): Promise<number> =>
  (await db.query(`SELECT 1 FROM engine_secrets`)).rows.length;

describe("engine secret in a key file", () => {
  it("creates the key in the file, keeps it stable and never writes it to the database", async () => {
    const { db, file } = await fixture();
    const store = new Store(db, { secretFile: file });
    const secret = await store.getOrCreateEngineSecret();
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(readFileSync(file, "utf8").trim()).toBe(secret);
    expect(await rowCount(db)).toBe(0);
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);

    // A second Store (a restart) and a concurrent burst all see the same key.
    const again = await new Store(db, { secretFile: file }).getOrCreateEngineSecret();
    expect(again).toBe(secret);
    const burst = await Promise.all(
      Array.from({ length: 6 }, () => new Store(db, { secretFile: file }).getOrCreateEngineSecret()),
    );
    expect(new Set(burst)).toEqual(new Set([secret]));
  });

  it("moves a key that an older install kept in the database, without changing it", async () => {
    const { db, file } = await fixture();
    const legacy = await new Store(db).getOrCreateEngineSecret();
    expect(await rowCount(db)).toBe(1);

    const migrated = await new Store(db, { secretFile: file }).getOrCreateEngineSecret();
    expect(migrated).toBe(legacy);
    expect(readFileSync(file, "utf8").trim()).toBe(legacy);
    expect(await rowCount(db)).toBe(0);
  });

  it("keeps a database key that differs from the file, e.g. after restoring an old backup", async () => {
    const { db, file } = await fixture();
    const filed = await new Store(db, { secretFile: file }).getOrCreateEngineSecret();
    // An older backup brings back a row with another machine's key.
    const foreign = "f".repeat(43);
    await db.query(
      `INSERT INTO engine_secrets (id, name, secret, created_at) VALUES ('x', 'settings', $1, $2)`,
      [foreign, new Date().toISOString()],
    );
    expect(await new Store(db, { secretFile: file }).getOrCreateEngineSecret()).toBe(filed);
    // Not deleted: it is the only copy of the key that backup's ciphertext needs.
    expect(await rowCount(db)).toBe(1);
  });

  it("keeps the database row when the key file cannot be written", async () => {
    const { db, file } = await fixture();
    const legacy = await new Store(db).getOrCreateEngineSecret();
    // The "data directory" is a regular file, so neither mkdir nor the write can succeed.
    const blocker = join(dirname(file), "keine-ordner.txt");
    writeFileSync(blocker, "x");
    const unwritable = join(blocker, "engine-secret.key");
    await expect(
      new Store(db, { secretFile: unwritable }).getOrCreateEngineSecret(),
    ).rejects.toThrow();
    expect(await rowCount(db)).toBe(1);
    expect(await new Store(db).getOrCreateEngineSecret()).toBe(legacy);
    expect(existsSync(unwritable)).toBe(false);
  });

  it("refuses a damaged key file instead of silently issuing a new key", async () => {
    const { db, file } = await fixture();
    writeFileSync(file, "kaputt");
    await expect(
      new Store(db, { secretFile: file }).getOrCreateEngineSecret(),
    ).rejects.toMatchObject({ category: "conflict", message: expect.stringContaining("Schlüsseldatei") });
    expect(readFileSync(file, "utf8")).toBe("kaputt");
    expect(await rowCount(db)).toBe(0);
  });
});
