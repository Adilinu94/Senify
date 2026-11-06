# 09 – Umbenennung in der gemeinsamen History

- Status: resolved
- Prio: P1
- Erstellt: 2026-11-05
- Kontext: `.scratch/editor-umbau/review-07.md`, `docs/adr/0016-historische-tokenmigration-bei-umbenennung.md`

## Ziel

Eine Umbenennung soll die lokale History nicht mehr verwerfen und langfristig
selbst als serverbestätigter Eintrag in der gemeinsamen History erscheinen.

## Definition of Ready

- [x] Verhalten der bestehenden Umbenennung und der lokalen History ist belegt.
- [x] Verweise lassen sich in Forward- und Undo-Patches eindeutig erkennen.
- [x] Sicherer Rückfall für nicht eindeutige CSS-Textverweise ist entschieden.
- [x] Pipeline kann eine dokumentändernde externe Bestätigung atomar übernehmen
      (Dokument, Cursor und vollständiger Versionssatz gemeinsam):
      `confirmExternalReplacement` / `replaceDocumentAndCommitExternal`, mit
      zwei Tests für atomare Sichtbarkeit und abgewiesene Basis/Versionssprünge.

## Teil 09a – History erhalten und migrieren (umgesetzt)

- `HistoryStack.renameReferences(family, oldName, newName)` migriert
  `$token`/`$ref` in beiden Richtungen. CSS-Textverweise führen zu `false`, die
  History bleibt dann unverändert und wird vom Aufrufer verworfen.
- `EditorStore.replaceDocumentPreservingHistory(document)` ersetzt das Dokument
  ohne die History zu leeren.
- `EditorSession.replaceDocument(..., { preserveHistory })` und
  `migrateHistoryReferences(...)` verbinden beides.
- Die App ruft vor dem Dokumentwechsel `migrateHistoryReferences` auf; nur bei
  Erfolg bleibt die History erhalten.

Gate 09a:

- `packages/editor/test/history.test.ts` 25 bestanden.
- `packages/editor/test/state/store.test.ts` 18 bestanden.
- Vollständiger App-/History-Gate 274 bestanden in 13 Dateien.
- Echter Browserfall: token-verweisender History-Eintrag, Umbenennung,
  anschließendes Undo/Redo mit `color.marke` statt `color.marker`.

## Teil 09b – Umbenennung als History-Eintrag (umgesetzt)

Die Pipeline kann einen Dokumentwechsel atomar mit dem externen Eintrag und
allen Versionen bestätigen:

- `EditorStore.replaceDocumentAndCommitExternal(id, document, versionAfter)`
  setzt Dokument und Commit in einem Store-Emit.
- `SavePipeline.confirmExternalReplacement(...)` prüft Basis, saubere Pipeline,
  Seiten-/Theme-Sprung und höchstens einen Registry-Sprung und übernimmt dann
  Dokument, Entry und Versionen gemeinsam.
- `EditorSession.confirmExternalReplacement(...)` reicht das durch.
- `confirmExternalHistoryReplacement(...)` übernimmt denselben Vertrag für die
  Reload-Recovery mit importierter, migrierter History; abgewiesene
  Registry-Sprünge und Dokumente bleiben gesperrt.
- Tests in `packages/editor/test/state/history-checkpoint.test.ts` sichern die
  atomare Sichtbarkeit, die abgewiesene falsche Basis und den abgewiesenen
  Registry-Sprung.

App-Anbindung:

- Der erste bestätigte Rename committet den externen Eintrag atomar (bei
  sauberer Basis) oder über den sicheren Fallback und registriert einen
  Rename-Receipt mit `name`/`newName`/Ketten-`receiptId`.
- Der Adapter navigiert Undo (`new→old`) und Redo (`old→new`) mit `undoOf`,
  prüft Theme, Page, Registry und die erwartete Dokumenttransformation und
  migriert die History-Verweise in beide Richtungen.
- Verlorene Antworten, Reload, Retry und die explizite Recovery nutzen denselben
  Lease-/Checkpoint-Vertrag; die Recovery importiert migrierte History und den
  gefetchten Dokumentstand gemeinsam.
- Der getrennte `lastVariableRename`-Knopf ist entfernt; die gemeinsame
  History-Toolbar und der Variablenbereich zeigen denselben Rename-Schritt.

Gate 09b:

- Vollständiger App-/History-Gate: 277 bestanden in 13 Dateien, keine Skips.
- Rename-Browsertest: echter Verlust der Undo-Antwort, Reload, Retry, dann
  Redo über die gemeinsame Canvas-History.
- Legacy-Rename-Browsertest: bestätigter Retry erhält Checkpoint und Belege,
  erzeugt einen Eintrag und lässt Undo zu.
- Typecheck und Lint grün.

## Answer

Umgesetzt und gegatet. Die Umbenennung ist jetzt ein bestätigter externer
History-Schritt mit eigener Undo-/Redo-Navigation. Strukturierte Tokenverweise
werden in Forward- und Undo-Patches migriert; CSS-Textverweise in alten
Patches führen weiterhin bewusst zum Verwerfen. Die Recovery kann einen
dokumentändernden Eintrag inklusive Registry-Sprung atomar importieren.
Engine und PostgreSQL-Verträge blieben unverändert; der letzte vollständige
Engine-/PostgreSQL-Lauf bleibt 88 bestanden ohne Skips.

## Akzeptanz

- Umbenennung erscheint als genau ein externer History-Eintrag.
- Undo/Redo der Umbenennung läuft über denselben Runner und dieselben
  Versions-/Recovery-Verträge wie Delete/Restore.
- Keine alten Tokenverweise werden durch Undo/Redo wiederhergestellt.
- Library-, Adapter-, Browser-, Engine-, PostgreSQL- und Gesamt-Gate grün.
