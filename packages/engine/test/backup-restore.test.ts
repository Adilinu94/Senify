import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bootEngine,
  createTestPage,
  createTestSite,
  type BootEnv,
} from "./helpers.ts";

// Prüfstelle 1: playing a backup back (T12) against the real engine - tables,
// data directory, the safety copy taken right before the write and the refusal
// of incomplete folders.

type BackupView = {
  id: string;
  path: string;
  tables: Record<string, number>;
  fileCount: number;
};

type BackupListBody = {
  status: { count: number; targetDir: string };
  backups: BackupView[];
};

type RestoreBody = {
  id: string;
  restoredAt: string;
  tables: Record<string, number>;
  files: number;
  safetyBackup: BackupView;
};

type ErrorBody = {
  error: { category: string; message: string; field?: string };
};

let env: BootEnv;

beforeAll(async () => {
  env = await bootEngine();
});

afterAll(async () => {
  await env.close();
});

async function createBackup(): Promise<BackupView> {
  const run = await env.api.request<{ backup: BackupView }>({
    method: "POST",
    path: "/api/backups",
  });
  expect(run.status).toBe(201);
  return run.body.backup;
}

async function listBackups(): Promise<BackupListBody> {
  const list = await env.api.request<BackupListBody>({
    method: "GET",
    path: "/api/backups",
  });
  return list.body;
}

function restore(
  name: string,
  body?: unknown,
): Promise<{ status: number; body: Partial<RestoreBody> & ErrorBody }> {
  return env.api.request<Partial<RestoreBody> & ErrorBody>({
    method: "POST",
    path: `/api/backups/${name}/restore`,
    ...(body === undefined ? {} : { body }),
  });
}

async function siteNames(): Promise<string[]> {
  const list = await env.api.request<{ sites: { name: string }[] }>({
    method: "GET",
    path: "/api/sites",
  });
  return list.body.sites.map((site) => site.name);
}

async function pageTitles(siteId: string): Promise<string[]> {
  const pages = await env.api.request<{ pages: { title: string }[] }>({
    method: "GET",
    path: `/api/sites/${siteId}/pages`,
  });
  return pages.body.pages.map((page) => page.title);
}

// Row count of one table in a manifest or a restore answer (0 when absent).
function rows(tables: Record<string, number> | undefined, name: string): number {
  return tables?.[name] ?? 0;
}

// Content fingerprint of a folder: paths and SHA-256 of every file. Used to
// prove that a restore never writes into the backup it reads.
function fingerprint(dir: string): string[] {
  const entries: string[] = [];
  const walk = (from: string, prefix: string): void => {
    const children = readdirSync(from, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const child of children) {
      const path = join(from, child.name);
      const relative = prefix === "" ? child.name : `${prefix}/${child.name}`;
      if (child.isDirectory()) walk(path, relative);
      else {
        entries.push(
          `${relative}:${createHash("sha256").update(readFileSync(path)).digest("hex")}`,
        );
      }
    }
  };
  walk(dir, "");
  return entries;
}

