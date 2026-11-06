# Canvas an serverbestätigte History anbinden

Type: task
Status: resolved
Blocked by: 03, 04

## Definition of Ready

- Vorangegangener Backend-Gate grün; HEAD `5ba0ca8`, Arbeitsbaum beim Start leer, keine konkurrierende Bearbeitung.
- Scope: Canvas-Option und additive öffentliche Async-Methoden, Toolbar und Tastatur im Hauptdokument und Frame; App reicht ihre vorhandene Session durch.
- Eine mitgegebene Session muss denselben Store verwenden. Bestehende synchrone Methoden bleiben synchron und dürfen keinen externen Write starten.
- Testlücke: echte Canvas-Bedienung eines registrierten externen Eintrags sowie Aktualisierung der Toolbar bei Pipeline-/Runneränderungen ohne Dokumentänderung.

## Vertrag und Abnahme

- Toolbar und Shortcuts verwenden mit Session deren `undoAsync`/`redoAsync`; ohne Session bleibt lokale Navigation bedienbar.
- Öffentliche `undoAsync`/`redoAsync` sind additiv. `undo`/`redo` bleiben lokale Methoden mit boolean-Ergebnis und verweigern externe Grenzen ohne Ausnahme.
- Pending/Unknown sperrt alle Wege. Fehler werden angezeigt, Cursor/Versionen bleiben bis Bestätigung unverändert. History-Sprünge über externe Einträge bleiben gesperrt.
- Browser-Regressionsfälle: gemischte Navigation, äußere und Frame-Shortcuts, Retry/Unknown, Doppelaufruf, Pipeline-Sperre, Eingabe-Race, Destroy und unverändertes synchrones API.
- Gate: History-/Store-/Session-/Pipeline-Unit-Tests und Canvas-/Variablen-Browser-Tests; `pnpm typecheck`, `pnpm lint`, Doku-/Patch-Gate und Graphify AST-Update. Kein neuer Backend-Vertrag in dieser Scheibe.

## Offener Folgeschritt

App-Runner für Delete/Restore, gemeinsame persistierte History und Recovery; Rename-/Tokenmigration und atomare Sprünge separat abnehmen.

## Comments

- Die Session-Option ist additiv; kein zweiter History-Store oder frei kombinierbarer Navigationsadapter.

## Gegenreview, Runde 1

Linsen 1–14: alle öffentlichen Methoden, Toolbar und beide Shortcut-Ebenen; Laufzeit-/Typ-Exports; Pipeline-/Runnerbenachrichtigung, Cleanup, Fehler, Cursor und Versionen; Accessibility und Doku-Grenzen geprüft.

- Testanpassung: vorhandene Sperrregression klickte bisher einen aktiven, wirkungslosen Undo-Button. Sie prüft jetzt den Disabled-Zustand und den weiterhin wirkungslosen Shortcut; Schutzassertions bleiben erhalten (`variables-editor-browser.test.ts`).
- Testlücken geschlossen: Session-/Store-Mismatch, verspätete Antwort nach Destroy und Async-Fallback ohne Session (`canvas-history-browser.test.ts`, `canvas-browser.test.ts`).
- **Medium, korrigiert:** nach direktem Session-Retry blieb die Canvas-Statusmeldung „Verlauf wird geprüft …“ stehen, obwohl die Lease schon bestätigt war (`canvas.ts:updateHistoryChrome`). Die Regression für leeren Status und `aria-busy=false` war gezielt rot und nach der Korrektur grün. Nur die eigene abgeschlossene History-Meldung wird gelöscht; andere Werkzeugmeldungen bleiben erhalten.

## Gegenreview, Runde 2

Linsen 1–14 erneut auf den letzten Diff angewandt: Store-/Session-Identität vor dem Mount, synchrones API ohne externen Write, Async-Fallback, Toolbar nach Runner-/Pipelineänderung, beide Shortcut-Ebenen und Texteingaben, Unknown/Retry, Doppelaufruf, fehlende Bestätigung, Eingabe-Race und verspätete Antwort nach Destroy. Session bleibt extern besessen; Listener und Canvas-Projektion werden entfernt. Status ist als Live-Region beschriftet und beendet `aria-busy` nach Bestätigung. Keine neuen Befunde im Canvas-Scope. Die kontrollierten Runner im Canvas-Test sind ausdrücklich kein echter Delete/Restore-App-Gate.

## Answer

Canvas verwendet die vorhandene Session für Toolbar und Shortcuts; öffentliche Async-Methoden sind additiv. Synchrone lokale Methoden bleiben erhalten. Der vollständige vereinbarte History-/State-/Canvas-/Variablen-Gate lief nach dem letzten Code-Diff am 05.11.2026 grün, ebenso Typecheck und Lint. Graphify AST-Update ausgeführt; Doku-/Patch-Abschlussgate grün. Messzahlen stehen ausschließlich in `docs/current/qualitaet.md`. App-Variablen-Runner, gemeinsame Reload-History, Tokenmigration und atomare Sprünge bleiben Folgearbeit.
