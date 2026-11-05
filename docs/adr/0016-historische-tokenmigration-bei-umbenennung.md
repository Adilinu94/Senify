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
4. Die Umbenennung selbst bleibt vorerst ein getrennter externer Schritt mit
   eigenem Undo/Redo. Sie wird erst dann ein Eintrag der gemeinsamen History,
   wenn die Pipeline eine dokumentändernde externe Bestätigung atomar
   übernehmen kann (siehe Issue 09). Ein bloßes Erhalten der History ohne
   Migration ist ausgeschlossen.

## Folgen

- Ein Undo/Redo lokaler Schritte nach einer Umbenennung verwendet den neuen
  Namen.
- Bei CSS-Textverweisen in alten Patches bleibt das bisherige sichere Verhalten:
  die History wird verworfen.
- Die gemeinsame History zeigt die Umbenennung noch nicht als eigenen Eintrag;
  dieser Rest ist in Issue 09 mit dem fehlenden Pipeline-Vertrag dokumentiert.
