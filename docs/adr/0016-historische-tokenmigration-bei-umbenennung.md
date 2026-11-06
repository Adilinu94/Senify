# 0016 – Historische Tokenverweise bei einer Umbenennung

- Status: angenommen
- Datum: 2026-11-05

## Kontext

Eine bestätigte Variablenumbenennung ersetzt auf dem Server alle erkennbaren
Verweise. Lokale History-Einträge können davor entstanden sein und in ihren
Forward- oder Undo-Patches noch den alten Namen tragen. Würde die History
einfach erhalten, könnte ein Undo/Redo den alten Namen wieder in das Dokument
bringen. Würde sie immer verworfen, verliert der Nutzer ohne Not seine
Bearbeitungsschritte.

## Entscheidung

1. Strukturierte Verweise (`$token`/`$ref` mit exakt `family.oldName`) werden in
   **beiden** Richtungen migriert, also in `mutations` (Forward) und
   `undoPatch`.
2. CSS-Textverweise (`var(--color-…)`/`var(--space-…)`) in einem alten Patch
   gelten als nicht sicher vorhersagbar, weil der Wert im aktuellen Dokument
   nicht mehr vorkommen muss. Taucht ein solcher Verweis auf, wird die lokale
   History bewusst verworfen statt geraten.
3. Erst nach erfolgreicher Migration wird das Server-Dokument übernommen
   (`replaceDocumentPreservingHistory`). Cursor und Eintrags-IDs bleiben
   erhalten.
4. Die Umbenennung ist ein bestätigter externer Eintrag der gemeinsamen History.
   Der erste Schritt und die Navigation übernehmen Dokument, Eintrag und alle
   Versionen atomar (`confirmExternalReplacement`); die Navigation reicht das
   gefetchte Dokument über den externen Controller weiter. Die Reload-Recovery
   importiert die migrierte History und das Dokument gemeinsam
   (`confirmExternalHistoryReplacement`) und erlaubt dabei höchstens einen
   Registry-Sprung. Ein bloßes Erhalten der History ohne Migration ist
   ausgeschlossen.

## Folgen

- Ein Undo/Redo lokaler Schritte nach einer Umbenennung verwendet den neuen
  Namen.
- Bei CSS-Textverweisen in alten Patches bleibt das bisherige sichere Verhalten:
  die History wird verworfen.
- Die gemeinsame History zeigt die Umbenennung als eigenen Eintrag; Undo/Redo,
  Reload, Retry und die explizite Recovery laufen über denselben Lease- und
  Checkpoint-Vertrag wie Delete/Restore.
- Der getrennte Rename-Knopf ist entfallen; Toolbar und Variablenbereich zeigen
  denselben Schritt.
