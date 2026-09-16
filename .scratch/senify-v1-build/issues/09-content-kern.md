# 09: Content-Kern (Collections & Entries)

**What to build:** Das „komplette CMS": Collections mit 16 Feldtypen (text, longText, richtext/Markdown, number, boolean, date, dateTime, select, multiSelect, url, email, media, mediaMulti, relation, relationMulti, repeater), eingebettete Felder, Ziel-Whitelist für Relationen, Repeater genau 1 Ebene, Built-ins (title/slug + supports-Flags). Entries mit JSONB-`cells`, Workflow draft/published/unpublished/scheduled, Version je Publish (Retention), „Restore as Draft", Slug-Änderung → 301, Soft-Delete/Trash (Purge nur `publish`-Scope), Konfliktschutz `baseVersion`, Postgres-FTS (gewichtet). Dazu der Content-Workspace im Programm: Entry-Liste (Suche/Filter/Sortierung/Bulk-light), Entry-Editor (Markdown/Tiptap + generierte Feld-Controls + Autosave in Draft + explizites Publish), Settings-Panel, Versions-Timeline mit Diff. Content-Tools über MCP (`list_collections` … `restore_entry_version`, `search_entries`); Entry-Publish triggert den Re-Bake-Job (Trigger-Stub).

**Blocked by:** 02 (Site & Pages + Mutations), 06 (MCP-Kern & Agent-Setup), 08 (Media — media-Felder).

**Status:** umgesetzt (`pnpm verify` grün; Engine, MCP und Content-Workspace im Programm, der Content-Teil ist mit T12 in die Programm-Shell integriert)

- [x] Collections anlegen/ändern (additiv, Deprecation statt Löschen); Felder mit `description` (agentenlesbar); Kategorien=Collection+Relation und Tags=multiSelect funktionieren als Muster
- [x] Entry-Workflow vollständig inkl. scheduled (Job-Tick `POST /api/entries/tick`, Fehler → zurück auf draft); Versionen entstehen nur bei Publish (Retention 50); Restore kopiert in den Draft
- [x] Slug-Änderung an published Entry erzeugt 301 (`EntryRedirect`); nicht-published liefert 404; die Live-Route folgt der aktiven Version (Draft-Rename bricht sie nicht)
- [x] Konfliktschutz: jeder Write verlangt `baseVersion`; Mismatch → strukturierter 409-Fehler; Autosave erzeugt nie Versionen
- [x] FTS: Suche in Liste + `search_entries` liefert gewichtete Treffer (title A / slug B / body C)
- [~] Content-Workspace bedienbar: Liste → Editor (Autosave, Save-State, 409-Recovery) → Publish → Versionen-Diff — **offen, gehört zu T12** (APIs und Tools dafür stehen)
- [x] MCP-Content-Tools komplett mit Scopes; Soft-Delete/Restore/Purge korrekt eingeschränkt; Audit-Events
- [x] „Sammlung aus Formular anlegen"-Vorbereitung (`POST /api/sites/:siteId/collections/from-fields`; Felder ohne id/key werden abgeleitet)

Quellen: `artifacts/22`, Spec „Content-Kern", `research/24` (Payload-Muster).

## Handoff für die ausführende Session (Stand 15.09.2026)

**Auftrag:** Content-Kern (Engine + MCP) umsetzen. **Kein Commit** — die übergreifende Session committet nach Review. Die **Content-Workspace-UI gehört zu T12** und ist hier nicht Teil des Auftrags (nur die APIs/Tools, die sie später braucht).

**Anlaufpunkte:** `AGENTS.md`, `CONTEXT.md`, `artifacts/22` (Content-Kern-Verträge, 16 Feldtypen, `supports`-Flags, `EntryVersion`, `EntryRedirect`, FTS-Gewichte), Spec „Content-Kern", `research/24` (Payload-Muster). Muster im Code: `packages/engine/src/store.ts` (Row-Mapper + Methoden), `http.ts` (Routen mit `scope`), `lifecycle-contract.ts`/`media.ts` (Body-Schemas), `packages/engine/test/media.test.ts` + `lifecycle.test.ts` (Testmuster mit `bootEngine`), `packages/mcp/src/tools.ts` (Tool-Katalog).

**Ist-Stand:** T01–T08 sind committet (`pnpm verify` grün, 239 Tests). Engine hat Sites/Pages/Mutations/Theme/Tokens/Lifecycle (Releases/Previews/Reviews)/Media (Assets, Bibliothek, Varianten). Konventionen: additive Tabellen (kein ALTER), pg-mem-taugliche Queries (RETURNING statt rowCount; JSONB über JSON.stringify), SenifyError mit category/field/suggestion, Fehlerkategorien `validation|guardrail|conflict|auth|not_found`.

