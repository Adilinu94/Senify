export type Row = Record<string, unknown>;

export type DbResult<R extends Row = Row> = {
  rows: R[];
  rowCount?: number | null;
};

export type DbClient = {
  query<R extends Row = Row>(
    text: string,
    params?: readonly unknown[],
  ): Promise<DbResult<R>>;
};

export type Db = DbClient & {
  withTransaction<T>(task: (client: DbClient) => Promise<T>): Promise<T>;
};

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS sites (
    id text PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    profile text NOT NULL DEFAULT 'standard',
    theme_id text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pages (
    id text PRIMARY KEY,
    site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    path text NOT NULL,
    title text NOT NULL,
    meta jsonb NOT NULL,
    draft jsonb NOT NULL,
    draft_version integer NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (site_id, path)
  )`,
  // Audit is append-only history and intentionally has no foreign keys:
  // entries survive page/site deletes so the activity log stays complete.
  // page_id is nullable: site-level operations (e.g. update_theme) have no page.
  `CREATE TABLE IF NOT EXISTS audit_entries (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    page_id text,
    batch_id text NOT NULL,
    op_index integer NOT NULL,
    mutation text NOT NULL,
    params jsonb NOT NULL,
    author jsonb NOT NULL,
    undo_patch jsonb NOT NULL,
    draft_version_after integer NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS themes (
    id text PRIMARY KEY,
    site_id text NOT NULL UNIQUE REFERENCES sites(id) ON DELETE CASCADE,
    name text NOT NULL,
    definition jsonb NOT NULL,
    version integer NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS audit_entries_page_idx
    ON audit_entries (page_id, created_at DESC, op_index DESC)`,
];

export async function ensureSchema(db: Db): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.query(statement);
  }
}
