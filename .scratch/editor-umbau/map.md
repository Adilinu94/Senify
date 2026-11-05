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
- Vorbereitung in `b0f55cc` gesichert; Arbeitsbaum danach leer geprüft. Doku-/Patch-Gate grün.
- Abgeschlossen 02: Unknown-/Retry-/Reload-Sperrerhalt einschließlich Dokumentwechsel und Storage-Fehler; gezielter History-/State-/Variablen-/Canvas-Gate, Typecheck, Lint und Doku-/Patch-Gate grün. Siehe Issue 02.
- Abgeschlossen 03: additive Async-Session-Navigation für registrierte externe Einträge; Cursor, Dokument und Versionen gemeinsam erst nach Bestätigung. Gezielter History-/State-/Variablen-/Canvas-Gate, Typecheck und Lint grün; Gegenreview ohne verbleibende Befunde im Library-Scope. Siehe Issue 03.
- Abgeschlossen 04: Backend-Delete/Restore-Vertrag für vollständig zurückgenommene Zwischenänderungen, feste Request-Basis und gespeicherte Restore-Ergebnisversionen. Rohinhaltsschutz der Registry nach rot/grüner Regression ergänzt; Migration/Backup, PostgreSQL-Konkurrenz und Rollback gegatet. Gegenreview ohne verbleibende Befunde im Backend-Scope; siehe Issue 04.
- Abgeschlossen 05: Canvas verwendet dieselbe Session für Toolbar und beide Shortcut-Ebenen; additive Async-Methoden, Sperren, Status und Cleanup im Browser gegatet. Gegenreview-Korrektur für stehenbleibenden Retry-Status rot/grün abgesichert; vollständiger vereinbarter Gate nach letztem Diff grün. Siehe Issue 05.
- Abgeschlossen 06: geprüfte JSON-Checkpoints für bestätigte gemischte History und Cursor; Context-/Versionsbindung, vollständige Patch-/Node-Struktur und bidirektionales Replay vor atomarem Import. Sicherheits- und Metadatenbefunde rot/grün korrigiert; History-/State-/Browser-Gate, Typecheck, Lint und Graphify AST-Update grün. Siehe Issue 06.
- Abgeschlossen 07: App-Anbindung für Delete/Restore mit gemischter History, persistierten Belegen, fester Retry-Basis, Reload und ausdrücklicher Recovery. Der Klassen-Browsertest deckte zusätzlich eine Order-Divergenz zwischen lokaler Seiten-Teilmenge und vollständiger Site-Registry auf; Reorder- und Delete/Restore-Reihenfolge werden jetzt aus Serverantwort beziehungsweise bekannter Position reconciled. Echte App-/Klassen-/Konflikt-/Canvas-Browser 268 bestanden in 13 Dateien, Engine-In-Memory 69 bestanden mit 18 erwarteten Skips, Engine-PostgreSQL 87 bestanden ohne Skips, Typecheck und Lint grün. Siehe Issue 07 und `review-07.md` Runde 13.
- Nächste Scheibe: 08 – rückwärtsverträgliche Registry-Inhaltsbelege für Rename; danach Tokenmigration, atomare History-Sprünge und weitere Elementor-/Framer-Abnahmen.

## Abdeckung der Übergabe

| Paket | Handoff | Status | Abnahme |
|---|---|---|---|
| Vorhandene externe History absichern | Arbeitsregeln, §56–75 | geprüfte Vorbereitung; siehe Issue 01 | History-, Store-, Pipeline-, Session- und Variablen-Browser-Tests; Typecheck, Lint, Doku-Gate, Patch-Gate |
| Async Undo/Redo und History-Sprünge | §67–68, §73 | Library und Canvas geprüft (Issues 03, 05); App-Runner und atomare Sprünge offen | gemischte Page-/Klassen-/Token-Schritte; Cursor erst nach Bestätigung; Fehler ohne Teilnavigation |
| Speicherreihenfolge und konkurrierende Eingaben | §69, §73 | Library-Schutz geprüft (Issue 03); durchgängiger App-Vertrag offen | laufende Pipeline, Eingabe während Anfrage, Fremdänderung und unvollständige Antwort |
| Historische Token-Verweise und Rename | §70, §73 | offen | Forward- und Undo-Patches für Page, Klasse, Struktur, Breakpoint und Zustand in beiden Richtungen |
| Belege, Antwortverlust, Reload und bewusster Ausweg | §71 | Sperrerhalt und Library-Checkpoints geprüft (Issues 02, 06); gemeinsame App-History-Belege noch offen | Session Storage, Idempotenz, Retry, ältere Belege, Migration und Backup/Restore |
| Delete/Restore getrennt abnehmen | §72 | Backend geprüft (Issue 04); App-History offen | Versions-/Rohinhaltsbedingungen, Request-Bindung, mehrere Pages, Migration/Backup, PostgreSQL-Sperren und Rollback |
| Referenzinventar festhalten | §79 | offen | installierte Core-Version, echte Abläufe und Screens; Pro ausdrücklich getrennt |
| Katalog, Inspector, Navigator und Bedienung | §80 | offen | Controls, Einheiten, Zustände, Responsive, Komponenten, Interaktionen, Tastatur und Accessibility gegen Inventar |
| Weitere Token-Typen und API-/Build-Konsistenz | §81 | offen | sichere Migration, Verwendung, Editor, MCP, Canvas und statischer Build |
| Lokale Styles, Klassen und Framer-Kaskade | §43, §82 | offen | nachvollziehbare Migrationsentscheidung; vorhandene Projekte, Breakpoints und Zustände unverändert erhalten |
| Echte Framer-Site abnehmen | §83 | offen | mehrere Pages, CMS, Assets, Runtime-Freiheit, Responsive, Interaktionen und Motion gegen Original |
| Gesamtabnahme und Dokumentationsabgleich | §84–108 | offen | erforderliche Voll-, Coverage-, Browser-, PostgreSQL-, Visual-, Parity- und Import-Gates mit abgegrenzter Evidenz |

## Grenzen

Die Core-Referenz allein belegt keine Pro-Parität. Dynamische und externe Referenzen benötigen einen ausdrücklich beschriebenen Sicherheitsvertrag; eine direkte Verwendungsliste ist kein Vollständigkeitsnachweis. Offene Felder werden nicht durch eine bloße Statusänderung geschlossen.
