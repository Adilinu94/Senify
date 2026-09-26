# CMS & Assets — Collections, Entries, Submissions, Media

Load this file when the job is editorial: collections, entries, versions, submissions, media library. Asset generation lives in `images.md`, sourcing and licence rules in `assets.md`.

## Collections & entries

1. `list_collections` → `get_collection` for the field definitions (cells are keyed by field id).
2. `list_entries` for the current state, `search_entries` for full-text; `get_entry` for cells, slug, status and the `baseVersion` that `update_entry` expects.
3. `create_entry` (slug derived from the title field when omitted) → `update_entry` (cells merged per field, `null` clears) → `publish_entry` (validates required and unique fields, writes a version, records the 301 when the slug changed).
4. `delete_entry` moves to trash (reversible via `restore_entry`); `restore_entry_version` copies a published version into the draft without publishing.
5. Entry publish triggers a re-bake of the affected routes only; watch `list_bake_jobs` when the page must update.

## Submissions inbox

- `list_submissions` is the labelled inbox view of form data (columns + rows mapped to field labels). Submissions are ordinary entries: `list_entries`, `get_entry` and `search_entries` work on them too.

## Media

- `list_assets` (folders, tags, missing-alt smart list) → `upload_asset` / `generate_image` → `get_image_job`; replace under a stable id with `replace_asset` (usages stay valid), trash/restore with `delete_asset` / `restore_asset`.
- Alt text is mandatory (purely decorative images flagged, never empty by accident). Results run through dedupe and variants — no side paths.
