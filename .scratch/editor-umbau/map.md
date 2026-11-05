# Editor-Umbau: Arbeitsübersicht

Status: claimed

## Auftrag

Alle offenen Punkte aus `HANDOFF-2026-11-05.md` in überprüfbaren Scheiben bearbeiten. Diese Übersicht ist Arbeitsmaterial, kein Produktstatus. Verbindliche Reihenfolge, Gates und Ist-Stand bleiben in `docs/fahrplan.md` und `docs/current/`.

## Arbeitsprotokoll

- Ziel: nachgewiesene Editor-Abläufe und Framer-Erhalt, nicht bloß vorhandene UI oder grüne Teiltests.
- Kern: lokale Eingaben erhalten; History-Cursor und bestätigter Serverstand dürfen nicht auseinanderlaufen.
- Geprüft 01: HEAD `125f6c9`; acht vorhandene uncommittete Dateien betreffen die externe History. Der ursprüngliche Diff ist zusätzlich unter `C:/Users/adini/AppData/Local/Temp/opencode/senify-editor-history-original-20261105.patch` gesichert.
- Abgeschlossen 01: gezielte Ausgangs-Gates, rot/grüne Regressionen und Gegenreview der History-Vorbereitung; Unit-/Browser-Gate, Typecheck und Lint grün. Doku-Abgleich berücksichtigt die noch offenen Async-Grenzen und korrigiert veraltete aktive Mapper-Hinweise (Mapper-Commit `0193fde`).
- Offen: vollständiger Async-Vertrag; Core-/Pro-Referenz; Migrationsentscheidung zur Kaskade; vollständige Import-Abnahme.
- Nächster Schritt: nach Doku-/Patch-Gate und Schritt-Commit die serverbestätigte Async-Navigation als begrenzten Kernvertrag implementieren; danach App-Integration und die übrigen Pakete.

## Abdeckung der Übergabe

| Paket | Handoff | Status | Abnahme |
|---|---|---|---|
| Vorhandene externe History absichern | Arbeitsregeln, §56–75 | geprüfte Vorbereitung; siehe Issue 01 | History-, Store-, Pipeline-, Session- und Variablen-Browser-Tests; Typecheck, Lint, Doku-Gate, Patch-Gate |
| Async Undo/Redo und History-Sprünge | §67–68, §73 | offen | gemischte Page-/Klassen-/Token-Schritte; Cursor erst nach Bestätigung; Fehler ohne Teilnavigation |
| Speicherreihenfolge und konkurrierende Eingaben | §69, §73 | offen | laufende Pipeline, Eingabe während Anfrage, Fremdänderung und unvollständige Antwort |
| Historische Token-Verweise und Rename | §70, §73 | offen | Forward- und Undo-Patches für Page, Klasse, Struktur, Breakpoint und Zustand in beiden Richtungen |
| Belege, Antwortverlust, Reload und bewusster Ausweg | §71 | offen | Session Storage, Idempotenz, Retry, ältere Belege, Migration und Backup/Restore |
| Delete/Restore getrennt abnehmen | §72 | offen | eigene Versions-/Inhaltsbedingungen, mehrere Pages, PostgreSQL-Sperren und Rollback |
| Referenzinventar festhalten | §79 | offen | installierte Core-Version, echte Abläufe und Screens; Pro ausdrücklich getrennt |
| Katalog, Inspector, Navigator und Bedienung | §80 | offen | Controls, Einheiten, Zustände, Responsive, Komponenten, Interaktionen, Tastatur und Accessibility gegen Inventar |
| Weitere Token-Typen und API-/Build-Konsistenz | §81 | offen | sichere Migration, Verwendung, Editor, MCP, Canvas und statischer Build |
| Lokale Styles, Klassen und Framer-Kaskade | §43, §82 | offen | nachvollziehbare Migrationsentscheidung; vorhandene Projekte, Breakpoints und Zustände unverändert erhalten |
| Echte Framer-Site abnehmen | §83 | offen | mehrere Pages, CMS, Assets, Runtime-Freiheit, Responsive, Interaktionen und Motion gegen Original |
| Gesamtabnahme und Dokumentationsabgleich | §84–108 | offen | erforderliche Voll-, Coverage-, Browser-, PostgreSQL-, Visual-, Parity- und Import-Gates mit abgegrenzter Evidenz |

## Grenzen

Die Core-Referenz allein belegt keine Pro-Parität. Dynamische und externe Referenzen benötigen einen ausdrücklich beschriebenen Sicherheitsvertrag; eine direkte Verwendungsliste ist kein Vollständigkeitsnachweis. Offene Felder werden nicht durch eine bloße Statusänderung geschlossen.
