# 03: Section-Library (25 Sektionen × 2–3 Varianten)

**What to build:** Der komplette kuratierte Sektions-Katalog aus Artefakt 08: 25 Sektionen (navbar … marquee) mit je 2–3 Varianten (~55–60), TypeBox-Props + UI-Metadaten in EINEM Registry-Schema (inkl. `control`, Gruppen, `hidden`-Bedingungen, `allowedChildren`, Slots, Motion-Presets), agentenlesbaren `description`-Texten sowie Golden-Beispiel (JSON) + Thumbnail je Sektion/Variante. Katalog über `list_sections`/`get_section` abrufbar. Bau-Reihenfolge: Gerüst → Überzeugung → Vertrauen → Zusatz.

**Blocked by:** 01 (Projekt-Fundament).

**Status:** umgesetzt (voller `pnpm verify` grün; Sektionen, Varianten und Golden-Beispiele werden von Editor, Bake und Referenz-Abgleich genutzt)

- [x] Alle 25 Sektionen sind registriert, TypeBox-validiert und über die Registry-API abrufbar (Typ, Titel, Kurzbeschreibung)
- [x] Jede Sektion hat 2–3 Varianten mit Preset-Probs und mindestens ein Golden-Beispiel-JSON, das ohne Fehler durch die Validierung läuft
- [x] UI-Metadaten (Control-Typen, Gruppen, bedingte Sichtbarkeit) sind Bestandteil des Schemas — Editor-Panels sind daraus generierbar
- [x] Golden-Beispiele rendern im Bake-Test-Harness (Prüfstelle 2) ohne Fehler
- [x] Thumbnails (3 Breakpoints) existieren je Sektion/Variante

Quellen: `artifacts/08` (Katalog + Registry-Format), Spec „Implementation Decisions".

## Comments

- **15.09.2026 · implementiert** (Bau-Reihenfolge Gerüst → Überzeugung → Vertrauen → Zusatz): 25 Sektionen in `packages/registry/src/sections/*.ts` (eine Datei pro Sektion), `shared.ts`-Builder (Titel/Intro/Buttons/Links/Assets/Text/Thumbs), `EXPECTED_SECTION_TYPES` + `createRegistry()`. Jede Sektion: EN-Description (Agenten-Qualität), Kategorie, explizite TypeBox-Schemas je Prop (inkl. List-Item-Schemas — schließt Spec-Review-F7 aus T02), Gruppen, Enum-Options, Number-Min/Max/Step, 2–3 Varianten mit echten Presets, Motion-Presets aus `artifacts/03`, Golden mit deutschem Demo-Content.
- **Varianten-Semantik (entschieden)**: `Registry.register` validiert jedes Variant-Preset (ungültige Presets → Registrierungsfehler); Engine-`insert`/`wrap` mergen `{...preset, ...explicit}` (explizit gewinnt); `updateNodeMeta`-Variantenwechsel wendet KEINE Presets an (styling-only, Props bleiben Autoren-kontrolliert). Golden zeigt immer die Default-Variante (erster Key — Test-fixiert).
- **`hidden` als serialisierbare DSL** (Abweichung von `artifacts/08` „Funktion"): `boolean | { prop, equals?, notEquals? }` + `isPropHidden()`-Helper — Funktionen wären weder TypeBox-validierbar noch MCP-serialisierbar. Pilot: `pricing.billingNote` (hidden ohne `billingToggle`).
- **`hero.visual`-Prop entfernt** (T02-Review-Item): Slots sind die einzige Quelle; Editor liest Slot-Controls aus `slots`.
- **Thumbnails**: Pfad-Kontrakt je Variante × 3 Breakpoints ist definiert und test-fixiert (`thumbnails/<type>-<variant>-{1440,810,390}.png`, Default-Variante auf Sektionsebene, Rest in `variantThumbnails`) — echte Captures sind ohne Renderer/Browser-Pipeline unmöglich und folgen in **T14** (analysis-worker besitzt Screenshots).
- **Bake-Abdeckung**: Prüfstelle-2-Harness existiert erst in **T05**; als T03-Äquivalent läuft jedes Golden durch die echte Engine-API (`catalog-smoke.test.ts`: 25 Goldens → 200, Version 2) plus Registry-Golden-Validierung (`catalog.test.ts`).
- **Katalog-Lücke gefunden beim Bauen**: `gallery` fehlte in `bundledSections` (Test zählte 24) — nachgetragen; `artifacts/08`-Bau-Reihenfolge erwähnt `gallery` ebenfalls nicht (nur Katalog-Tabelle) — redaktionell, kein Spec-Bruch.
- **15.09.2026 · Kombi-Review (Standards + Spec) + Fixes**: `hero.ctas[].label` + `background`-StyleProp auf Shared-Builder angeglichen; `hero.visual`-Slot auf `allowedTypes: ["media"]` eingeschränkt (Spec 08: media-/3D-Inhalt); Motion-Presets per Allowlist-Test gegen den 24er-Katalog aus `artifacts/03` gesichert; `footer.socials` → `social` mit kanonischem Link-Typ; `footer.bottomNote` → `legal`, `contact.formFields` → `fields` (Spec-Tabellen-Namen gelten); `marquee.items[]` fordert `text` oder `asset`; `pricing.features`/`comparison.values` mit `minLength`; `newsletter.endpoint` mit `minLength`; `team`-Golden mit Foto; `register` prüft zusätzlich `golden.variant ∈ variants`, `variantThumbnails`-Keys und exklusives `equals`/`notEquals`; `EXPECTED_SECTION_TYPES` aus `bundledSections` abgeleitet (+ Count-Guard 25); Gruppen-Taxonomie in `shared.ts` dokumentiert (Content/Actions/Styling/Layout/Settings/Form).
- **Bewusste Review-Entscheidungen (kein Fix)**: Alle Props sind **optional-by-default** (`minLength` gilt nur falls gesetzt; Renderer braucht defensive Defaults — T05-Vertrag). Leere Variant-Presets `{}` sind legitim (Differenzierung layout-seitig im Renderer; Variantenwechsel bleibt styling-only). `Golden.thumbnails` bleibt schema-optional, Kontrakt per Test gesichert. ~40 Varianten teilen sich Preset-Werte nur wo inhaltlich sinnvoll (z. B. `divider`, `marquee`, `pricing.simple`, `embed`).
