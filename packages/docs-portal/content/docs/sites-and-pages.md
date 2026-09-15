---
title: Sites, Pages & Nodes
description: Das Datenmodell hinter Senify — Sites, Pages, Nodes, Drafts und Releases in der Praxis.
path: /platform/sites-and-pages
group: Platform
order: 10
---

## Die Begriffe

- **Site**: Ein Kunden-Website-Projekt; oberster Container für Pages, Theme und Assets.
- **Page**: Eine adressierbare Seite mit einem NodeTree (Baum aus Nodes).
- **Node**: Eine konkrete Instanz einer Section im Baum — mit Props, Varianten, Overrides und Motion.
- **Section**: Ein registrierter Bautyp im Katalog (`hero`, `pricing`, `faq`, …). Der Katalog steht unter [Sektions-Katalog](/reference/sections).
- **Variant**: Ein kuratiertes Preset einer Section (vorbelegte Props), z. B. `centered` oder `split`.
- **Theme**: Alle Design-Tokens einer Site; Style-Werte referenzieren Tokens (`{ "$token": "accent" }`) oder sind freie Werte.

## Draft-first

Jede Bearbeitung läuft über den **Draft** einer Page:

1. `get_page` liefert die Outline inklusive `draftVersion`.
2. `apply_mutations` schreibt einen Batch atomar — mit `baseDraftVersion` aus Schritt 1, optional `dry_run: true` zum Vorab-Prüfen.
3. Bei Erfolg kommen `newDraftVersion`, `undoBatchId` und `warnings[]` zurück.

Passt die `baseDraftVersion` nicht mehr (jemand hat parallel geschrieben), kommt ein `conflict`-Fehler: Seite neu laden, Batch mit aktueller Version wiederholen.

## Schreiben als Mutationen

Alle Änderungen sind benannte, typisierte Mutationen — dieselbe API nutzen Editor, MCP und Agenten: `insertNode`, `deleteNode`, `duplicateNode`, `moveNode`, `wrapNode`, `updateNodeProps`, `updateNodeMeta`, `setBreakpointOverride`, `clearBreakpointOverride`, `setMotion`, `clearMotion`, `updatePageMeta`.

Zwei nützliche Ergänzungen:

- `get_nodes` lädt Details (vollständige Props, Overrides, Motion) nur für die IDs, die man wirklich braucht — token-effizient nach der Outline.
- Hard-Guardrails (z. B. Pin ×1 pro Seite, Parallax ×2) laufen bei jedem Schreiben, auch bei `dry_run`, und erneut beim Submit.

## Lifecycle

- **Revision**: Unveränderlicher Snapshot einer Page, entsteht beim Publish.
- **Release**: Bündel veröffentlichter Revisionen einer Site.
- **Preview**: Draft-Build mit signierter Token-URL und TTL für die Abnahme.
- **Restore**: Eine alte Revision zurück in den Draft holen (`restore_revision`), ohne Geschichte umzuschreiben.

Der komplette Weg: `create_page` → Sektionen einfügen → `create_preview` → `submit_for_review` → `publish_release`. Rollback legt ein **neues** Release aus einem älteren Zustand an.