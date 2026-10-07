# MCP-Routen-Matrix

Stand: 2026-10-07 — generiert mit `pnpm route-matrix` aus `packages/engine/src/http.ts` (ROUTES) und `@senify/manifest` (+ Server-Audit). Bei neuer Route die Matrix neu erzeugen; `packages/engine/test/route-matrix.test.ts` prüft Vollständigkeit.

**Regel (E4):** Jede Route hat einen bewussten Status. **Tool** — ein MCP-Tool ruft sie direkt auf. **Workflow-gebündelt** — nur als Teil eines Mehr-Routen-Workflows erreichbar (Via-Spalte nennt das bündelnde Tool). **Operator** — UI/CLI/öffentlich, bewusst ohne Tool.

**Zahlen:** 173 Routen — 90 Tool, 1 Workflow-gebündelt, 82 Operator.

| Methode | Route | Scope | Status | MCP-Tool(s) / Anmerkung |
|---|---|---|---|---|
| GET | `/api/health` | read | Operator | CLI/Dashboard (`senify doctor`) |
| GET | `/api/events` | read | Operator | SSE-Kanal (Editor/Dashboard) |
| POST | `/api/sites` | write | Tool | `create_site` |
| GET | `/api/sites` | read | Tool | `list_sites` |
| PATCH | `/api/sites/:siteId` | write | Tool | `duplicate_site` |
| POST | `/api/sites/:siteId/trash` | publish | Operator | UI/CLI |
| POST | `/api/sites/:siteId/restore` | write | Operator | UI/CLI |
| POST | `/api/sites/:siteId/duplicate` | write | Tool | `duplicate_site` |
| GET | `/api/sites/:siteId` | read | Tool | `get_site` |
| DELETE | `/api/sites/:siteId` | publish | Operator | UI/CLI |
| POST | `/api/sites/:siteId/pages` | write | Tool | `create_page` |
| GET | `/api/sites/:siteId/pages` | read | Tool | `list_pages` |
| GET | `/api/sites/:siteId/theme` | read | Tool | `get_theme`, `server (automatisch)` |
| GET | `/api/sites/:siteId/theme.css` | read | Operator | UI/CLI |
| PUT | `/api/sites/:siteId/theme` | write | Tool | `update_theme` |
| GET | `/api/sites/:siteId/theme/report` | read | Operator | UI/CLI |
| GET | `/api/sites/:siteId/design-report` | read | Tool | `get_design_report` |
| GET | `/api/motion-vendor/:name` | read | Operator | Auslieferung der Motion-Runtime (Editor/Preview) |
| GET | `/api/sites/:siteId/style-rules` | read | Tool | `set_styles` |
| POST | `/api/sites/:siteId/style-rules` | write | Tool | `create_style_rule`, `set_styles` |
| GET | `/api/sites/:siteId/style-rules/:ruleId` | read | Operator | UI/CLI |
| PATCH | `/api/sites/:siteId/style-rules/:ruleId` | write | Tool | `set_styles` |
| POST | `/api/sites/:siteId/style-rules/:ruleId/reorder` | write | Operator | UI/CLI |
| DELETE | `/api/sites/:siteId/style-rules/:ruleId` | publish | Operator | UI/CLI |
| GET | `/api/pages/:pageId` | read | Tool | via get_page/get_nodes (pageFor-Helper) |
| DELETE | `/api/pages/:pageId` | publish | Tool | `delete_page` |
| PUT | `/api/pages/:pageId/template` | write | Tool | `set_page_template` |
| POST | `/api/pages/:pageId/mutations` | write | Tool | `apply_mutations`, `bump_component_version`, `clear_motion`, `set_component_override`, `set_component_variant`, `set_motion`, `update_component_instances` |
| POST | `/api/pages/:pageId/editor-mutations` | write | Operator | Editor-UI (eigener Mutationspfad) |
| POST | `/api/pages/:pageId/undo-batch` | write | Tool | `undo_batch` |
| GET | `/api/pages/:pageId/audit` | read | Operator | UI/CLI |
| GET | `/api/sites/:siteId/audit` | read | Operator | UI/CLI |
| POST | `/api/tokens` | write | Operator | CLI-Bootstrap (`senify tokens create`) |
| GET | `/api/tokens` | read | Operator | CLI (`senify tokens list`) |
| DELETE | `/api/tokens/:tokenId` | publish | Operator | CLI/Programm |
| GET | `/api/whoami` | read | Operator | `whoami` — auch CLI/Diagnose |
| POST | `/api/mcp/audit` | read | Tool | `server (automatisch)` — automatisch — der MCP-Server auditiert jeden Tool-Call |
| GET | `/api/mcp/audit` | read | Operator | Abfrage (Tests/Diagnose) |
| POST | `/api/sites/:siteId/releases` | publish | Tool | `publish_release`, `rollback_release` |
| GET | `/api/sites/:siteId/releases` | read | Tool | `list_releases` |
| GET | `/api/sites/:siteId/bake-jobs` | read | Tool | `list_bake_jobs` |
| POST | `/api/sites/:siteId/deployments` | publish | Tool | `deploy_site` |
| GET | `/api/sites/:siteId/deploy-settings` | read | Tool | `get_deploy_settings` |
| PUT | `/api/sites/:siteId/deploy-settings` | write | Tool | `set_deploy_settings` |
| GET | `/api/sites/:siteId/design-contract` | read | Tool | `get_design_contract` |
| PUT | `/api/sites/:siteId/design-contract` | write | Tool | `set_design_contract` |
| GET | `/api/sites/:siteId/deployments` | read | Tool | `list_deployments` |
| GET | `/api/releases/:releaseId` | read | Tool | `get_release` |
| GET | `/api/pages/:pageId/revisions` | read | Operator | UI/CLI |
| GET | `/api/revisions/:revisionId` | read | Operator | UI/CLI |
| POST | `/api/pages/:pageId/restore` | write | Tool | `restore_revision` |
| POST | `/api/sites/:siteId/previews` | write | Tool | `create_preview` |
| GET | `/api/sites/:siteId/previews` | read | Operator | UI/CLI |
| POST | `/api/sites/:siteId/reviews` | write | Tool | `submit_for_review` |
| GET | `/api/sites/:siteId/reviews` | read | Operator | UI/CLI |
| GET | `/api/reviews/:reviewId` | read | Tool | `get_review_feedback` |
| GET | `/api/reviews/:reviewId/visuals/:filename` | read | Operator | Auslieferung der Review-Screenshots (signiert) |
| POST | `/api/reviews/:reviewId/approve` | publish | Operator | UI/CLI |
| POST | `/api/reviews/:reviewId/request-changes` | write | Operator | UI/CLI |
| POST | `/api/reviews/:reviewId/discard` | write | Operator | UI/CLI |
| POST | `/api/sites/:siteId/assets/upload-url` | write | Tool | via upload_asset (uploadLocalFile-Helper) |
| PUT | `/api/assets/upload/:uploadId` | read | Workflow-gebündelt | Byte-Sink des Upload-Flows (via upload_asset, signierte URL) |
| GET | `/api/sites/:siteId/assets` | read | Tool | `list_assets` |
| GET | `/api/library-components` | read | Tool | `list_library_components` |
| POST | `/api/library-components` | write | Tool | `promote_to_library` |
| GET | `/api/library-components/audit` | read | Tool | `library_audit` |
| GET | `/api/library-components/:componentId` | read | Tool | `get_library_component`, `library_audit` |
| PATCH | `/api/library-components/:componentId` | write | Operator | UI/CLI |
| DELETE | `/api/library-components/:componentId` | write | Operator | UI/CLI |
| GET | `/api/sites/:siteId/library-installs` | read | Operator | UI/CLI |
| POST | `/api/sites/:siteId/library-installs` | write | Tool | `install_library_component` |
| POST | `/api/sites/:siteId/library-installs/:installId/update` | write | Tool | `update_library_instances` |
| DELETE | `/api/sites/:siteId/library-installs/:installId` | write | Tool | `uninstall_library_component` |
| POST | `/api/sites/:siteId/code-payloads` | write | Operator | Import/CLI (MCP-Tools folgen mit der Bibliothek, S6) |
| GET | `/api/sites/:siteId/code-payloads` | read | Operator | Import-Bericht/Editor |
| GET | `/api/code-payloads/:payloadId` | read | Operator | Import-Bericht/Editor |
| DELETE | `/api/code-payloads/:payloadId` | write | Operator | CLI/Editor (destruktiv, mit Audit) |
| GET | `/api/sites/:siteId/assets/:assetId` | read | Operator | UI/CLI |
| PATCH | `/api/sites/:siteId/assets/:assetId` | write | Tool | `replace_asset`, `update_asset` |
| DELETE | `/api/sites/:siteId/assets/:assetId` | write | Tool | `delete_asset` |
| POST | `/api/sites/:siteId/assets/:assetId/restore` | write | Tool | `restore_asset` |
| POST | `/api/sites/:siteId/assets/:assetId/purge` | publish | Operator | UI/CLI |
| GET | `/api/sites/:siteId/assets/:assetId/history` | read | Operator | UI/CLI |
| POST | `/api/sites/:siteId/assets/:assetId/restore-history/:historyId` | write | Operator | UI/CLI |
| POST | `/api/sites/:siteId/assets/bulk` | write | Operator | UI/CLI |
| POST | `/api/sites/:siteId/asset-folders` | write | Operator | UI/CLI |
| GET | `/api/sites/:siteId/asset-folders` | read | Operator | UI/CLI |
| DELETE | `/api/sites/:siteId/asset-folders/:folderId` | write | Operator | UI/CLI |
| GET | `/assets/:filename` | read | Operator | öffentlich |
| GET | `/_astro/:filename` | read | Operator | öffentlich |
| GET | `/assets/:assetId/:filename` | read | Operator | öffentlich |
| GET | `/assets/:assetId/variants/:filename` | read | Operator | öffentlich |
| POST | `/api/sites/:siteId/collections` | write | Operator | UI/CLI |
| POST | `/api/sites/:siteId/collections/from-fields` | write | Operator | UI/CLI |
| GET | `/api/sites/:siteId/collections` | read | Tool | `list_collections` |
| GET | `/api/collections/:collectionId` | read | Tool | `get_collection` |
| PUT | `/api/collections/:collectionId` | write | Operator | UI/CLI |
| POST | `/api/sites/:siteId/entries` | write | Tool | `create_entry` |
| GET | `/api/sites/:siteId/entries` | read | Tool | `list_entries` |
| POST | `/api/sites/:siteId/entries/search` | read | Tool | `search_entries` |
| GET | `/api/sites/:siteId/entries/resolve` | read | Operator | UI/CLI |
| POST | `/api/entries/tick` | write | Operator | UI/CLI |
| GET | `/api/entries/:entryId` | read | Tool | `get_entry` |
| GET | `/api/entries/:entryId/preview` | read | Operator | UI/CLI |
| POST | `/api/entries/:entryId/preview` | read | Operator | UI/CLI |
| PUT | `/api/entries/:entryId` | write | Tool | `update_entry` |
| DELETE | `/api/entries/:entryId` | write | Tool | `delete_entry` |
| POST | `/api/entries/:entryId/restore` | write | Tool | `restore_entry` |
| POST | `/api/entries/:entryId/purge` | publish | Operator | UI/CLI |
| POST | `/api/entries/:entryId/publish` | write | Tool | `publish_entry` |
| POST | `/api/entries/:entryId/unpublish` | write | Operator | UI/CLI |
| GET | `/api/entries/:entryId/versions` | read | Operator | UI/CLI |
| POST | `/api/entries/:entryId/restore-version/:versionId` | write | Tool | `restore_entry_version` |
| POST | `/api/forms/:formId/submit` | read | Operator | öffentlich — Website-Besucher (kein Token) |
| GET | `/api/sites/:siteId/forms` | read | Operator | UI/CLI |
| GET | `/api/forms/:formId/submissions` | read | Operator | UI/CLI |
| GET | `/api/forms/:formId/submissions.csv` | read | Operator | UI/CLI |
| GET | `/api/sites/:siteId/submissions` | read | Tool | `list_submissions` |
| POST | `/api/sites/:siteId/forms/collection-plan` | write | Operator | UI/CLI |
| POST | `/api/sites/:siteId/forms/collection` | write | Operator | UI/CLI |
| GET | `/api/newsletter/confirm` | read | Operator | öffentlich — Double-Opt-in-Link (kein Token) |
| GET | `/api/newsletter/unsubscribe` | write | Operator | öffentlich — Abmeldelink (kein Token) |
| POST | `/api/notifications/tick` | write | Operator | UI/CLI |
| GET | `/api/sites/:siteId/notifications` | read | Operator | UI/CLI |
| POST | `/api/references` | write | Tool | `analyze_reference` |
| GET | `/api/references/search` | read | Tool | `search_references` |
| GET | `/api/references/duplicates` | read | Tool | `find_duplicate_references` |
| GET | `/api/references` | read | Tool | `list_references` |
| POST | `/api/references/manual` | write | Tool | `create_manual_reference` |
| POST | `/api/references/brief` | read | Tool | `get_reference_brief` |
| POST | `/api/references/tick` | write | Tool | `reference_tick` |
| GET | `/api/references/:referenceId` | read | Tool | `find_duplicate_references`, `get_reference`, `get_reference_docs`, `search_references` |
| PATCH | `/api/references/:referenceId` | write | Tool | `assign_reference_to_collection`, `update_reference`, `update_reference_doc` |
| GET | `/api/pages/:pageId/redesign-package` | read | Tool | `plan_redesign` |
| GET | `/api/references/:referenceId/design-system` | read | Tool | `import_design_system` |
| GET | `/api/references/:referenceId/brief` | read | Tool | `get_reference_brief` |
| DELETE | `/api/references/:referenceId` | write | Tool | `delete_reference` |
| GET | `/api/references/:referenceId/revisions` | read | Tool | `list_reference_revisions` |
| POST | `/api/references/:referenceId/revisions` | write | Tool | `edit_reference_profile` |
| GET | `/api/references/:referenceId/snapshots/:filename` | read | Operator | Auslieferung der Referenz-Screenshots (signiert) |
| POST | `/api/references/:referenceId/visual-diff` | read | Tool | `diff_reference` |
| GET | `/api/references/:referenceId/visual-diffs/:filename` | read | Operator | UI/CLI |
| GET | `/api/sites/:siteId/references` | read | Operator | UI/CLI |
| POST | `/api/sites/:siteId/references` | write | Tool | `apply_reference` |
| DELETE | `/api/sites/:siteId/references/:referenceId` | write | Tool | `unassign_reference` |
| POST | `/api/sites/:siteId/redesign` | write | Tool | `apply_redesign` |
| POST | `/api/pages/:pageId/redesign-proposals` | write | Tool | `create_redesign_proposal` |
| GET | `/api/pages/:pageId/redesign-proposals` | read | Operator | UI/CLI |
| GET | `/api/redesign-proposals/:proposalId` | read | Tool | `get_redesign_proposal` |
| GET | `/api/redesign-proposals/:proposalId/cards/:directionId/screenshot` | read | Operator | UI/CLI |
| POST | `/api/redesign-proposals/:proposalId/confirm` | write | Operator | UI/CLI |
| POST | `/api/redesign-proposals/:proposalId/media-needs` | write | Operator | UI/CLI |
| GET | `/api/settings` | read | Tool | `get_reference_settings` |
| PUT | `/api/settings` | write | Tool | `set_reference_settings` |
| POST | `/api/settings/email/test` | write | Operator | UI/CLI |
| GET | `/api/images/health` | read | Operator | UI/CLI |
| POST | `/api/sites/:siteId/images/jobs` | write | Tool | `generate_image` |
| GET | `/api/sites/:siteId/images/jobs` | read | Tool | `list_image_jobs` |
| GET | `/api/images/jobs/:jobId` | read | Tool | `get_image_job` |
| DELETE | `/api/images/jobs/:jobId` | write | Operator | UI/CLI |
| GET | `/api/reference-collections` | read | Tool | `list_reference_collections` |
| POST | `/api/reference-collections` | write | Tool | `create_reference_collection` |
| POST | `/api/reference-collections/styles` | write | Operator | UI/CLI |
| PATCH | `/api/reference-collections/:collectionId` | write | Tool | `update_reference_collection` |
| DELETE | `/api/reference-collections/:collectionId` | write | Tool | `delete_reference_collection` |
| GET | `/api/reference-collections/:collectionId/brief` | read | Tool | `get_reference_brief` |
| GET | `/api/backups` | read | Operator | UI/CLI |
| POST | `/api/backups` | write | Operator | UI/CLI |
| POST | `/api/backups/:name/restore` | write | Operator | UI/CLI |
| POST | `/api/sites/:siteId/imports/framer` | write | Tool | `import_framer_page` |
| POST | `/api/sites/:siteId/imports/framer/preview` | write | Operator | UI/CLI |
| GET | `/api/sites/:siteId/imports` | read | Operator | UI/CLI |
| GET | `/api/imports/:jobId` | read | Tool | `get_import_report` |
