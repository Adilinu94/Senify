# Content-Kern: Collections & Entries

Type: grilling
Status: resolved

Input: artifacts/01-datenmodell.md
Input: research/23-instatic-deepdive.md
Input: research/24-payload-learnings.md
Input: research/25-emdash-learnings.md
Input: research/26-instatic-delta.md

## Question

Instatic-Analyse + Nutzer-Anforderung („komplettes CMS"): Wie baut Senify **Collections (Post-Types) als First-Class**?

- **Datenmodell:** `Collection` (Site-scoped: slug, Labels, Felder, routeBase) + `Entry` (Zellen je Feld-ID, slug, status, Autor, Versionen) — wie erweitert das Artefakt 01 **additiv**?
- **Feldsystem v1:** welche Typen (text, richtext/markdown, number, boolean, date, select/multiSelect, url, email, media(+multi), relation(+multi), repeater?) — Validierung + Editor-Controls nach Registry-Muster (08)?
- **Workflow:** draft/published (+ unpublished/scheduled?) + Entry-Versionen bei Publish (analog Revisionen 05)?
- **Content-Workspace-UI:** Liste + Entry-Editor (Body als **Markdown/Tiptap** wie Instatic), Settings-Panel (Status, Slug, SEO, Medien, Custom-Felder)?
- **Agenten-Sicht:** welche MCP-Tools für Content (CRUD, Status, Suche) — Abgrenzung zu Ticket 10.

Ergebnis: Collection-/Entry-Modell + Feldsystem + Workflow + Workspace-Konzept; Grundlage für Templates/Loops (23) und Forms (26).

## Answer

**Entschieden am 15.09.2026 (Wizard, 14/14) — Artefakt: [artifacts/22-content-kern.md](../artifacts/22-content-kern.md)**

- **Datenmodell:** Dedizierte Entitäten `Collection` (eingebettete `FieldDef`s, `titleField`/`dateField`/`urlPattern`/`supports`) + `Entry` (JSONB-`cells` keyed by Feld-ID, `slug`/`status` denormalisiert, `version` für Konfliktschutz) + `EntryVersion` (Snapshot je Publish) + `EntryRedirect` (301). Keine Universal-Tabellen.
- **Feldsystem v1 (16 Typen):** text, longText, richtext (Markdown kanonisch), number, boolean, date, dateTime, select, multiSelect, url, email, media, mediaMulti, relation (typisiert, Ziel-Whitelist), relationMulti, repeater (1 Ebene, mit Relation). Built-ins: `title`/`slug` immer; `body`/`featuredMedia`/`seo*` per `supports`-Flag.
- **Workflow:** draft/published/unpublished/scheduled (Job-Tick, Fehler → draft); Version je Publish + „Restore as Draft"; Slug-Wechsel bei published → 301; Trash (Soft-Delete), Purge nur publish-Scope.
- **Content-Workspace v1:** Liste (FTS, Status-Filter, Bulk-light) + Entry-Editor (Tiptap-Markdown + zentraler Cell-Editor) + Settings-Panel + Versions-Timeline; Autosave-Draft (in-place) + explizites Publish; Live-Modus → Ticket 23.
- **MCP:** Content-Tools (list/get/create/update/publish/unpublish/delete/restore/search) mit Scope-Trennung; Schema-Mutation agentenfähig (`create_collection`/`add_field`, additiv, Review-pflichtig); Markdown an der Agenten-Grenze; Konfliktschutz `baseVersion`.
- **Entry-Publish:** eigenständig vom Page-Release; Re-Bake betroffener Routen/Listen (Mechanik → Ticket 23).
- **Suche:** Postgres FTS (gewichteter tsvector: title/slug/body), geteilt zwischen Programm und MCP.
- **Taxonomien:** kein Sondersystem — Kategorien = Collection + Relation; Tags = multiSelect.
