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
  // API tokens: the secret is shown once and stored as a SHA-256 hash only.
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id text PRIMARY KEY,
    name text NOT NULL,
    scopes jsonb NOT NULL,
    token_hash text NOT NULL UNIQUE,
    token_prefix text NOT NULL,
    created_at timestamptz NOT NULL,
    expires_at timestamptz,
    last_used_at timestamptz,
    revoked_at timestamptz
  )`,
  // MCP call audit is append-only and keeps no foreign keys, so the log
  // survives token revocation.
  `CREATE TABLE IF NOT EXISTS mcp_audit_entries (
    id text PRIMARY KEY,
    token_id text,
    client text NOT NULL,
    tool text NOT NULL,
    args jsonb NOT NULL,
    result text NOT NULL,
    entity text,
    duration_ms integer NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS mcp_audit_entries_created_idx
    ON mcp_audit_entries (created_at DESC, id DESC)`,
  // Revisions are immutable page snapshots; releases bundle all page
  // revisions plus a theme snapshot (append-only, rollback creates new ones).
  `CREATE TABLE IF NOT EXISTS page_revisions (
    id text PRIMARY KEY,
    page_id text NOT NULL,
    site_id text NOT NULL,
    tree jsonb NOT NULL,
    title text NOT NULL,
    path text NOT NULL,
    author jsonb NOT NULL,
    note text,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS page_revisions_page_idx
    ON page_revisions (page_id, created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS releases (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    page_revisions jsonb NOT NULL,
    theme_snapshot jsonb NOT NULL,
    build_ref text,
    author jsonb NOT NULL,
    note text,
    basis_release_id text,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS releases_site_idx
    ON releases (site_id, created_at DESC, id DESC)`,
  // The active release lives in its own table so the schema stays additive
  // without ALTER statements (there is no migration tooling in v1).
  `CREATE TABLE IF NOT EXISTS active_releases (
    site_id text PRIMARY KEY,
    release_id text NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS previews (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    build_ref text NOT NULL,
    token text NOT NULL,
    status text NOT NULL,
    created_by jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS previews_site_idx
    ON previews (site_id, created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS review_items (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    preview_id text,
    base_state jsonb NOT NULL,
    pages jsonb NOT NULL,
    author jsonb NOT NULL,
    status text NOT NULL,
    structure_diff jsonb NOT NULL,
    guardrails jsonb NOT NULL,
    thread jsonb NOT NULL,
    release_id text,
    created_at timestamptz NOT NULL,
    resolved_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS review_items_site_idx
    ON review_items (site_id, created_at DESC, id DESC)`,
  // Media library. Files live under <dataDir>/assets/<siteId>/<assetId>/, the
  // row keeps the relative storage_ref; replaced files stay in a history/
  // subfolder so restore never needs a second copy of the library.
  `CREATE TABLE IF NOT EXISTS assets (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    filename text NOT NULL,
    mime text NOT NULL,
    kind text NOT NULL,
    byte_size integer NOT NULL,
    width integer,
    height integer,
    hash text NOT NULL,
    alt_text text,
    decorative boolean NOT NULL,
    folder_id text,
    tags jsonb NOT NULL,
    storage_ref text NOT NULL,
    status text NOT NULL,
    replaced_at timestamptz,
    trashed_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS assets_site_idx
    ON assets (site_id, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS assets_site_hash_idx
    ON assets (site_id, hash)`,
  `CREATE TABLE IF NOT EXISTS asset_folders (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    name text NOT NULL,
    parent_id text,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS asset_folders_site_idx
    ON asset_folders (site_id, created_at ASC, id ASC)`,
  `CREATE TABLE IF NOT EXISTS asset_history (
    id text PRIMARY KEY,
    asset_id text NOT NULL,
    storage_ref text NOT NULL,
    mime text NOT NULL,
    byte_size integer NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS asset_history_asset_idx
    ON asset_history (asset_id, created_at DESC, id DESC)`,
];

export async function ensureSchema(db: Db): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.query(statement);
  }
}
