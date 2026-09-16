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
  // Project trash: a separate table keeps the schema additive and lets
  // listSites simply exclude trashed sites.
  `CREATE TABLE IF NOT EXISTS site_trash (
    site_id text PRIMARY KEY,
    trashed_at timestamptz NOT NULL
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
  // Encoded image ladder (AVIF/WebP per width) and the blur hash placeholder,
  // kept additive next to the asset so the original row stays untouched.
  `CREATE TABLE IF NOT EXISTS asset_variants (
    id text PRIMARY KEY,
    asset_id text NOT NULL,
    width integer NOT NULL,
    format text NOT NULL,
    storage_ref text NOT NULL,
    byte_size integer NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS asset_variants_asset_idx
    ON asset_variants (asset_id, width ASC, format ASC)`,
  `CREATE TABLE IF NOT EXISTS asset_blurhash (
    asset_id text PRIMARY KEY,
    value text NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  // Content core: collections embed their field definitions (Payload/Instatic
  // pattern) so reading a schema is a single row. Removal is expressed by
  // deprecation, never by DELETE.
  `CREATE TABLE IF NOT EXISTS collections (
    id text PRIMARY KEY,
    site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name text NOT NULL,
    slug text NOT NULL,
    fields jsonb NOT NULL,
    title_field text NOT NULL,
    date_field text,
    url_pattern text,
    supports jsonb NOT NULL,
    list_columns jsonb NOT NULL,
    description text,
    deprecated_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (site_id, slug)
  )`,
  `CREATE INDEX IF NOT EXISTS collections_site_idx
    ON collections (site_id, created_at ASC, id ASC)`,
  // Entries denormalise slug + status next to the JSONB cells; search_text is
  // the lowercased haystack the weighted search narrows on (tsvector comes
  // later, once a real Postgres migration path exists).
  `CREATE TABLE IF NOT EXISTS entries (
    id text PRIMARY KEY,
    site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    collection_id text NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    slug text NOT NULL,
    status text NOT NULL,
    cells jsonb NOT NULL,
    active_version_id text,
    version integer NOT NULL,
    author jsonb NOT NULL,
    search_text text NOT NULL,
    published_at timestamptz,
    scheduled_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS entries_site_idx
    ON entries (site_id, updated_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS entries_collection_idx
    ON entries (collection_id, status, updated_at DESC, id DESC)`,
  // Publish snapshots are immutable and capped per entry (retention).
  `CREATE TABLE IF NOT EXISTS entry_versions (
    id text PRIMARY KEY,
    entry_id text NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    site_id text NOT NULL,
    version_number integer NOT NULL,
    cells jsonb NOT NULL,
    slug text NOT NULL,
    status text NOT NULL,
    author jsonb NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS entry_versions_entry_idx
    ON entry_versions (entry_id, version_number DESC, id DESC)`,
  // Slug history of a collection; the newest row per from_path wins.
  `CREATE TABLE IF NOT EXISTS entry_redirects (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    collection_id text NOT NULL,
    from_path text NOT NULL,
    to_path text NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS entry_redirects_site_idx
    ON entry_redirects (site_id, from_path, created_at DESC, id DESC)`,
  // Templates & Layouts (T10): a page is a template when a row exists. Additive
  // to `pages` (no ALTER); kind NULL holds a page that only picks a layout.
  `CREATE TABLE IF NOT EXISTS page_templates (
    page_id text PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    kind text,
    collection_ids jsonb NOT NULL,
    priority integer NOT NULL,
    layout_id text,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS page_templates_layout_idx
    ON page_templates (layout_id)`,
  // Forms & submissions (T11). The signing secret lives in its own single-row
  // table so baked tokens survive an engine restart; form_snapshots freezes a
  // form definition per bake and the token points at one snapshot.
  `CREATE TABLE IF NOT EXISTS form_settings (
    id text PRIMARY KEY,
    secret text NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS form_snapshots (
    id text PRIMARY KEY,
    form_id text NOT NULL,
    site_id text NOT NULL,
    page_id text NOT NULL,
    node_id text NOT NULL,
    page_path text NOT NULL,
    section_type text NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS form_snapshots_form_idx
    ON form_snapshots (form_id, created_at DESC, id DESC)`,
  // Notification outbox: the job row is also the dev transport (SMTP only
  // when configured). Retry/backoff keeps failures visible.
  `CREATE TABLE IF NOT EXISTS notification_outbox (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    form_id text,
    entry_id text,
    kind text NOT NULL,
    recipient text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    status text NOT NULL,
    attempts integer NOT NULL,
    next_attempt_at timestamptz NOT NULL,
    last_error text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    sent_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
    ON notification_outbox (status, next_attempt_at ASC, created_at ASC, id ASC)`,
  // Double-opt-in tokens: random, single-use, expiring. kind separates the
  // confirmation link from the unsubscribe link.
  `CREATE TABLE IF NOT EXISTS newsletter_tokens (
    token text PRIMARY KEY,
    site_id text NOT NULL,
    form_id text NOT NULL,
    entry_id text NOT NULL,
    email text NOT NULL,
    kind text NOT NULL,
    status text NOT NULL,
    expires_at timestamptz,
    created_at timestamptz NOT NULL,
    used_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS newsletter_tokens_entry_idx
    ON newsletter_tokens (entry_id, kind, created_at DESC, token DESC)`,
  // References (T14): the row carries governance/status/progress, the profile
  // lives in append-only revisions (JSONB) so editing never rewrites history.
  `CREATE TABLE IF NOT EXISTS design_references (
    id text PRIMARY KEY,
    name text NOT NULL,
    source_url text NOT NULL,
    method text NOT NULL,
    status text NOT NULL,
    stage text NOT NULL,
    progress integer NOT NULL,
    failure_reason text,
    families jsonb NOT NULL,
    vocabulary jsonb NOT NULL,
    style_brief text NOT NULL,
    snapshots jsonb NOT NULL,
    provenance jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS design_references_created_idx
    ON design_references (created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS reference_profiles (
    id text PRIMARY KEY,
    reference_id text NOT NULL,
    revision integer NOT NULL,
    profile jsonb NOT NULL,
    evidence jsonb NOT NULL,
    provenance jsonb NOT NULL,
    author jsonb NOT NULL,
    note text,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS reference_profiles_reference_idx
    ON reference_profiles (reference_id, revision DESC, id DESC)`,
  // Analysis job with progress + retry, modelled after the notification
  // outbox: due jobs are queued and past their next attempt time.
  `CREATE TABLE IF NOT EXISTS reference_jobs (
    id text PRIMARY KEY,
    reference_id text NOT NULL,
    status text NOT NULL,
    stage text NOT NULL,
    progress integer NOT NULL,
    attempts integer NOT NULL,
    max_attempts integer NOT NULL,
    next_attempt_at timestamptz NOT NULL,
    last_error text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    finished_at timestamptz,
    payload jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS reference_jobs_due_idx
    ON reference_jobs (status, next_attempt_at ASC, created_at ASC, id ASC)`,
  // Project assignment per scale: one row per (site, reference), scales names
  // the scales the reference contributes (default: all of them).
  `CREATE TABLE IF NOT EXISTS reference_assignments (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    reference_id text NOT NULL,
    scales jsonb NOT NULL,
    priority integer NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (site_id, reference_id)
  )`,
  `CREATE INDEX IF NOT EXISTS reference_assignments_reference_idx
    ON reference_assignments (reference_id, site_id ASC)`,
  // Collections of the reference library (T14, Taste Vault alignment): freely
  // created categories plus the seeded style families (`kind = 'style'`).
  // `external_id` is the id of the adopted style catalog, so the seed finds its
  // rows again; `recognize`/`examples`/`warning` carry the style guide extras
  // (recognition cues, canonical sites, warning of the family).
  `CREATE TABLE IF NOT EXISTS reference_collections (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    deploy_for text NOT NULL DEFAULT '',
    vocabulary jsonb NOT NULL,
    risk text NOT NULL DEFAULT '',
    accent text NOT NULL DEFAULT '',
    image_style text NOT NULL DEFAULT '',
    recognize jsonb NOT NULL,
    examples jsonb NOT NULL,
    warning text,
    kind text NOT NULL DEFAULT 'collection',
    external_id text,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS reference_collections_position_idx
    ON reference_collections (position ASC, name ASC)`,
  // The seed never overwrites: a style family exists at most once.
  `CREATE UNIQUE INDEX IF NOT EXISTS reference_collections_external_idx
    ON reference_collections (external_id)`,
  // Additive columns on the existing reference table. Only new, nullable
  // columns are added (ADD COLUMN IF NOT EXISTS never rewrites existing data),
  // so installations from earlier tickets keep working.
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS collection_id text`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS note text`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS image_recipe text`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS hero_usage text`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS family text`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS origin text`,
  `CREATE INDEX IF NOT EXISTS design_references_collection_idx
    ON design_references (collection_id)`,
  // Reference preferences (T14): House DNA and the project notes live in the
  // engine (not in the browser), so MCP tools build the same briefs. A single
  // row keeps the schema additive next to engine_settings.
  `CREATE TABLE IF NOT EXISTS reference_settings (
    id text PRIMARY KEY,
    dna jsonb NOT NULL,
    include_dna boolean NOT NULL DEFAULT false,
    overrides text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL
  )`,
  // Global program settings (T12): one row each for the SMTP transport and the
  // defaults. The SMTP password is stored encrypted (settings secret).
  `CREATE TABLE IF NOT EXISTS smtp_settings (
    id text PRIMARY KEY,
    host text NOT NULL DEFAULT '',
    port integer NOT NULL DEFAULT 587,
    tls text NOT NULL DEFAULT 'starttls',
    username text NOT NULL DEFAULT '',
    password_encrypted text,
    from_address text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS engine_settings (
    id text PRIMARY KEY,
    default_profile text NOT NULL DEFAULT 'standard',
    default_layout text NOT NULL DEFAULT 'Standard',
    autostart boolean NOT NULL DEFAULT false,
    backup_dir text,
    updated_at timestamptz NOT NULL
  )`,
  // Persisted secrets used for encryption at rest, mirroring form_settings.
  `CREATE TABLE IF NOT EXISTS engine_secrets (
    id text PRIMARY KEY,
    name text NOT NULL UNIQUE,
    secret text NOT NULL,
    created_at timestamptz NOT NULL
  )`,
];

export async function ensureSchema(db: Db): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.query(statement);
  }
}

// The tables the schema owns, derived from the CREATE statements so backups and
// migration-free reads never drift from the source of truth.
export function tableNames(): string[] {
  const names: string[] = [];
  for (const statement of SCHEMA_STATEMENTS) {
    const match = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)/.exec(statement);
    if (match?.[1] !== undefined) names.push(match[1]);
  }
  return names;
}
