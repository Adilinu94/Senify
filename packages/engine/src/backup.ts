import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { tableNames } from "./db.ts";
import type { Store } from "./store.ts";

// Backups (artifacts/27 §5): one timestamped folder per run with a manifest
// (version, time, row counts per table, file count/size, checksums), a JSON
// export of every table and a copy of the data directory. Restore stays a
// manual, documented step — this module never writes back into a live engine.

export const BACKUP_VERSION = "1";

export type BackupManifest = {
  version: string;
  createdAt: string;
  tables: Record<string, number>;
  files: { count: number; bytes: number };
  checksums: Record<string, string>;
};

export type BackupSummary = {
  id: string;
  path: string;
  createdAt: string;
  bytes: number;
  tables: Record<string, number>;
  fileCount: number;
};

export type BackupRun = {
  dir: string;
  summary: BackupSummary;
  manifest: BackupManifest;
};

export type BackupStatus = {
  targetDir: string;
  count: number;
  lastBackup: BackupSummary | null;
};

const MANIFEST_FILE = "manifest.json";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function stamp(now: number): string {
  return new Date(now).toISOString().replace(/[:.]/g, "-");
}

function directoryStats(dir: string): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) {
        count += 1;
        bytes += statSync(child).size;
      }
    }
  };
  if (existsSync(dir)) visit(dir);
  return { count, bytes };
}

// Copies the data directory but never descends into the backup target itself,
// so a target below the data directory cannot recurse into a running backup.
// Hand-rolled (not cpSync) because the destination may live inside the source.
function copyDataDir(
  source: string,
  destination: string,
  skip: string,
): { count: number; bytes: number } {
  const skipResolved = resolve(skip);
  const stats = { count: 0, bytes: 0 };
  const walk = (from: string, to: string): void => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const childFrom = join(from, entry.name);
      const resolved = resolve(childFrom);
      if (resolved === skipResolved || resolved.startsWith(skipResolved + sep)) {
        continue;
      }
      const childTo = join(to, entry.name);
      if (entry.isDirectory()) {
        walk(childFrom, childTo);
      } else if (entry.isFile()) {
        copyFileSync(childFrom, childTo);
        stats.count += 1;
        stats.bytes += statSync(childTo).size;
      }
    }
  };
  if (existsSync(source)) walk(source, destination);
  else mkdirSync(destination, { recursive: true });
  return stats;
}

export async function resolveBackupDir(
  store: Store,
  dataDir: string,
): Promise<string> {
  const settings = await store.getEngineSettings();
  const configured = settings.backupDir?.trim();
  return configured !== undefined && configured !== ""
    ? configured
    : join(dataDir, "backups");
}

export async function createBackup(input: {
  store: Store;
  dataDir: string;
  targetDir?: string;
  now?: number;
}): Promise<BackupRun> {
  const now = input.now ?? Date.now();
  const targetDir =
    input.targetDir ?? (await resolveBackupDir(input.store, input.dataDir));
  const id = stamp(now);
  const dir = join(targetDir, id);
  mkdirSync(join(dir, "tables"), { recursive: true });

  const tables: Record<string, number> = {};
  const checksums: Record<string, string> = {};
  for (const name of tableNames()) {
    const rows = await input.store.dumpTable(name);
    const json = `${JSON.stringify(rows, null, 2)}\n`;
    const relative = `tables/${name}.json`;
    writeFileSync(join(dir, relative), json);
    tables[name] = rows.length;
    checksums[relative] = sha256(json);
  }

  const files = copyDataDir(input.dataDir, join(dir, "files"), targetDir);
  const manifest: BackupManifest = {
    version: BACKUP_VERSION,
    createdAt: new Date(now).toISOString(),
    tables,
    files,
    checksums,
  };
  writeFileSync(join(dir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

  const summary: BackupSummary = {
    id,
    path: dir,
    createdAt: manifest.createdAt,
    bytes: directoryStats(dir).bytes,
    tables,
    fileCount: files.count,
  };
  return { dir, summary, manifest };
}

export async function listBackups(targetDir: string): Promise<BackupSummary[]> {
  if (!existsSync(targetDir)) return [];
  const summaries: BackupSummary[] = [];
  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runDir = join(targetDir, entry.name);
    const manifestPath = join(runDir, MANIFEST_FILE);
    if (!existsSync(manifestPath)) continue;
    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as BackupManifest;
    } catch {
      continue;
    }
    summaries.push({
      id: entry.name,
      path: runDir,
      createdAt: manifest.createdAt,
      bytes: directoryStats(runDir).bytes,
      tables: manifest.tables,
      fileCount: manifest.files?.count ?? 0,
    });
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function backupStatus(input: {
  store: Store;
  dataDir: string;
}): Promise<BackupStatus> {
  const targetDir = await resolveBackupDir(input.store, input.dataDir);
  const backups = await listBackups(targetDir);
  return {
    targetDir,
    count: backups.length,
    lastBackup: backups[0] ?? null,
  };
}
