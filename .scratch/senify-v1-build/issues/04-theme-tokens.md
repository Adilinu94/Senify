# 04: Theme & Design-Tokens

**What to build:** Das Token-System: zwei Ebenen (Primitive → Semantik) über 6 Skalen (Farbe, Typo, Spacing, Radius, Shadow, Motion), Skalen-Engine (Shade-Scale, fluide Typo-Skala, Springs als `linear()` + JS-Spring) mit einzeln überschreibbaren Werten, Light/Dark strukturell, DTCG-nahes JSON als Quelle → CSS-Variablen + Tailwind-v4-Theme, kuratierte Fonts self-hosted (woff2, preload, `font-display: swap`). Theme-Operationen (get/update_theme) laufen kanonisch, agententauglich und landen im Audit; ein „Theme-Draft" ist vorführbar im Bake.

**Blocked by:** 03 (Section-Library).

**Status:** umgesetzt (voller `pnpm verify` grün; Theme und Tokens speisen Bake, Editor-Panels und die Ableitung aus Referenzen)

- [x] Theme-JSON (primitives/semantic/modes/fonts/motion) ist Gesamtquelle; Build erzeugt CSS-Variablen und Tailwind-Mapping 1:1
- [x] Skalen-Engine generiert Farbskalen/fluide Typo/Spacing-Stufen aus wenigen Eingaben; Overrides gewinnen einzeln
- [x] Light/Dark über semantische Rollen + `data-theme` schaltbar (Site kann Light-only bleiben)
- [x] Sektionen referenzieren nur semantische Rollen (Gate: keine Roh-Hex-Werte in Props) — Verstöße werden im Report gelistet
- [x] `get_theme`/`update_theme` funktionieren über die Engine-API mit Audit; Fonts sind self-hosted im Build
- [x] Kontrast-Checks gegen Token-Paare sind ableitbar (Grundlage für die Check-Pipeline)

Quellen: `artifacts/07`, Spec „Token- & Theme-System".

## Comments

- **15.09.2026 · implementiert**: Neues Paket `@senify/tokens` (Schema, `color.ts` sRGB↔OKLCH, `scales.ts` Shade-Ladder 50–900/fluid-Clamp/Type-Rollen/Spacing-Raster/Radius/Shadow/Spring→`linear()`, `resolve.ts` Ref-Auflösung mit Ketten + Override-Merge, `emit.ts` CSS-Variablen + `data-theme` + `@font-face` + Tailwind-`@theme`, `contrast.ts` WCAG-Ratios, `default-theme.ts` kuratiertes Default-Theme, `merge.ts` Deep-Merge mit Null-löscht). Engine: `themes`-Tabelle (site_id UNIQUE, Cascade), Auto-Theme je Site (`sites.theme_id` gesetzt), `GET/PUT /api/sites/:id/theme` (Merge + Validierung + Version + Audit `update_theme`), `GET .../theme/report` (Literal-Gate, Broken-Refs, Kontrast-Paare light+dark), `Store.listSiteAudit` (Site-Activity-Basis für T12).
- **Entscheidungen**: `$token`-Refs lösen semantisch → light → dark → primitiv auf (Ketten, Zyklen-gesichert); Alpha-Refs emittieren `color-mix()`; Theme-Updates sind Last-Write-Wins ohne `baseVersion` (nur Drafts haben Konfliktschutz — Spec); leere Patches → 400; Fonts als Metadaten-Modell (Sora/Inter, woff2-`files`-Map, `swap`, Preloads) — echte Font-Dateien kommen per Media (T15), bis dahin System-Fallbacks; Springs als kuratierte CSS-Strings + synthetisierte `linear()`-Stützstellen (Sampling der analytischen Federlösung) + Roh-Params für JS-Springs (T05); `audit_entries.page_id` nullable für Site-Level-Einträge (Audit überlebt Deletes); Fonts/Scales ohne Dateien rendern ohne `@font-face` (kein 404-Risiko).
- **Offen für später**: `update_theme` ohne `dry_run`; Kontrast-Gates in der Check-Pipeline (T07); Tailwind-`@theme`-Namespaces für `duration`/`spacing` sind gemappt, Utility-Generierung ist Tailwind-Sache; `warnings[]`-Oberfläche für Theme-Validierung existiert nur als 400-Fehler.
- **15.09.2026 · Kombi-Review (Standards + Spec) + Fixes**: Spring-Dauer-Formel korrigiert (`springDurationMs`-Helper, bouncy ≈ 670 ms, overdamped-Zweig ohne Oszillation); `validateTheme` prüft Scale-Inputs vorab (400 mit `scales.*`-Pfaden statt 500); Alpha tragende Farben werden explizit abgelehnt statt still verworfen; `updateTheme` läuft in `withTransaction` (Theme-Update + Audit atomar). Dazu: `fonts.mono?` + `motion.stagger?` (optional, emittiert), Font-Format aus Endung + Preload-`crossorigin`-Vertrag, alle Theme-Issues im Fehlertext gezählt, Light-only-Test, Gamut-Distinktheits-Test, Zyklen-Test, `getTheme`-Lazy-Kommentar, Report-Farb-Scope-Kommentar.
