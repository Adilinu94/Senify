# Review & Release — Preview, Checks, Deploy

Load this file when the job is verifying, handing over, publishing or deploying. Nothing here touches the active release except `publish_release` / `rollback_release` after approval.

## Look, then submit

1. `create_preview` — a signed draft build (30 days). Hand the URL to the operator; never describe the draft from memory.
2. `get_design_report` — the 0–100 score with findings S1–S12 (place + suggestion). Fix hard findings before submitting; soft ones need a reason when they stay.
3. `submit_for_review` — hard checks must pass (guardrails, links, alt texts, contrast). A violation comes back as a guardrail error, not a review item. The submit carries build + structure diff.
4. `get_review_feedback` — status, thread, diff. “Request changes” means: fix, re-submit.

## Go live / step back

- `publish_release` only after explicit approval (publish scope, operator decision). `rollback_release` restores the previous release publicly.
- History: `list_releases` / `get_release` for releases, page states via `restore_revision` (append-only, becomes a new draft).

## Deliver

- `deploy_site` delivers the active release's build (provider `static` → target dir with staging + swap; hosted providers see the deploy settings). `list_deployments` shows where the site went and whether it succeeded.
- Build health: `list_bake_jobs` for job status, retry and dedup.

## Read-only inspections

- Inspect with the `read` scope only: `get_page`, `get_nodes`, `get_theme`, `list_*`, `get_design_report`, briefs and docs. No token with `write` for a look-around; no `dry_run` theater — reads are free and exact.