describe("restore a backup", () => {
  it("writes tables and files back and leaves the backup untouched", async () => {
    const site = await createTestSite(env.api, "Vor der Sicherung");
    await createTestPage(env.api, site.id, { title: "Startseite" });
    writeFileSync(join(env.engine.dataDir, "vorher.txt"), "vor der Sicherung");

    const backup = await createBackup();
    const before = fingerprint(backup.path);

    // State the restore has to roll back.
    const late = await createTestSite(env.api, "Nach der Sicherung");
    await createTestPage(env.api, late.id, { title: "Spaeter" });
    writeFileSync(join(env.engine.dataDir, "nachher.txt"), "nach der Sicherung");

    // Without an explicit confirmation nothing happens.
    const refused = await restore(backup.id, {});
    expect(refused.status).toBe(400);
    expect(refused.body.error.field).toBe("confirm");
    expect(refused.body.error.message).toContain("confirm: true");
    expect(await siteNames()).toContain("Nach der Sicherung");

    const count = (await listBackups()).status.count;
    const restored = await restore(backup.id, { confirm: true });
    expect(restored.status).toBe(200);
    expect(restored.body.id).toBe(backup.id);
    expect(restored.body.restoredAt).toBeTruthy();
    expect(restored.body.tables?.sites).toBe(backup.tables.sites);
    expect(restored.body.tables?.pages).toBe(backup.tables.pages);
    expect(restored.body.files).toBe(backup.fileCount);

    // The safety copy holds the state the restore replaced.
    const safety = restored.body.safetyBackup;
    expect(safety?.id).not.toBe(backup.id);
    expect(rows(safety?.tables, "sites")).toBe(rows(backup.tables, "sites") + 1);
    expect(rows(safety?.tables, "pages")).toBe(rows(backup.tables, "pages") + 1);

    // The engine is back on the snapshot, and the token still works: it came
    // back with the dump.
    expect(await siteNames()).toEqual(["Vor der Sicherung"]);
    expect(await pageTitles(site.id)).toEqual(["Startseite"]);
    const gone = await env.api.request<{ sites: { id: string }[] }>({
      method: "GET",
      path: "/api/sites",
    });
    expect(gone.body.sites.some((entry) => entry.id === late.id)).toBe(false);

    // JSONB rows survive the round trip: the draft tree and the theme of the
    // snapshot are readable objects again, not quoted text.
    const pages = await env.api.request<{ pages: { id: string }[] }>({
      method: "GET",
      path: `/api/sites/${site.id}/pages`,
    });
    const page = await env.api.request<{
      meta: Record<string, unknown>;
      draft: { rootNodeId: string; nodes: Record<string, unknown> };
    }>({ method: "GET", path: `/api/pages/${pages.body.pages[0]?.id ?? ""}` });
    expect(typeof page.body.meta).toBe("object");
    expect(typeof page.body.draft.rootNodeId).toBe("string");
    expect(Object.keys(page.body.draft.nodes).length).toBeGreaterThan(0);
    const theme = await env.api.request<{
      name: string;
      theme: { name: string; tokens: Record<string, unknown> };
    }>({ method: "GET", path: `/api/sites/${site.id}/theme` });
    expect(theme.status).toBe(200);
    expect(typeof theme.body.theme).toBe("object");
    expect(Object.keys(theme.body.theme.tokens).length).toBeGreaterThan(0);

    // The data directory holds the files of the snapshot again.
    expect(existsSync(join(env.engine.dataDir, "vorher.txt"))).toBe(true);
    expect(readFileSync(join(env.engine.dataDir, "vorher.txt"), "utf8")).toBe(
      "vor der Sicherung",
    );
    expect(existsSync(join(env.engine.dataDir, "nachher.txt"))).toBe(false);

    // The source backup was only read, and the safety copy shows up in the list.
    expect(fingerprint(backup.path)).toEqual(before);
    const after = await listBackups();
    expect(after.backups.some((entry) => entry.id === safety?.id)).toBe(true);
    expect(after.status.count).toBe(count + 1);
  });

  it("refuses an incomplete backup and changes nothing", async () => {
    const backup = await createBackup();
    const targetDir = (await listBackups()).status.targetDir;

    const missingTable = join(targetDir, `${backup.id}-ohne-tabelle`);
    cpSync(backup.path, missingTable, { recursive: true });
    rmSync(join(missingTable, "tables", "pages.json"));

    const edited = join(targetDir, `${backup.id}-geaendert`);
    cpSync(backup.path, edited, { recursive: true });
    const sitesFile = join(edited, "tables", "sites.json");
    writeFileSync(sitesFile, `${readFileSync(sitesFile, "utf8")} \n`);

    const before = await siteNames();
    const count = (await listBackups()).status.count;

    const missing = await restore(`${backup.id}-ohne-tabelle`, { confirm: true });
    expect(missing.status).toBe(400);
    expect(missing.body.error.category).toBe("validation");
    expect(missing.body.error.message).toContain("unvollständig");
    expect(missing.body.error.message).toContain("pages");

    const changed = await restore(`${backup.id}-geaendert`, { confirm: true });
    expect(changed.status).toBe(400);
    expect(changed.body.error.message).toContain("Prüfsumme");

    // No safety copy was written, no row and no file was touched.
    expect(await siteNames()).toEqual(before);
    expect((await listBackups()).status.count).toBe(count);
  });

  it("knows no backup outside its folder", async () => {
    const unknown = await restore("gibt-es-nicht", { confirm: true });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.category).toBe("not_found");

    const escape = await restore("%2E%2E%2F%2E%2E%2Fetc", { confirm: true });
    expect(escape.status).toBe(400);
    expect(escape.body.error.message).toContain("Ungültiger Name");
  });
});
