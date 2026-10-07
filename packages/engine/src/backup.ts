import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { SenifyError } from "@senify/core";
import { SCHEMA_STATEMENTS, tableNames, type Row } from "./db.ts";
import { ENGINE_SECRET_FILE } from "./secrets.ts";
import type { Store } from "./store.ts";

// Backups (artifacts/27 §5): one timestamped folder per run with a manifest
// (version, time, row counts per table, file count/size, checksums), a JSON
// export of every table and a copy of the data directory. `restoreBackup`
// plays such a folder back into the live engine: it writes the tables and the
// data directory, refuses incomplete folders and copies the state it replaces
// into a fresh backup first.

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

export type RestoreResult = {
  id: string;
  restoredAt: string;
  // Rows written back per table (dependency order, parents first).
  tables: Record<string, number>;
  files: number;
  // Backup of the state the restore replaced, taken right before the write.
  safetyBackup: BackupSummary;
};

const MANIFEST_FILE = "manifest.json";

// Key material stays out of the backup (ADR-0017): a backup folder is meant to
// travel (external drive, synced folder), and a key next to the ciphertext it
// protects makes that ciphertext plaintext. `engine_secrets` is the legacy home
// of the encryption key; the two files sit at the top of the data directory.
// A restore on another machine therefore starts with a new key, and stored
// passwords must be entered again.
const EXCLUDED_TABLES = new Set(["engine_secrets"]);
const EXCLUDED_ROOT_FILES = new Set([ENGINE_SECRET_FILE, "program-token.json"]);

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
  const sourceResolved = resolve(source);
  const stats = { count: 0, bytes: 0 };
  const walk = (from: string, to: string): void => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const childFrom = join(from, entry.name);
      const resolved = resolve(childFrom);
      if (resolved === skipResolved || resolved.startsWith(skipResolved + sep)) {
        continue;
      }
      if (resolve(from) === sourceResolved && EXCLUDED_ROOT_FILES.has(entry.name)) {
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
    if (EXCLUDED_TABLES.has(name)) continue;
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

// ------------------------------------------------------------- restore (T12)

function incomplete(name: string, detail: string): SenifyError {
  return new SenifyError(
    "validation",
    `Sicherung "${name}" ist unvollständig: ${detail}`,
    {
      field: "backup",
      suggestion:
        "Manifest und Dateien müssen zueinander passen; die Sicherung sonst neu erzeugen.",
    },
  );
}

// The folder name comes out of the URL: only a plain name is accepted, so a
// path separator or ".." can never leave the backup target.
function assertBackupName(name: string): string {
  if (
    name.trim() === "" ||
    name !== name.trim() ||
    /[\\/]/.test(name) ||
    name === "." ||
    name === ".."
  ) {
    throw new SenifyError(
      "validation",
      `Ungültiger Name einer Sicherung: "${name}"`,
      {
        field: "name",
        suggestion: "Einen Namen aus GET /api/backups verwenden.",
      },
    );
  }
  return name;
}

function readRestoreManifest(dir: string, name: string): BackupManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(dir, MANIFEST_FILE), "utf8"));
  } catch (error) {
    throw incomplete(
      name,
      `Manifest nicht lesbar (${error instanceof Error ? error.message : "unbekannter Fehler"})`,
    );
  }
  const manifest = parsed as BackupManifest;
  if (manifest.version !== BACKUP_VERSION) {
    throw incomplete(
      name,
      `Version "${String(manifest.version)}" statt "${BACKUP_VERSION}"`,
    );
  }
  if (typeof manifest.tables !== "object" || manifest.tables === null) {
    throw incomplete(name, "Zeilenzahlen je Tabelle fehlen im Manifest");
  }
  if (typeof manifest.checksums !== "object" || manifest.checksums === null) {
    throw incomplete(name, "Prüfsummen fehlen im Manifest");
  }
  return manifest;
}

// Tables in dependency order: a table a foreign key points at comes first, so
// clearing runs in the opposite order and refilling never breaks a key.
function restoreOrder(names: readonly string[]): string[] {
  const parents = new Map<string, string[]>();
  for (const statement of SCHEMA_STATEMENTS) {
    const table = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)/.exec(statement)?.[1];
    if (table === undefined) continue;
    const referenced: string[] = [];
    for (const match of statement.matchAll(/REFERENCES\s+([A-Za-z0-9_]+)/g)) {
      const parent = match[1];
      if (parent !== undefined && parent !== table) referenced.push(parent);
    }
    parents.set(table, referenced);
  }
  const ordered: string[] = [];
  const open = new Set<string>();
  const visit = (name: string): void => {
    if (ordered.includes(name) || open.has(name)) return;
    open.add(name);
    for (const parent of parents.get(name) ?? []) {
      if (names.includes(parent)) visit(parent);
    }
    open.delete(name);
    ordered.push(name);
  };
  for (const name of names) visit(name);
  return ordered;
}

