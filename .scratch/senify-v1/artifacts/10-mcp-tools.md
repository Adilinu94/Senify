# Artefakt 10: MCP-Tool-Katalog v1 (Senify v1)

> Entschieden am 14.09.2026 in Ticket „MCP-Tool-Katalog v1".
> Grundlagen: `artifacts/04` (Transport/Scopes/Audit), `01` (Mutationen), `05` (Lifecycle), `06` (Review-Flow), `07` (Theme), `08` (Katalog), `09` (Editor teilt Mutations), `research/20` (Instatic-Tool-Scopes, Anthropic-Tool-Design-Guide).

## Entscheidungen (Wizard, 5/5)

1. **Hybrid:** wenige High-Level-Verben + EIN generisches `apply_mutations` (Batch kanonischer Mutationen).
2. **Read-Ergonomie:** Outline + selektive Details (`get_page` → `get_nodes`), token-effizient.
3. **Umfang v1:** ~20 Tools (Kern + Lifecycle + Review + Theme + Media-minimal + Docs).
4. **Atomarität:** `apply_mutations` all-or-nothing + strukturierte Fehler.
5. **Guardrails:** Sofort-Fehler beim Schreiben + `dry_run` für Vorab-Checks.

## Der Katalog (25 Tools)

### Lesen (`read`)
| Tool | Zweck | Output (kurz) |
|---|---|---|
| `whoami` | Token-Identität + Scopes (Debug) | Name, Scopes, letzte Nutzung |
| `list_sites` | Sites des Accounts | id, name, slug, Status |
| `get_site` | Site-Info | Theme, aktive Release, Seitenzahl |
| `list_pages` | Seitenübersicht | Pfade, Titel, Status (draft-only/published/draft-ahead) |
| `get_page` | **Outline** einer Seite | Sektionen mit IDs, Typ, Variante, Kernfeldern + `draftVersion` |
| `get_nodes` | Detail-Nodes (IDs[]) | Vollständige Props/Overrides/Motion je Node |
| `list_sections` | Registry-Katalog | Typen, Titel, Kurzbeschreibung (agentenlesbar) |
| `get_section` | SectionDefinition | Props-Schema, Varianten, Slots, **Golden-Beispiel** |
| `get_theme` | Token-Struktur | Primitive/Semantik/Modes/Fonts/Motion |
| `list_assets` | Media-Library | Assets mit Meta (Alt, Maße) |
| `search_docs` | Doku-Suche | Treffer (Portal-Content) |
| `read_docs` | Doku-Artikel | Markdown |
| `senify_feedback` | Feedback zu Tools/Doku melden (Artefakt 11) | Bestätigung + Referenz |

### Schreiben (`write` — drafts-first)
| Tool | Zweck | Notes |
|---|---|---|
| `apply_mutations` | Batch kanonischer Mutationen (01) | `{ baseDraftVersion, mutations[], dry_run? }` → `{ newDraftVersion, undoBatchId, warnings[] }` |
| `create_page` | Neue Seite (Pfad, Titel) | → leere NodeTree + Draft |
| `update_theme` | Theme-Werte ändern (07) | Token-Mutationen |
| `upload_asset` | Bild/Video hochladen | → Asset-ID für `assetRef` |
| `update_asset` | Alt-Text/Meta ändern | Alt-Text als empfohlenes Feld |
| `create_preview` | Draft-Build → Preview | → PreviewId + Token-URL (TTL, 05) |
| `submit_for_review` | Review-Item erzeugen | Preview + Diffs; Hard-Guardrails müssen passen (06) |
| `restore_revision` | Alte Revision → neuer Draft | append-only (05) |

### Review & Lifecycle
| Tool | Zweck | Scope |
|---|---|---|
| `get_review_feedback` | Status/Notizen zum eigenen Review-Item | `read` |
| `publish_release` | Release-Assembly + Publish (05) | `publish` |
| `rollback_release` | Neues Release aus altem Zustand (05) | `publish` |
| `delete_page` | Seite löschen (destruktiv, Audit) | `publish` |

## `apply_mutations` — Vertrag

```jsonc
// Input
{
  "siteId": "…", "pageId": "…",
  "baseDraftVersion": 42,            // optimistisches Locking (09)
  "dry_run": false,
  "mutations": [
    { "op": "insert_node", "parentRef": "…", "index": 2, "nodeSpec": { "type": "stats", … } },
    { "op": "update_node_props", "id": "n_ab12", "patch": { "title": "…" } }
  ]
}
// Erfolg
{ "newDraftVersion": 43, "undoBatchId": "u_…", "warnings": [] }
```

**Fehlerformat (strukturiert, agentenlesbar):**

```jsonc
{ "error": {
  "category": "validation" | "guardrail" | "conflict" | "auth" | "not_found",
  "message": "max 1 Pin-Preset pro Seite — „sticky-stack“ in Abschnitt 3 kollidiert mit „scrub-pin“ in Abschnitt 5",
  "opIndex": 1, "field": "motion.preset",
  "suggestion": "Entferne eines der Pin-Presets oder senke die Intensity auf < 4 (kein Pin)."
} }
```

- **Atomar:** nichts wird geschrieben, wenn eine Mutation oder ein Guardrail fehlschlägt (transaktional; Undo-Batch erst bei Erfolg).
- **`dry_run: true`:** vollständige Validierung + Guardrails ohne Schreiben → Agenten prüfen ihre Absicht vorab.
- **Konflikt (`conflict`):** `baseDraftVersion` veraltet → „Draft hat sich geändert; lade `get_page` neu und retry".
- **Warnings:** weiche Hinweise (03) kommen als `warnings[]` zurück, blocken nicht.

## Guardrail-Durchsetzung im Tool-Flow

- Hard-Checks (Pin ×1 · Parallax ×2 · keine Scroll-Listener · RM-Pflicht) laufen **bei jeder schreibenden Mutation** (auch `dry_run`) und erneut beim `submit_for_review` (06).
- Fehlermeldungen sind **Handlungsanweisungen** (Anthropic-Tool-Design): Kategorie, Fundstelle, Vorschlag.
- Scope-Fehler (04): `auth` mit klarer Bitte, ein Token mit benötigtem Scope anzulegen.

## Anschlüsse

| Bereich | Ticket |
|---|---|
| Skills/Skillpaket referenzieren Tools + Katalog (Golden-Beispiele) | 11 |
| Portal-Doku: Reference-Seiten pro Tool (aus diesem Artefakt generiert) | 12 |
| Media-Tools wachsen mit der Pipeline | 15 |
| Review-Feedback-Schleife | 06 |
