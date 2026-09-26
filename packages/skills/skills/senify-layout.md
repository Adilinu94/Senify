# Layout & Styling — Pages, Sections, Components

Load this file when the job is building or changing page content, layout, styles or components. Pair with `sections.md` (catalog) and `tools.md` (parameters).

## Build order

1. `get_page` for structure and `draftVersion`; `get_nodes` for full props of given ids.
2. `get_section` before every insert: props, variants, `styleProps` and `parts`, golden example. Golden props are the starting point, never invent props.
3. `apply_mutations` in one batch per section (atomic, one undo step). `dry_run: true` first when unsure. On conflict (409): reload the page, retry with the new `baseDraftVersion`.
4. After every batch: `get_page` for the new `draftVersion`, read `warnings[]`.

## Styling

- Section styles (`background`, `textColor`, `paddingY`, `contentWidth`, `align`), parts (`card*`, `button*`, `heading*`, `media*`, `link*`), layout knobs (`columns`, `gap`, `reverse`, `aspect`).
- Free CSS goes through `set_styles` (one node, token refs) or `create_style_rule` (reusable classes). Tokens before literals: `{ "$token": "accent" }`. Literals work but return warnings.
- Tablet/mobile via `setBreakpointOverride`; overrides are per property and removable — never rewrite a whole breakpoint.

## Components & templates

- `list_components` → `get_component` (parts, slots, instances, variants, version/drift). `set_component_override` changes one instance, the definition stays untouched. `set_component_variant` activates declared variants (combinable, overrides survive the swap).
- `bump_component_version` moves the definition ahead; `update_component_instances` pulls drifting instances in one batch. A release blocks while drift exists — resolve it before submitting.
- Page scaffolding via `create_page` and `set_page_template`; bring back old states with `restore_revision` (append-only, becomes a new draft).

## Undo

- `undo_batch` reverts the newest mutation batches server-side (agent undo); only the newest remaining batches can be undone. Every undo is an audit entry.
