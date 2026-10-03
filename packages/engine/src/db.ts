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
  // Deployments (E14): every deploy of an active release keeps its outcome, so
  // the operator can see where a site was delivered and when. The first
  // provider copies into a static target directory.
  `CREATE TABLE IF NOT EXISTS deployments (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    release_id text NOT NULL,
    provider text NOT NULL DEFAULT 'static',
    status text NOT NULL DEFAULT 'running',
    target text NOT NULL,
    file_count integer NOT NULL DEFAULT 0,
    byte_size bigint NOT NULL DEFAULT 0,
    error text,
    author jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    finished_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS deployments_site_idx
    ON deployments (site_id, created_at DESC, id DESC)`,
  // Deploy settings per site (E14): the hosted provider target. The token is
  // encrypted at rest (settings secret), like the SMTP password.
  `CREATE TABLE IF NOT EXISTS deploy_settings (
    site_id text PRIMARY KEY,
    provider text NOT NULL DEFAULT 'static',
    netlify_site_id text,
    netlify_token_encrypted text,
    vercel_project_id text,
    vercel_token_encrypted text,
    updated_at text NOT NULL
  )`,
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
  // Imported foreign code (ADR-0010): a *payload* is a self-contained ES module
  // plus its provenance and licence, stored next to the NodeTree — never in it.
  // The bundle is the row's largest column; reads that only need metadata use
  // CODE_PAYLOAD_COLUMNS (see store.ts).
  `CREATE TABLE IF NOT EXISTS site_code_payloads (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    bundle text NOT NULL,
    bytes integer NOT NULL,
    integrity text NOT NULL,
    version integer NOT NULL,
    provenance jsonb NOT NULL,
    license jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS site_code_payloads_site_idx
    ON site_code_payloads (site_id, created_at DESC, id DESC)`,
  // Redesign proposals (ADR-0012): the offered direction cards, the plan they
  // were derived from, the human decision and the apply result in one row.
  // Cards and basis never change; `source_page_id` is the only redundant
  // scalar (the inbox lookup) and there is no foreign key, so a decision stays
  // readable after the source page is deleted.
  // `expires_at` is the deadline of the human's decision (Fahrplan P2-3, R2).
  // The sweep moves a `proposed` row past it to `expired`; NULL means "no
  // deadline was ever given", which is how a row from before the column reads.
  // Additive like every other column here: v1 has no migration tooling, so
  // ensureSchema stays the single place that touches the shape. The comments
  // live outside the SQL on purpose - the schema statements are sent as-is.
  `CREATE TABLE IF NOT EXISTS redesign_proposals (
    id text PRIMARY KEY,
    source_page_id text NOT NULL,
    status text NOT NULL,
    cards jsonb NOT NULL,
    basis jsonb NOT NULL,
    decision jsonb,
    apply_result jsonb,
    created_at timestamptz NOT NULL,
    expires_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS redesign_proposals_source_idx
    ON redesign_proposals (source_page_id, status, created_at DESC, id DESC)`,
  // The sweep's index: it looks for exactly the undecided rows past their
  // deadline, so it must not scan the finished history. Deliberately NOT a
  // partial index (`WHERE status = 'proposed'`): pg-mem silently mis-selects
  // rows through a partial index in an UPDATE, and the sweep then finds
  // nothing. A full index on the two columns it filters is cheap and correct on
  // both engines.
  `CREATE INDEX IF NOT EXISTS redesign_proposals_expiry_idx
    ON redesign_proposals (status, expires_at)`,
  // Design records (Fahrplan P2-4, R4). The report was computed at publish and
  // at review and then thrown away, so the statement "this release was green"
  // could not be reproduced: a later change of the score rewrote the history.
  // A record freezes the report as an immutable object next to the thing it
  // describes. `draft_version` pins the tree it was measured on, so a record
  // can be recognised as stale instead of being silently trusted.
  `CREATE TABLE IF NOT EXISTS design_records (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    -- 'publish' | 'review': the two moments that measure. Named, not free
    -- text, because a record nobody can classify is a record nobody reads.
    stage text NOT NULL,
    draft_version integer NOT NULL,
    theme_version integer NOT NULL,
    report jsonb NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS design_records_site_idx
    ON design_records (site_id, stage, created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS library_components (
    id text PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    kind text NOT NULL,
    definition jsonb NOT NULL,
    fingerprint text NOT NULL UNIQUE,
    tags jsonb NOT NULL,
    provenance jsonb NOT NULL,
    license jsonb NOT NULL,
    notes text NOT NULL DEFAULT '',
    version integer NOT NULL DEFAULT 1,
    deprecated_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS library_components_updated_idx
    ON library_components (updated_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS site_library_installs (
    id text PRIMARY KEY,
    site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    library_component_id text NOT NULL REFERENCES library_components(id) ON DELETE CASCADE,
    installed_version integer NOT NULL,
    mode text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (site_id, library_component_id)
  )`,
  `CREATE INDEX IF NOT EXISTS site_library_installs_site_idx
    ON site_library_installs (site_id, updated_at DESC, id DESC)`,
  // Framer import jobs (plan S3.2), modelled after reference_jobs: due jobs
  // are queued and past their next attempt time; `result` carries the import
  // report so a read-only client can poll a long run without re-running it.
  `CREATE TABLE IF NOT EXISTS import_jobs (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    source_kind text NOT NULL,
    source_url text,
    page_path text NOT NULL,
    dry_run boolean NOT NULL,
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
    payload jsonb,
    result jsonb
  )`,
  `CREATE INDEX IF NOT EXISTS import_jobs_due_idx
    ON import_jobs (status, next_attempt_at ASC, created_at ASC, id ASC)`,
  `CREATE INDEX IF NOT EXISTS import_jobs_site_idx
    ON import_jobs (site_id, created_at DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS import_receipts (
    id text PRIMARY KEY,
    site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    job_id text NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    content_key text NOT NULL,
    request_fingerprint text NOT NULL,
    page_id text NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    draft_version integer NOT NULL,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    UNIQUE (site_id, content_key, request_fingerprint),
    UNIQUE (job_id)
  )`,
  `CREATE INDEX IF NOT EXISTS import_receipts_content_idx
    ON import_receipts (site_id, content_key, created_at DESC)`,
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
  // Re-bake outbox (E12, slice 1): content changes enqueue a durable job, the
  // worker claims it with a lease (crash recovery), retries with backoff and
  // keeps the error as the end state. `paths` is the dependency index result.
  `CREATE TABLE IF NOT EXISTS bake_jobs (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    reason text NOT NULL,
    paths jsonb NOT NULL,
    status text NOT NULL,
    attempts integer NOT NULL,
    max_attempts integer NOT NULL,
    next_attempt_at timestamptz NOT NULL,
    lease_until timestamptz,
    last_error text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    finished_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS bake_jobs_due_idx
    ON bake_jobs (status, next_attempt_at ASC, created_at ASC, id ASC)`,
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
  // Visual artifacts of a review (T07): screenshots, pixel diffs and the
  // motion video; added later, so the column is additive.
  `ALTER TABLE review_items ADD COLUMN IF NOT EXISTS visuals jsonb`,
  `ALTER TABLE review_items ADD COLUMN IF NOT EXISTS import_reports jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS collection_id text`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS note text`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS image_recipe text`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS hero_usage text`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS family text`,
  `ALTER TABLE design_references ADD COLUMN IF NOT EXISTS origin text`,
  // Imported documents (Framer template set): design.md, design-guidelines.md
  // and design-components.md verbatim. Additive, so existing rows read as "no
  // documents" and the detail view hides the document tabs.
  `ALTER TABLE design_references
     ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '{}'::jsonb`,
  // Token identity (ticket 18): `kind` decides how the audit author is derived
  // from the token. Existing rows default to "agent" (fail-closed); the
  // program's own token heals itself to "human" on the next start.
  `ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'agent'`,
  `CREATE INDEX IF NOT EXISTS design_references_collection_idx
    ON design_references (collection_id)`,
  // Style rule registry (Phase 2). The rules are site-wide — a reusable class
  // such as `hero-button` applies to every page — so they live next to the
  // site, not in a page draft. Additive and nullable: an installation from an
  // earlier ticket reads `NULL` and simply has no rules yet.
  `ALTER TABLE sites ADD COLUMN IF NOT EXISTS style_rules_json jsonb`,
  `ALTER TABLE sites ADD COLUMN IF NOT EXISTS style_rules_version integer NOT NULL DEFAULT 0`,
  // Design contract per site (E26, R9): the project's design DNA (constants/
  // never/vocabulary). Additive and nullable — sites without DNA read NULL.
  `ALTER TABLE sites ADD COLUMN IF NOT EXISTS design_contract jsonb`,
  // Public address per site (origin only). Additive and nullable — sites
  // without one keep the `<slug>.senify.xyz` placeholder.
  `ALTER TABLE sites ADD COLUMN IF NOT EXISTS base_url text`,
  // Release manifest (E2): style registry snapshot, renderer version and build
  // hash travel with the release. Additive and nullable — releases from before
  // this column read as "no manifest" and keep working.
  `ALTER TABLE releases ADD COLUMN IF NOT EXISTS manifest jsonb`,
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
  // Image generation (S1, ADR-0008): the provider chain, the ComfyUI
  // connection and the model file names. The custom endpoint (third path)
  // stores its base URL, model, wire format and the encrypted API key here;
  // the key never leaves the engine in plaintext.
  `CREATE TABLE IF NOT EXISTS image_settings (
    id text PRIMARY KEY,
    provider text NOT NULL DEFAULT 'image-use',
    fallback_provider text NOT NULL DEFAULT 'comfyui',
    cooldown_minutes integer NOT NULL DEFAULT 60,
    cli_path text NOT NULL DEFAULT '',
    base_url text NOT NULL DEFAULT 'http://127.0.0.1:8188',
    diffusion_model text NOT NULL DEFAULT 'qwen-image-2.1-Q4_K_M.gguf',
    text_encoder text NOT NULL DEFAULT 'qwen3vl_8b_int8_convrot.safetensors',
    vae text NOT NULL DEFAULT 'qwen_image_2.1_vae_bf16.safetensors',
    default_steps integer NOT NULL DEFAULT 40,
    max_pixels integer NOT NULL DEFAULT 1048576,
    timeout_minutes integer NOT NULL DEFAULT 60,
    custom_base_url text NOT NULL DEFAULT 'https://api.minimax.io/v1',
    custom_model text NOT NULL DEFAULT 'image-01',
    custom_format text NOT NULL DEFAULT 'minimax',
    custom_api_key_encrypted text,
    updated_at timestamptz NOT NULL
  )`,
  // The custom endpoint (third path) arrived after the first installations:
  // additive columns keep them working (the API key column is nullable, the
  // rest fall back to the MiniMax defaults).
  `ALTER TABLE image_settings
     ADD COLUMN IF NOT EXISTS custom_base_url text NOT NULL DEFAULT 'https://api.minimax.io/v1'`,
  `ALTER TABLE image_settings
     ADD COLUMN IF NOT EXISTS custom_model text NOT NULL DEFAULT 'image-01'`,
  `ALTER TABLE image_settings
     ADD COLUMN IF NOT EXISTS custom_format text NOT NULL DEFAULT 'minimax'`,
  `ALTER TABLE image_settings ADD COLUMN IF NOT EXISTS custom_api_key_encrypted text`,
  // Durable image jobs (S2, ADR-0008): the worker claims with a lease, the
  // request travels as jsonb, and the error column carries one entry per
  // provider attempt (the fallback history).
  `CREATE TABLE IF NOT EXISTS image_jobs (
    id text PRIMARY KEY,
    site_id text NOT NULL,
    status text NOT NULL,
    request jsonb NOT NULL,
    provider_used text,
    attempts integer NOT NULL,
    max_attempts integer NOT NULL,
    lease_until timestamptz,
    provider_job_id text,
    asset_id text,
    error jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    started_at timestamptz,
    finished_at timestamptz,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS image_jobs_due_idx
    ON image_jobs (status, created_at ASC, id ASC)`,
  `CREATE INDEX IF NOT EXISTS image_jobs_site_idx
    ON image_jobs (site_id, created_at DESC, id DESC)`,
  // Provider cooldowns (S2): after a quota/availability failure the provider
  // pauses for `image.cooldownMinutes` and the chain uses the fallback.
  `CREATE TABLE IF NOT EXISTS image_provider_cooldowns (
    provider text PRIMARY KEY,
    until timestamptz NOT NULL,
    reason text NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  // Persisted secrets used for encryption at rest, mirroring form_settings.
  `CREATE TABLE IF NOT EXISTS engine_secrets (
    id text PRIMARY KEY,
    name text NOT NULL UNIQUE,
    secret text NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  // Idempotency keys (ticket 18, slice 2): a create request may carry an
  // `idempotencyKey`; a retry with the same key on the same route replays the
  // stored response instead of creating a second entity. The row is claimed
  // before the operation runs (`status`/`response` stay NULL while it is in
  // flight), so a concurrent duplicate is rejected instead of writing twice.
  `CREATE TABLE IF NOT EXISTS idempotency_keys (
    token_id text NOT NULL,
    route text NOT NULL,
    idempotency_key text NOT NULL,
    fingerprint text NOT NULL,
    status integer,
    response jsonb,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (token_id, route, idempotency_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idempotency_keys_created_idx
    ON idempotency_keys (created_at)`,
  // A committed write whose response could not be stored (R6). The slot row
  // above keeps its claim, and this marker records the one fact that matters
  // for a retry: the operation already happened. It lives in its own table so
  // the schema stays additive without ALTER statements (there is no migration
  // tooling in v1, see the note on active_releases).
  `CREATE TABLE IF NOT EXISTS idempotency_committed (
    token_id text NOT NULL,
    route text NOT NULL,
    idempotency_key text NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (token_id, route, idempotency_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idempotency_committed_created_idx
    ON idempotency_committed (created_at)`,
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

// The JSONB columns of a table, derived from the same statements. A restore
// hands these values back as JSON text: a dump carries them parsed (objects,
// arrays) or already as text, and both forms are valid JSON input.
//
// Both shapes are read: a column declared in the CREATE TABLE, and one added
// later through the additive `ALTER TABLE ... ADD COLUMN ... jsonb` form (for
// example `sites.style_rules_json`). Missing the latter would let a restore
// hand the driver a bare object where the column expects JSON text.
export function jsonColumns(name: string): Set<string> {
  const columns = new Set<string>();
  for (const statement of SCHEMA_STATEMENTS) {
    const created = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)/.exec(statement);
    if (created !== null) {
      if (created[1] !== name) continue;
      for (const line of statement.split("\n")) {
        const column = /^\s*([a-z_][a-z0-9_]*)\s+jsonb\b/.exec(line);
        if (column?.[1] !== undefined) columns.add(column[1]);
      }
      continue;
    }
    const altered =
      /ALTER TABLE\s+([A-Za-z0-9_]+)\s+ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s+jsonb\b/.exec(
        statement,
      );
    if (altered?.[1] === name && altered[2] !== undefined) {
      columns.add(altered[2]);
    }
  }
  return columns;
}