**Umsetzung (Priorität in dieser Reihenfolge):**
1. **Schema (additiv):** `collections` (id, site_id, name, slug, fields jsonb, title_field, date_field, url_pattern, supports jsonb, list_columns jsonb, deprecated_at, created_at, updated_at), `entries` (id, site_id, collection_id, slug, status, cells jsonb, active_version_id, version integer, author jsonb, deleted_at, created_at, updated_at), `entry_versions` (id, entry_id, version, cells jsonb, status, author jsonb, created_at), `entry_redirects` (id, site_id, collection_id, from_path, to_path, created_at), plus ein `tsvector`-Index/Spalte für FTS (in pg-mem reicht eine normale `text`-Spalte `search_text` + ILIKE-Fallback; auf Postgres `to_tsvector` nutzen, wenn verfügbar).
2. **Collections:** anlegen/ändern (Felder additiv; `deprecated`-Flag statt Löschen), `GET /api/sites/:siteId/collections`, `GET /api/collections/:id`, `PUT /api/collections/:id` (write). Feldtypen exakt nach `artifacts/22` validieren (16 Typen, `repeater` genau 1 Ebene, Relation mit Ziel-Whitelist); `description` je Feld ist Pflicht für Agenten-Nutzbarkeit.
3. **Entries:** anlegen/ändern mit `baseVersion`-Konfliktschutz (Mismatch → 409 mit „reload and retry"), Workflow `draft|published|unpublished|scheduled` (`scheduledAt` → Job-Tick `POST /api/entries/tick` veröffentlicht fällige Einträge; Fehler → zurück auf `draft` mit Notiz), Version nur bei Publish (Retention-Limit 50 je Entry), `GET /api/entries/:id/versions`, `POST /api/entries/:id/restore-version/:versionId` (kopiert in den Draft), Soft-Delete + Trash + Purge (nur `publish`-Scope), `POST /api/entries/:id/publish` (write) das den Re-Bake-Trigger als **Stub** aufruft (Funktion `triggerRebake(siteId, reason)` die nur loggt/zählt).
4. **Slugs/Redirects:** Slug-Änderung an einem veröffentlichten Entry erzeugt einen `EntryRedirect` (301); ein Lookup `GET /api/sites/:siteId/entries/resolve?path=…` liefert `{ status: "published", entry }` oder `{ status: "redirect", to }` oder `{ status: "not_found" }` (nicht veröffentlichte Slugs → not_found).
5. **FTS:** `search_text` je Entry (Titel A / Slug B / Body C gewichtet zusammengesetzt), `GET /api/sites/:siteId/entries?q=…` + `POST /api/sites/:siteId/entries/search` liefern gewichtete Treffer (Reihenfolge nach Gewicht, dann Datum).
6. **Sammlung aus Feld-Specs:** `POST /api/sites/:siteId/collections/from-fields` (write) — nimmt `{ name, fields }` und legt die Collection an (Vorbereitung für Forms/T11).
7. **MCP-Tools** (`packages/mcp/src/tools.ts`, `write`-Scope außer Lesen/Purge): `list_collections`, `get_collection`, `list_entries`, `get_entry`, `create_entry`, `update_entry`, `publish_entry`, `delete_entry` (Trash), `restore_entry`, `restore_entry_version`, `search_entries`. Tool-Liste in `packages/mcp/test/workflow.test.ts` anpassen.
8. **Tests:** `packages/engine/test/content.test.ts` (Collection + Felder-Validierung, Entry anlegen/ändern mit 409-Konflikt, Publish erzeugt Version nur bei Publish, Scheduled-Tick veröffentlicht bzw. fällt auf draft zurück, Slug-Änderung → Redirect + resolve, FTS-Trefferreihenfolge, Trash/Restore/Purge-Scope) und ein MCP-Fall in `workflow.test.ts` (Collection → Entry → Publish → Suche).

**Randbedingungen:** Deutsch mit englischen Fachbegriffen; TypeScript strict/ESM; keine ALTER-Statements; keine ungenutzten Exporte; Kommentare sparsam; `pnpm verify` muss grün sein (inkl. aller bestehenden Tests, aktuell 239). Falls Zeit/ Budget knapp wird: Punkte 1–4 zuerst vollständig, dann 5–8; halbfertige Punkte im Bericht nennen.

## Umsetzungs-Notiz (Engine + MCP)

**Umgesetzt:** additive Tabellen `collections`, `entries`, `entry_versions`, `entry_redirects`; Feldtypen nach `artifacts/22` mit eigenem Schema je Typ (eine Union hätte alle Fehler zu „Expected union value" verwaschen), Pflicht-`description`, Repeater genau eine Ebene, Relation mit Ziel-Whitelist; Entries mit `baseVersion`-Konfliktschutz, Workflow draft/published/unpublished/scheduled, Versionen nur bei Publish (Retention 50), Restore in den Draft, Trash/Restore/Purge (Purge nur `publish`-Scope); Slug-Wechsel legt einen 301 an, Resolve folgt der aktiven Version; FTS über `search_text` (Titel A/Slug B/Body C) mit Ranking in der Engine; „Collection aus Feld-Specs"; 11 MCP-Tools (`list_collections` … `restore_entry_version`, `search_entries`); Re-Bake als Stub (`triggerRebake`, zählt und loggt).

**Beim Review korrigiert:** fehlende Imports/Exports (`FIELD_TYPES`, `FIELD_DEF_SCHEMAS`, `MediaKind`), cast-freier Pfad für Repeater-Unterfelder (`toFieldDef`), Feld-Fehlerpfade auf Request-Indizes (das eingebaute Titel-Feld wurde vorher validiert und verschob sie), Resolve über die aktive Version (`findPublishedEntryBySlug` statt Draft-Slug) und die neue Site-Audit-Route (`GET /api/sites/:siteId/audit`) für den Aktivitäts-Stream.

**Tests:** `packages/engine/test/content.test.ts` (14: Feldsystem, Workflow, Konflikte, Retention, Tick, Redirects, FTS) und der MCP-Content-Workflow über den echten Client (Collection → Entry → Konflikt → Publish → Suche → Trash/Restore → Version-Restore).