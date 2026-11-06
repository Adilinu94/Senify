# 09c – Schrittweise History-Sprünge über externe Einträge

- Status: resolved
- Prio: P1
- Erstellt: 2026-11-06
- Kontext: Issue 09b, `docs/fahrplan.md` (History-Schutz), `docs/current/stand.md`

## Ziel

Ein Klick im Verlauf soll einen beliebigen bestätigten Stand erreichen, auch
wenn der Pfad externe Variablenaktionen enthält. Lokale Schritte laufen sofort,
externe nur nach Runner und sauberem Speicherstand; der Cursor bleibt bei
Ablehnung, Unknown oder einer geänderten Route am letzten bestätigten Schritt.

## Definition of Ready

- [x] Vorheriger Gate (09b) grün, Arbeitsbaum sauber.
- [x] Route, Cursor und externe Lease sind im Controller vorhanden.
- [x] Dialog und Canvas verwenden dieselbe Session.
- [x] Fehlender Runner, unklare Antwort und neue Eingaben sind benannt.

## Umsetzung

- `HistoryStack.routeTo(entryId)` liefert den Pfad in Ausführungsrichtung;
  `canRestoreToAsync` prüft die Existenz, nicht die Ausführbarkeit jedes
  externen Schritts.
- `ExternalHistoryController.restoreTo(entryId)` geht den Pfad schrittweise:
  lokale Schritte über den Store-Patch-Gate, externe über den bestehenden
  Lease-/Runner-/Confirm-Vertrag.
- Vor einem externen Schritt wird eine beschäftigte Save-Pipeline geflusht.
  Nach dem Flush und vor jedem Schritt wird geprüft, ob der Pfad noch auf den
  erwarteten Eintrag zeigt. Neue Eingaben, ein geänderter Cursor oder ein
  Dokumentwechsel stoppen den Sprung, ohne den nächsten Schritt zu starten.
- `canRestoreTo` erlaubt Routen mit registrierten Runnern, solange kein
  Konflikt, Fehler oder nicht speicherbarer Schritt vorliegt. Der Dialog sperrt
  während Lease/Sprung alle Zeilen und zeigt den Status.
- `store.restoreToAsync` bleibt für rein lokale Routen ohne Session nutzbar und
  verweigert externe Schritte ohne Session.

## Gate

- `packages/editor/test/state/external-history.test.ts`: 29 bestanden, darunter
  gemischter Sprung, mehrere externe Schritte, Unknown + Retry, fehlender Runner
  mit späterer Registrierung und eine neue Eingabe während des Flushs.
- `packages/editor/test/history.test.ts`, `state/store.test.ts`,
  `state/session.test.ts`, `state/persist.test.ts`,
  `state/history-checkpoint.test.ts`: zusammen 203 bestanden.
- `packages/app/test/canvas-history-browser.test.ts`: 6 bestanden, darunter ein
  Dialog-Sprung über einen externen Schritt im echten Browser.
- `packages/app/test/variable-history-browser.test.ts`: 20 bestanden, darunter
  ein gemischter Page-/Klassen-/Delete-Sprung vorwärts und rückwärts über den
  Verlauf im echten App-Browser.
- `pnpm typecheck`, `pnpm lint`, `pnpm quality:check` und `git diff --check`
  grün.

## Grenzen

- Ein Sprung ist nicht eine einzelne Datenbanktransaktion: jeder externe Schritt
  bleibt eine eigene bestätigte Serveraktion. Der Abbruch ist verlustfrei, aber
  bereits bestätigte Schritte bleiben bestätigt.
- Fremde Clients und Schreibpfade ohne Versionsangaben bleiben außerhalb dieses
  Vertrags.
- Der Nachweis ersetzt keinen vollständigen `verify`-, Coverage-, Visual-,
  Import-, Parity- oder PostgreSQL-Lane-Gate.