// Reads and checks every table file before the first write: a mangled or
// half-copied folder must leave the engine untouched.
function readRestoreTables(
  dir: string,
  name: string,
  manifest: BackupManifest,
): Record<string, Row[]> {
  const known = new Set(tableNames());
  const tables: Record<string, Row[]> = {};
  const tableList = Object.keys(manifest.tables);
  if (tableList.length === 0) throw incomplete(name, "keine Tabelle im Manifest");
  for (const table of tableList) {
    if (!known.has(table)) throw incomplete(name, `unbekannte Tabelle "${table}"`);
    const relative = `tables/${table}.json`;
    const file = join(dir, relative);
    if (!existsSync(file)) throw incomplete(name, `Tabelle "${table}" fehlt`);
    const json = readFileSync(file, "utf8");
    const checksum = manifest.checksums[relative];
    if (checksum === undefined) throw incomplete(name, `Prüfsumme für "${table}" fehlt`);
    if (sha256(json) !== checksum) {
      throw new SenifyError(
        "validation",
        `Prüfsumme der Tabelle "${table}" stimmt nicht`,
        {
          field: "backup",
          suggestion:
            "Die Datei wurde nach dem Sichern verändert; die Sicherung neu erzeugen.",
        },
      );
    }
    let rows: unknown;
    try {
      rows = JSON.parse(json);
    } catch {
      throw incomplete(name, `Tabelle "${table}" ist kein gültiges JSON`);
    }
    if (!Array.isArray(rows)) {
      throw incomplete(name, `Tabelle "${table}" enthält keine Zeilenliste`);
    }
    if (rows.length !== manifest.tables[table]) {
      throw incomplete(
        name,
        `Tabelle "${table}" hat ${rows.length} statt ${manifest.tables[table]} Zeilen`,
      );
    }
    tables[table] = rows as Row[];
  }
  return tables;
}

function readRestoreFiles(
  dir: string,
  name: string,
  manifest: BackupManifest,
): number {
  const filesDir = join(dir, "files");
  if (!existsSync(filesDir)) {
    throw incomplete(name, "Kopie des Datenverzeichnisses fehlt");
  }
  const expected = manifest.files?.count;
  if (expected === undefined) throw incomplete(name, "Dateizahl fehlt im Manifest");
  const actual = directoryStats(filesDir).count;
  if (actual !== expected) {
    throw incomplete(
      name,
      `${actual} statt ${expected} Dateien im Datenverzeichnis`,
    );
  }
  return actual;
}

// Writes the snapshot of the data directory back: everything below the data
// directory goes first, except the backup target itself (the folder that holds
// the running backup must survive), then the snapshot is copied in.
function restoreDataDir(
  source: string,
  destination: string,
  skip: string,
): void {
  const skipResolved = resolve(skip);
  const isSkipped = (path: string): boolean => {
    const resolved = resolve(path);
    return resolved === skipResolved || resolved.startsWith(skipResolved + sep);
  };
  if (existsSync(destination)) {
    for (const entry of readdirSync(destination, { withFileTypes: true })) {
      const child = join(destination, entry.name);
      if (isSkipped(child)) continue;
      rmSync(child, { recursive: true, force: true });
    }
  }
  const walk = (from: string, to: string): void => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const childFrom = join(from, entry.name);
      const childTo = join(to, entry.name);
      if (entry.isDirectory()) walk(childFrom, childTo);
      else if (entry.isFile()) copyFileSync(childFrom, childTo);
    }
  };
  if (existsSync(source)) walk(source, destination);
}

// Plays one backup folder back into the live engine. The folder itself is only
// read: the rows are validated against manifest and checksums first, the
// current state is copied into a fresh backup, then the tables are replaced in
// one transaction and the data directory is written back. Tables the folder
// does not carry (added after it was taken) stay as they are.
export async function restoreBackup(input: {
  store: Store;
  dataDir: string;
  name: string;
  targetDir?: string;
  now?: number;
}): Promise<RestoreResult> {
  const name = assertBackupName(input.name);
  const targetDir =
    input.targetDir ?? (await resolveBackupDir(input.store, input.dataDir));
  const dir = join(targetDir, name);
  if (!existsSync(join(dir, MANIFEST_FILE))) {
    throw new SenifyError("not_found", `Sicherung "${name}" existiert nicht`, {
      field: "name",
      suggestion: "GET /api/backups listet die vorhandenen Sicherungen.",
    });
  }
  const manifest = readRestoreManifest(dir, name);
  const tables = readRestoreTables(dir, name, manifest);
  const files = readRestoreFiles(dir, name, manifest);

  // The safety copy must never land in the folder it is meant to protect: two
  // backups created in the same millisecond would share a name.
  let safetyNow = input.now ?? Date.now();
  while (existsSync(join(targetDir, stamp(safetyNow)))) safetyNow += 1;
  const safety = await createBackup({
    store: input.store,
    dataDir: input.dataDir,
    targetDir,
    now: safetyNow,
  });

  const counts = await input.store.replaceTables({
    order: restoreOrder(Object.keys(tables)),
    rows: tables,
  });
  restoreDataDir(join(dir, "files"), input.dataDir, targetDir);
  return {
    id: name,
    restoredAt: new Date(input.now ?? Date.now()).toISOString(),
    tables: counts,
    // The snapshot was checked against the manifest, so this is the number of
    // files that went back into the data directory.
    files,
    safetyBackup: safety.summary,
  };
}
