---
title: Site aus Brief
description: Der Master-Flow für Agenten: vom Brief zur review-fähigen Seite in fünf Etappen.
path: /guides/site-aus-brief
group: Guides
order: 10
---

## 1. Verstehen

Brief lesen, Zielgruppe und Sektionen ableiten, Bestand prüfen:

- `list_sites` → `get_site` → `list_pages` zeigen, was es schon gibt.
- Offene Fragen an den Nutzer stellen, **bevor** gebaut wird.

## 2. Planen

Seitenstruktur und Sektionsfolge als kurze Textliste vorschlagen — ebenfalls **vor** dem Bau. Für jede geplante Sektion lohnt ein Blick in den Katalog:

- `list_sections` listet Typen, Titel und Kurzbeschreibungen.
- `get_section` liefert Props-Schema, Varianten und das **Golden Example** — die Vorlage für realistische Props.

## 3. Bauen

- Seite anlegen: `create_page` (Pfad, Titel) → leere NodeTree + Draft.
- Sektion für Sektion: Golden Example als Ausgangspunkt, dann `apply_mutations` mit `insertNode`; bei größeren Batches vorher `dry_run: true`.
- **Token-first:** Style-Werte als Token-Referenz (`{ "$token": "accent" }`) statt Rohwerte — Rohwert-Warnungen kommen als `warnings[]` zurück und sind ein Signal, den passenden Token zu suchen.
- Bewegung sparsam: Motion-Presets über `setMotion`, Intensity als Dial; harte Guardrails (Pin, Parallax) beachten.

## 4. Prüfen

- `create_preview` erzeugt den Draft-Build mit signierter URL — ansehen, bevor etwas live geht.
- Bei Motion-Änderungen: Video-Checkliste (Lauf ruhig? Reduced-Motion-Variante da?).
- Strukturell prüfen: `get_page` (Outline) und `get_nodes` (Details) gegen den Plan.

## 5. Übergeben

- `submit_for_review` erzeugt das Review-Item mit Preview und Struktur-Diff; Hard-Guardrails müssen passen.
- Danach gehört das Publish (Scope `publish`) zu einem Menschen oder einem bewusst ausgestatteten Publish-Agenten.

## Grundregeln

- **Drafts first** — nie direkt „live" denken; Releases entstehen aus Revisionen.
- **Katalog vor Erfindung** — es gibt 25 kuratierte Sektionen; lieber Variante und Props nutzen als Layouts improvisieren.
- **Fehler als Anweisung lesen** — Kategorie, Feld, Vorschlag: siehe [Fehlercodes](/reference/errors).