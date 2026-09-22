# Senify — Knowledge Router

Read this file first: it routes a job to the right tool or reference.

| Job | Start here |
|---|---|
| Find a site or page | `list_sites` → `list_pages` → `get_page` |
| Understand a section before inserting it | `get_section` (props, variants, golden example) |
| Insert, move or change sections | `apply_mutations` (atomic batch; `dry_run` first when unsure) |
| Style a section (colors, spacing, radius) | `get_section` → `styleProps` and `parts`; values as token refs from `get_theme` or free values |
| Adjust for tablet or mobile | `setBreakpointOverride` mutation |
| Change brand tokens | `update_theme` (scales and semantic roles) |
| Create a new page | `create_page` |
| Inspect a node in detail | `get_nodes` (full props, overrides, motion for given ids) |
| Reuse a subtree on the page (component) | `list_components` → `get_component` (parts, slots, instances, variants, version/drift) → `set_component_override` (one instance, definition untouched) · `set_component_variant` (activate a declared variant); version it with `bump_component_version` + `update_component_instances` |
| Animate a section | `motion.md`, then `set_motion` / `clear_motion` (preset + intensity + RM; profile caps apply) |
| Generate images for a project | `images.md`, then `generate_image` → `get_image_job` |
| See the draft as a real website | `create_preview` (signed URL, 30 days) |
| Hand work over for review | `submit_for_review` (hard checks must pass, build + diff included) |
| Read the operator's feedback | `get_review_feedback` (status + thread + diff) |
| Go live / step back | `publish_release` · `rollback_release` (publish scope) |
| Bring back an old page state | `restore_revision` (append-only: becomes a new draft) |

## Reference files

- `sections.md` — section catalog with core props, variants and motion presets (generated from the registry).
- `tools.md` — full tool catalog with parameters and scopes (generated from the MCP tool catalog).
- `errors.md` — error categories with examples and suggestions (generated).
- `workflow.md` — the master flow „site from a brief".
- `assets.md` — asset sourcing, licences and alt-text rules.
- `images.md` — generating images with the engine (provider chain, prompt recipe, error cases).
- `motion.md` — motion presets, the spec, site profiles and the hard guardrails.

## Ground rules

- **Drafts first.** Every write goes through `apply_mutations` with `baseDraftVersion` from `get_page`. A conflict error means: reload the page, then retry.
- **Tokens before literals.** Prefer `{ "$token": "accent" }` or `{ "$token": "space.16" }`. Literal values work but come back as `warnings[]`.
- **Registry is law.** Sections, variants and props come from the registry. Never invent CSS, HTML or new section types.
- **Warnings are hints.** They never block a write; read them and adjust the next batch.
- **Errors are actionable.** Every error carries `category`, `message` and often `suggestion`, `field` and `opIndex` (index inside the batch).
