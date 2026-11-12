# Chocolate-Importtest — Map

Quelle: `https://chocolate-attributes-385353.framer.app/` (10 Seiten),
Site `4nWfjA3Kq1IUfD`. Handoff vom 12.11.2026, elf Befunde.

- Bericht (alle Befunde 1–11, Belege, Grenzen): [bericht.md](bericht.md)
- Messwerkzeuge: `.scratch/choc-*.mts`/`.mjs` (versioniert); Messergebnisse
  (JSON/PNG) liegen lokal unter `.scratch/` und sind nicht versioniert.

## Folgetickets (Fidelity-Lücken, Ursache belegt, Korrektur offen)

| Nr. | Ticket | Label |
|---|---|---|
| 01 | [Icon-Farbe und Icon-Maske](issues/01-icon-farbe.md) | 01a umgesetzt, 01b wontfix (gemessen) |
| 02 | [Karten-Stapel Home Tablet/Mobil](issues/02-karten-stapel.md) | gelöst durch 05 |
| 03 | [Formular-Selects /contact](issues/03-formular-selects.md) | ready-for-human (Produktfrage) |
| 04 | [Klick-Menü Mobil](issues/04-klick-menue.md) | ready-for-human (Produktfrage) |
| 05 | [Gerätepaarung: generische Klassen, überlappende SSR-Kopien](issues/05-geraetepaarung.md) | umgesetzt 12.11.2026 |

## Kontextpointer

- Befund 2 (Überschriften): Entscheidung „Import korrigiert Ebene“,
  `normalizeHeadingLevels` in `packages/framer-import/src/mapper.ts`,
  Finding-Kind `heading-levels` in `packages/framer-import/src/ir.ts`.
- Befund 11 (Flackertests): `classSearchQuery` in
  `packages/editor/src/inspector/inspector.ts`, Dual-Path-Poll in
  `packages/app/test/elements-panel-browser.test.ts`.
- Animations-Granularität: ADR-0029 (Element-Presets statt Per-Span).
- Verwandte Arbeit: `.scratch/motion-import/` (Hover, Reduced Motion),
  `.scratch/framer-import/issues/07-responsive-bildgroessen.md`.