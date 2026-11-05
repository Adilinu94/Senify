# 09 – Umbenennung in der gemeinsamen History

- Status: claimed
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

## Teil 09b – Umbenennung als History-Eintrag (Grundlage umgesetzt, Anbindung offen)

Die Pipeline kann einen Dokumentwechsel jetzt atomar mit dem externen Eintrag
und allen Versionen bestätigen:

- `EditorStore.replaceDocumentAndCommitExternal(id, document, versionAfter)`
  setzt Dokument und Commit in einem Store-Emit.
- `SavePipeline.confirmExternalReplacement(...)` prüft Basis, saubere Pipeline,
  Seiten-/Theme-Sprung und höchstens einen Registry-Sprung und übernimmt dann
  Dokument, Entry und Versionen gemeinsam.
- `EditorSession.confirmExternalReplacement(...)` reicht das durch.
- Zwei Tests in `packages/editor/test/state/history-checkpoint.test.ts` sichern
  die atomare Sichtbarkeit und die abgewiesene falsche Basis bzw. den
  abgewiesenen Versionssprung.

Noch offen ist die Anbindung:

- Rename-Receipt mit `oldName`/`newName`/Ketten-`receiptId`.
- Adapter-Navigation über Undo (`new→old`) und Redo (`old→new`) mit `undoOf`,
  Reload- und Retry-Vertrag, Dokument-/Theme-Verifikation.
- Ersatz des getrennten `lastVariableRename`-Undo/Redo-Knopfs durch die
  gemeinsame History; der bestehende Rename-Browsertest muss auf die
  History-Navigation umgestellt werden.

## Akzeptanz

- Umbenennung erscheint als genau ein externer History-Eintrag.
- Undo/Redo der Umbenennung läuft über denselben Runner und dieselben
  Versions-/Recovery-Verträge wie Delete/Restore.
- Keine alten Tokenverweise werden durch Undo/Redo wiederhergestellt.
- Library-, Adapter-, Browser-, Engine-, PostgreSQL- und Gesamt-Gate grün.
