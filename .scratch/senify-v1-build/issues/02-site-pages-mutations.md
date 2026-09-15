# 02: Site & Pages + kanonische Mutations

**What to build:** Der vertikale Kern: Eine Site (Projekt) anlegen, eine Seite anlegen und deren NodeTree über die Engine-API bearbeiten — ausschließlich über kanonische, benannte Mutations (insert/delete/duplicate/move/wrap/updateNodeProps/updateNodeMeta/Breakpoint-Overrides/Motion/PageMeta) mit Registry- und TypeBox-Validierung, Undo-Patch und `baseDraftVersion`-Konfliktschutz. Jede Mutation trägt `author` (human/agent) und landet im Audit. Demo: per API eine Seite mit Sektionen aufbauen und einen Konfliktfall sauber abweisen.

**Blocked by:** 01 (Projekt-Fundament).

**Status:** ready-for-agent

- [ ] Site + Page anlegen/laden/löschen; NodeTree flach (rootNodeId + nodes-Map) in Postgres/JSONB persistiert
- [ ] Alle kanonischen Mutations funktionieren einzeln und validiert; ungültige Verstöße (Registry-Nesting, falsche Prop-Typen) liefern strukturierte Fehler mit Feld + Vorschlag
- [ ] `baseDraftVersion`-Konflikt → 409 „Draft hat sich geändert" (kein stilles Überschreiben); Undo-Patch pro Mutation (O(Change))
- [ ] Jede Mutation trägt Author und erzeugt einen Audit-Eintrag
- [ ] Tests an Prüfstelle 1 decken: gültige Mutationen, Fehlerobjekte, Konflikte, Undo-Patch-Erzeugung

Quellen: `artifacts/01` (§2–§5), Spec „Kanonischer NodeTree & Mutations-Vertrag".
