# 03: Section-Library (25 Sektionen × 2–3 Varianten)

**What to build:** Der komplette kuratierte Sektions-Katalog aus Artefakt 08: 25 Sektionen (navbar … marquee) mit je 2–3 Varianten (~55–60), TypeBox-Props + UI-Metadaten in EINEM Registry-Schema (inkl. `control`, Gruppen, `hidden`-Bedingungen, `allowedChildren`, Slots, Motion-Presets), agentenlesbaren `description`-Texten sowie Golden-Beispiel (JSON) + Thumbnail je Sektion/Variante. Katalog über `list_sections`/`get_section` abrufbar. Bau-Reihenfolge: Gerüst → Überzeugung → Vertrauen → Zusatz.

**Blocked by:** 01 (Projekt-Fundament).

**Status:** ready-for-agent

- [ ] Alle 25 Sektionen sind registriert, TypeBox-validiert und über die Registry-API abrufbar (Typ, Titel, Kurzbeschreibung)
- [ ] Jede Sektion hat 2–3 Varianten mit Preset-Probs und mindestens ein Golden-Beispiel-JSON, das ohne Fehler durch die Validierung läuft
- [ ] UI-Metadaten (Control-Typen, Gruppen, bedingte Sichtbarkeit) sind Bestandteil des Schemas — Editor-Panels sind daraus generierbar
- [ ] Golden-Beispiele rendern im Bake-Test-Harness (Prüfstelle 2) ohne Fehler
- [ ] Thumbnails (3 Breakpoints) existieren je Sektion/Variante

Quellen: `artifacts/08` (Katalog + Registry-Format), Spec „Implementation Decisions".
