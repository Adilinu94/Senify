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

## Ground rules

- **Drafts first.** Every write goes through `apply_mutations` with `baseDraftVersion` from `get_page`. A conflict error means: reload the page, then retry.
- **Tokens before literals.** Prefer `{ "$token": "accent" }` or `{ "$token": "space.16" }`. Literal values work but come back as `warnings[]`.
- **Registry is law.** Sections, variants and props come from the registry. Never invent CSS, HTML or new section types.
- **Warnings are hints.** They never block a write; read them and adjust the next batch.
- **Errors are actionable.** Every error carries `category`, `message` and often `suggestion`, `field` and `opIndex` (index inside the batch).
