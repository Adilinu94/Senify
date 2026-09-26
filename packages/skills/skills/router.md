# Senify — Knowledge Router

Read this file first: it routes a job to the right tool or reference.

| Job | Start here |
|---|---|
| Find a site or page | `list_sites` → `list_pages` → `get_page` |
| Understand a section before inserting it | `get_section` (props, variants, golden example) |
| Insert, move or change sections | `senify-layout.md`, then `apply_mutations` (atomic batch; `dry_run` first when unsure) |
| Style a section (colors, spacing, radius) | `senify-layout.md`: `get_section` → `styleProps` and `parts`; values as token refs from `get_theme` or free values |
| Adjust for tablet or mobile | `setBreakpointOverride` mutation |
| Change brand tokens | `update_theme` (scales and semantic roles) |
| Create a new page | `create_page` |
| Inspect a node in detail | `get_nodes` (full props, overrides, motion for given ids) |
| Reuse a subtree on the page (component) | `senify-layout.md`: `list_components` → `get_component` (parts, slots, instances, variants, version/drift) → `set_component_override` (one instance, definition untouched) · `set_component_variant` (activate a declared variant); version it with `bump_component_version` + `update_component_instances` |
| Animate a section | `motion.md`, then `set_motion` / `clear_motion` (preset + intensity + RM; profile caps apply) |
| Generate images for a project | `images.md`, then `generate_image` → `get_image_job` |
| Maintain collections and entries | `senify-cms.md`: `list_collections` → `get_collection` → `list_entries` → `update_entry` → `publish_entry`; media via `list_assets` / `upload_asset` |
| See the draft as a real website | `senify-review.md`: `create_preview` (signed URL, 30 days) |
| Check a page for generic slop | `get_design_report` (0-100 score, eight dimensions, findings S1-S12 with place and suggestion) |
| Hand work over for review | `senify-review.md`: `submit_for_review` (hard checks must pass, build + diff included) |
| Read the operator's feedback | `get_review_feedback` (status + thread + diff) |
| Go live / step back | `senify-review.md`: `publish_release` · `rollback_release` (publish scope) |
| Deliver the release publicly | `senify-review.md`: `deploy_site` → `list_deployments` (static target or hosted provider) |
| Bring back an old page state | `restore_revision` (append-only: becomes a new draft) |
| Build in the style of a reference | `senify-referenz-redesign.md`: `search_references` → `get_reference` → `plan_redesign` → `create_redesign_proposal` → human chooses one Direction Card → `get_redesign_proposal` → `get_page`/`get_section`/`apply_mutations` → `diff_reference`/`get_design_report`/`create_preview` → `submit_for_review` |
| Manage the reference library | `create_manual_reference` / `update_reference` / `update_reference_doc` / `delete_reference`; profile edits via `edit_reference_profile` (append-only revisions); DNA via `get_reference_settings` / `set_reference_settings` |
| Just looking around (read-only) | `senify-review.md` “Read-only inspections”: token with scope `read`, no writes — the documented standard for inspection agents |

## Reference files

- `sections.md` — section catalog with core props, variants and motion presets (generated from the registry).
- `tools.md` — full tool catalog with parameters and scopes (generated from the MCP tool catalog).
- `errors.md` — error categories with examples and suggestions (generated).
- `workflow.md` — the master flow „site from a brief".
- `senify-layout.md` — building and styling pages, sections, components (load for build jobs).
- `senify-cms.md` — collections, entries, submissions, media (load for editorial jobs).
- `senify-review.md` — preview, review, release, deploy, read-only inspections (load for handover jobs).
- `senify-referenz-redesign.md` — reference vault, chosen redesign direction, editable draft, visual checks and review.
- `assets.md` — asset sourcing, licences and alt-text rules.
- `images.md` — generating images with the engine (provider chain, prompt recipe, error cases).
- `motion.md` — motion presets, the spec, site profiles and the hard guardrails.

## Ground rules

- **Drafts first.** Every write goes through `apply_mutations` with `baseDraftVersion` from `get_page`. A conflict error means: reload the page, then retry.
- **Tokens before literals.** Prefer `{ "$token": "accent" }` or `{ "$token": "space.16" }`. Literal values work but come back as `warnings[]`.
- **Registry is law.** Sections, variants and props come from the registry. Never invent CSS, HTML or new section types.
- **Warnings are hints.** They never block a write; read them and adjust the next batch.
- **Errors are actionable.** Every error carries `category`, `message` and often `suggestion`, `field` and `opIndex` (index inside the batch).
