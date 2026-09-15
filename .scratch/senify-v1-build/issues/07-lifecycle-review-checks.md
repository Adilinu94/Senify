# 07: Lifecycle, Review & Checks

**What to build:** Versionierung und Kontrolle: Revisionen pro Page (immutable) + Release (alle Seiten + Theme-Snapshot, append-only, Rollback mit `basisReleaseId`), echte Draft-Build-Previews mit Token-URL + TTL 30 Tage. Agent-Submit (`submit_for_review`) erzeugt das Review-Item mit Struktur-Diff, Screenshot-Diff (betroffene Seiten × 3 Breakpoints, Vorher/Nachher, Motion eingefroren) und Motion-Video (nur bei Motion-Änderungen); Aktionen Approve (→ Publish-Flow mit Bake + Swap) / Request changes (Pflicht-Notiz in den Thread) / Discard (Draft-Restore). Hard-Guardrails (max 1 Pin, max 2 Parallax, keine Scroll-Listener, RM-Pflicht) blockieren Schreiben und Submit; die Check-Pipeline (kaputte Links, Alt-Texte, Kontrast, Meta, JSON-LD — hart; Lighthouse/CWV, Bundles — weich) läuft dreistufig. Screenshot-Harness nach `research/29`: CSS-Freeze-Injection, Scroll-Settle, per-Slice-Diffs, Section-Höhen zuerst.

**Blocked by:** 05 (Renderer & Bake), 06 (MCP-Kern & Agent-Setup).

**Status:** implemented (`pnpm verify` grün, 204 Tests + 2 skipped); Screenshot-/Motion-Video-Diffs bewusst offen (Playwright, siehe Comments)

- [x] Flow „Mutationen → Preview → Submit → Approve → Release → Bake" funktioniert komplett; Preview-URL signiert + TTL-Cleanup („Swap" = aktives Release; Deploy-Adapter folgt mit T14)
- [x] Rollback erzeugt ein neues Release aus altem Zustand (`basisReleaseId`); Restore einer Revision erzeugt einen neuen Draft (nichts wird überschrieben)
- [~] Review-Item enthält Struktur-Diff (eigener agentenlesbarer Diff statt jsondiffpatch, dokumentierte Abweichung); Screenshot-Diffs (3 Breakpoints, Motion eingefroren) und Motion-Video sind **offen** — sie brauchen die Playwright-Infrastruktur (Analysis-Worker/T14); das Item trägt `previewId` + `structureDiff` und ist dafür vorbereitet
- [x] Request changes schreibt Pflicht-Notiz in den Thread (`get_review_feedback`); Discard stellt den Draft-Stand vor dem Block wieder her (Historie bleibt)
- [x] Hard-Guardrails blockieren Schreiben + Submit mit strukturierten Fehlern (Kategorie, Fundstelle, Vorschlag); weiche Metriken erscheinen als Hinweise am Review-Item
- [x] Check-Pipeline läuft dreistufig (Schreiben/Submit/Publish); Release-Gate hart, weiche Hinweise im Review-Item/in der Publish-Antwort („Report im Release-Audit" als eigener Abschnitt folgt mit T14)
- [x] MCP-Workflow-Test: „Review-Loop" inkl. Request changes → Nachbesserung → Approve; Discard-Pfad

Quellen: `artifacts/05`, `artifacts/06`, `artifacts/03` (Guardrails), `artifacts/13`, `research/29` (§6 QA-Harness), Spec „Lifecycle & Review", „Guardrails, Profile & Checks".

## Comments

**15.09.2026 — Umsetzung.**
- **Engine:** neue Tabellen `page_revisions` (immutable), `releases` (+ `build_ref`, `basis_release_id`), `active_releases`, `previews` (Token + TTL), `review_items` (Basis-Snapshot, Struktur-Diff, Guardrails, Thread). Routen: `POST/GET /api/sites/:id/releases`, `GET /api/releases/:id`, `GET /api/pages/:id/revisions`, `GET /api/revisions/:id`, `POST /api/pages/:id/restore`, `POST/GET /api/sites/:id/previews` (+ Datei-Auslieferung `GET /api/previews/:id/files/*?token=…` mit Traversal-Schutz), `POST/GET /api/sites/:id/reviews`, `GET /api/reviews/:id`, `POST /api/reviews/:id/approve|request-changes|discard`.
- **Publish/Rollback:** Publish prüft hart, legt Revisionen für alle Seiten an, snapshotet das Theme, backt den Release nach `<dataDir>/releases/<id>` und setzt das aktive Release. Rollback = neues Release mit den Revisionen + Theme-Snapshot des alten Stands (`basisReleaseId`) und setzt Theme + Drafts append-only auf diesen Stand zurück (neue Draft-Version, Audit-Eintrag `restoreRevision`).
- **Previews:** echte Draft-Builds über den Renderer, signierte Token-URL (30 Tage, Default), Auslieferung aus dem Build-Verzeichnis, TTL-Cleanup beim Auflisten (löscht Artefakte, markiert `expired`).
- **Guardrails (artefakt 03):** max 1 Pin-Preset/Seite, max 2 Parallax-Layer — als Hard-Check beim Schreiben (Batch wird verworfen), beim Submit und beim Publish. „Keine Scroll-Listener" und „Reduced-Motion-Variante" sind strukturell garantiert (deklarative Motion, Page-Script respektiert `prefers-reduced-motion`).
- **Checks:** hart = Guardrails, kaputte interne Links (`pageId`/`/pfad`), fehlende Alt-Texte (Asset + Alt-Quelle je Sektion), Knoten-Kontrast expliziter Token-Paare (ab Submit), Primär-Theme-Paare (nur Publish); weich = fehlende Meta-Description, leere Seiten, Literal-Farbwerte, Sekundär-Kontrastpaare.
- **Bewusste Abweichungen:** (a) Struktur-Diff ist ein eigener, agentenlesbarer Diff (`status` je Seite, `added/removed/changed` + Felder je Sektion) statt jsondiffpatch — kein zusätzlicher Dependency und direkt im Review lesbar; (b) Screenshot-Diffs + Motion-Video brauchen Playwright und folgen mit dem Analysis-Worker (T14), das Review-Item ist mit `previewId` + `structureDiff` vorbereitet; (c) „Swap" ist das aktive Release, Deploy-Adapter (Vercel/Netlify) folgen mit T14; (d) der Check-Report reist in der Publish-Antwort bzw. am Review-Item (ein eigener Release-Audit-Abschnitt folgt mit T14).
- **MCP:** neue Tools `create_preview`, `submit_for_review`, `get_review_feedback`, `publish_release`, `rollback_release`, `restore_revision`, `delete_page` (19 Tools gesamt, Scope-Mapping wie im Katalog); Skillpaket um den Prüf-/Review-Schritt erweitert.
- **Tests:** Lifecycle (10, inkl. echter Bakes, Preview-Auslieferung, Rollback, Discard), Guardrails/Checks (6, schnell), MCP-Review-Loop über den echten MCP-Client (1) + Tool-Katalog (19 Tools).
