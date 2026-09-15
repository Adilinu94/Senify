# 07: Lifecycle, Review & Checks

**What to build:** Versionierung und Kontrolle: Revisionen pro Page (immutable) + Release (alle Seiten + Theme-Snapshot, append-only, Rollback mit `basisReleaseId`), echte Draft-Build-Previews mit Token-URL + TTL 30 Tage. Agent-Submit (`submit_for_review`) erzeugt das Review-Item mit Struktur-Diff, Screenshot-Diff (betroffene Seiten × 3 Breakpoints, Vorher/Nachher, Motion eingefroren) und Motion-Video (nur bei Motion-Änderungen); Aktionen Approve (→ Publish-Flow mit Bake + Swap) / Request changes (Pflicht-Notiz in den Thread) / Discard (Draft-Restore). Hard-Guardrails (max 1 Pin, max 2 Parallax, keine Scroll-Listener, RM-Pflicht) blockieren Schreiben und Submit; die Check-Pipeline (kaputte Links, Alt-Texte, Kontrast, Meta, JSON-LD — hart; Lighthouse/CWV, Bundles — weich) läuft dreistufig. Screenshot-Harness nach `research/29`: CSS-Freeze-Injection, Scroll-Settle, per-Slice-Diffs, Section-Höhen zuerst.

**Blocked by:** 05 (Renderer & Bake), 06 (MCP-Kern & Agent-Setup).

**Status:** ready-for-agent

- [ ] Flow „Mutationen → Preview → Submit → Approve → Release → Bake → Swap" funktioniert komplett; Preview-URL signiert + TTL-Cleanup
- [ ] Rollback erzeugt ein neues Release aus altem Zustand (`basisReleaseId`); Restore einer Revision erzeugt einen neuen Draft (nichts wird überschrieben)
- [ ] Review-Item enthält Struktur-Diff (jsondiffpatch), Screenshot-Diffs (3 Breakpoints, Motion eingefroren per CSS, GPU-Bereiche maskiert) und optional Motion-Video; unveränderte Seiten werden übersprungen
- [ ] Request changes schreibt Pflicht-Notiz in den Thread (`get_review_feedback`); Discard stellt den Draft-Stand vor dem Block wieder her (Historie bleibt)
- [ ] Hard-Guardrails blockieren Schreiben + Submit mit strukturierten Fehlern (Kategorie, Fundstelle, Vorschlag); weiche Metriken erscheinen als Hinweise im Review-Tab „Checks"
- [ ] Check-Pipeline läuft dreistufig (Schreiben/Submit/Publish); Release-Gate hart, Report weich; Ergebnisse im Release-Audit
- [ ] MCP-Workflow-Test: „Review-Loop" inkl. Request changes → Nachbesserung → Approve; Discard-Pfad

Quellen: `artifacts/05`, `artifacts/06`, `artifacts/03` (Guardrails), `artifacts/13`, `research/29` (§6 QA-Harness), Spec „Lifecycle & Review", „Guardrails, Profile & Checks".
