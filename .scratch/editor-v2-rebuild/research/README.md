# Senify Editor v2 — Recherche-Paket

**Stand:** 17.09.2026 · **Auftrag:** Sehr genaue Analyse des editor-v2-rebuild, Unterschiede zu
Instatic, Vor-/Nachteile, konkrete Verbesserungen am Bauplan.

| Datei | Inhalt |
|---|---|
| s01-analyse.mds | Tiefenanalyse nach Code-Lektüre: Store/Schreibtor, Save-Pfad über die Bridge, Compiler/Kaskade, Canvas, Migration, DB-Schema, MCP, Haut, Plan-Dokumente — inkl. **Korrekturen der ersten Fassung** (§1) und Instatic-Vergleich (§3) |
| s02-bauplan-aenderungen.mds | **Die Antwort auf „Was würdest du am Bauplan ändern?"** — 12 priorisierte Änderungen (B1–B12) mit Code-Beleg, Begründung und Reihenfolge; plus „Was ich bewusst NICHT ändern würde" |

## Die drei wichtigsten Erkenntnisse der Vertiefung

1. **Der Save-Pfad ist die eigentliche Stärke:** Der Canvas hat keinen eigenen Persistenzweg —
   seditor-bridge.tss übersetzt v2-Ops in Section-Mutations, und jeder Schreibvorgang erbt
   Konflikt-Check, Version-Bump, Audit-Log (inkl. serverseitigem sundo_patchs) und Guardrails.
   svalidateDocuments prüft nach **jedem** Schreiben 14 Invarianten über das ganze Dokument.
2. **Die Risiken sind Modell-Widersprüche, keine Architekturfehler:** Plan verspricht acht
   Gerätestationen (Modell kennt drei), s:disableds (Compiler kennt drei States), Layout-Gruppe
   (Vokabular existiert nicht), Style-Rules mit skind/origin/positions (Modell speichert nur
   Wert-Bags). Alle fünf vor Phase 2 billig, danach teuer. Dazu: die v1-Migration verwirft
   stillschweigend das per-Breakpoint-shiddens.
3. **Erste Analyse in vier Punkten korrigiert:** Senify hat eine vollständige Media-Welt
   (Backend + 6 MCP-Tools, Alt-Text als SoT auf dem Asset), Releases/Rollback im Schema,
   `sites.style_rules_json` liegt uncommittet im Arbeitsbaum (nicht in HEAD), und der Ganzdokument-Check ist eine Gate-Härte,
   die Instatic fehlt.

## Vergleichsbasis

Instatic-Dokumentation liegt in sRepos/instatic/research/instatic/s (21 Dateien, inkl. s20-editor-ui-walkthrough.mds
und s01-mcp-workflow.mds — die Instatic-Seite der Gegenüberstellungen in §3 der Analyse).
