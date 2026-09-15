# 09: Content-Kern (Collections & Entries)

**What to build:** Das „komplette CMS": Collections mit 16 Feldtypen (text, longText, richtext/Markdown, number, boolean, date, dateTime, select, multiSelect, url, email, media, mediaMulti, relation, relationMulti, repeater), eingebettete Felder, Ziel-Whitelist für Relationen, Repeater genau 1 Ebene, Built-ins (title/slug + supports-Flags). Entries mit JSONB-`cells`, Workflow draft/published/unpublished/scheduled, Version je Publish (Retention), „Restore as Draft", Slug-Änderung → 301, Soft-Delete/Trash (Purge nur `publish`-Scope), Konfliktschutz `baseVersion`, Postgres-FTS (gewichtet). Dazu der Content-Workspace im Programm: Entry-Liste (Suche/Filter/Sortierung/Bulk-light), Entry-Editor (Markdown/Tiptap + generierte Feld-Controls + Autosave in Draft + explizites Publish), Settings-Panel, Versions-Timeline mit Diff. Content-Tools über MCP (`list_collections` … `restore_entry_version`, `search_entries`); Entry-Publish triggert den Re-Bake-Job (Trigger-Stub).

**Blocked by:** 02 (Site & Pages + Mutations), 06 (MCP-Kern & Agent-Setup), 08 (Media — media-Felder).

**Status:** ready-for-agent

- [ ] Collections anlegen/ändern (additiv, Deprecation statt Löschen); Felder mit `description` (agentenlesbar); Kategorien=Collection+Relation und Tags=multiSelect funktionieren als Muster
- [ ] Entry-Workflow vollständig inkl. scheduled (Job-Tick, Fehler → zurück auf draft); Versionen entstehen nur bei Publish; Restore kopiert in den Draft
- [ ] Slug-Änderung an published Entry erzeugt 301 (`EntryRedirect`); nicht-published liefert 404
- [ ] Konfliktschutz: jeder Write verlangt `baseVersion`; Mismatch → strukturierter 409-Fehler; Autosave erzeugt nie Versionen
- [ ] FTS: Suche in Liste + `search_entries` liefert gewichtete Treffer (title A / slug B / body C)
- [ ] Content-Workspace bedienbar: Liste → Editor (Autosave, Save-State, 409-Recovery) → Publish → Versionen-Diff
- [ ] MCP-Content-Tools komplett mit Scopes; Soft-Delete/Restore/Purge korrekt eingeschränkt; Audit-Events
- [ ] „Sammlung aus Formular anlegen"-Vorbereitung (Collections aus Feld-Specs erzeugbar — Voraussetzung für Forms)

Quellen: `artifacts/22`, Spec „Content-Kern", `research/24` (Payload-Muster).