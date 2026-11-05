# Geprüfte Checkpoints für gemeinsame Reload-History

Type: task
Status: resolved
Blocked by: 05

## Definition of Ready

- Vorangegangener Canvas-/History-Gate, Typecheck, Lint und Doku-/Patch-Gate grün; HEAD `f261876`, Arbeitsbaum beim Start leer, keine konkurrierende Bearbeitung.
- Scope: serialisierbarer HistoryStack samt Cursor; Session-Checkpoint an Site, Page, Dokument und alle geladenen Versionen binden. Nur bestätigte, saubere Stände exportieren und in eine leere saubere Session importieren.
- Runner und ausstehende Serveranfragen bleiben außerhalb des Checkpoints; App-Belege und Recovery werden in der nächsten vertikalen Scheibe integriert. Kein neuer DB- oder ADR-Vertrag.
- Testlücke: gemischte bestätigte Einträge und Redo-Zweig nach Reload; Daten-/Versionsabweichung, defekte Patches und Storage-Daten dürfen weder Dokument noch bestehende History überschreiben.

## Vertrag und Gate

- JSON-Checkpoint ist eine geprüfte Momentaufnahme, kein zweiter Store und kein automatischer Recovery-Beweis.
- Keine unbekannten Patch-Arten; sämtliche lokalen Schritte in beiden Richtungen auf Kopien replayen und ihre Umkehrbarkeit prüfen, bevor die History übernommen wird.
- Objekt-Schlüsselreihenfolge ist unerheblich; ausschließlich Rule-`updatedAt` ist aus dem Dokumentvergleich ausgenommen. Registry-Inhalte, Reihenfolge und Page-Inhalte bleiben relevant; Versionsgleichheit bleibt Pflicht.
- Offene Pipeline, Unknown/Lease, bestehende History, falsche Site/Page/Versionen oder ungültige Daten verweigern den Import vollständig.
- Neue IDs nach Reload müssen eindeutig bleiben; eine neue Eingabe beginnt eine neue Coalesce-Gruppe und verwirft nur den Redo-Zweig.
- Gate: History-/Store-/Session-/Pipeline-/External-History-Tests und neuer Checkpoint-Gate; Canvas-/Variablen-Browser, Typecheck, Lint, Doku-/Patch-Gate und Graphify AST-Update.

## Comments

- App-Runner, persistierte Belege und verlorene Antworten brauchen zusätzlich ihre eigenen Browser-Abnahmen; dieser Checkpoint allein behauptet keine fertige Variablen-History.

## Gegenreview, Runde 1

Linsen 1–14: Snapshot-Metadaten, Copy-Ownership, Context-/Versionsbindung, vollständiges Replay in beide Richtungen, leere Session und Pending-Schutz, Coalesce und IDs geprüft.

- **High, vor Freigabe zu korrigieren:** Eine bloße Patch-Kind-Whitelist prüft keine Struktur und keine geerbten Ziele. `setNodeFields` mit Ziel `__proto__` könnte beim Validierungs-Replay ein geerbtes Objekt verändern (`history-checkpoint.ts:checkedEditorHistory`, `patches.ts:requireNode`). Malformed-Props und geerbtes Ziel als Regression ergänzt; sie müssen vor jedem Replay abgelehnt werden.
- **Low:** Doppeltes vollständiges Replay beim Context-Matching und Store-Import ist unnötig. Context-Matching und atomaren Store-Import trennen; einmaliger Replay-Gate genügt.

## Gegenreview, Runde 2

Linsen 2, 8, 11 und 13: konkrete Patch-Strukturen, eingefügte Metadaten und geerbte Kindreferenzen zusätzlich gegen echte Store-Schritte geprüft.

- **High:** `insertNodes` akzeptierte falsche Typen für `hidden`, `locked`, `variant`, Motion und State-Props sowie eine nicht eigene Kindreferenz `toString`. Umkehrbarkeit und der bestehende Konsistenzcheck allein erkannten das nicht (`history-checkpoint.ts:validPatch`, `consistency.ts:validateDocument`). Regressionen reproduzierten die Annahme; Node-Struktur und eigene Referenzen vor Freigabe vollständig prüfen.
- **Medium:** `deleteStyleRule` und `reorderStyleRule` ohne `id` wurden als umkehrbare No-ops akzeptiert (`history-checkpoint.ts:validPatch`). Pflichtziele für alle adressierten Patch-Arten prüfen; Regressionen vorhanden.
- Alle Patch-Arten aus echten Store-Aktionen einschließlich Metadaten, Motion, Klassen, Struktur und responsive Props werden für jede Cursorposition in beiden Richtungen geprüft.

## Gegenreview, Runde 3

Linsen 1–14 erneut auf den finalen Diff angewendet: öffentliche Exports, Snapshot-Metadaten, Copy-Ownership, Context-/Versionsbindung, alle Patch-Arten und Cursorpositionen, eigene Node-Ziele und Kindreferenzen, Pending-/Pipeline-/Dispose-Schutz, Coalesce/IDs, Save-Emission, Browser-/Bundle-Pfade und Dokumentationsgrenzen. Keine neuen Befunde im Checkpoint-Scope. Die Befunde aus Runde 1 und 2 sind korrigiert und durch zuvor rote Regressionen abgesichert.

## Answer

- `HistoryStack.snapshot()/restore()` serialisiert bestätigte Einträge und Cursor ohne Lease; IDs bleiben nach Reload eindeutig, neue Eingaben beginnen eine neue Gruppe.
- `EditorSession.historyCheckpoint()/restoreHistoryCheckpoint()` bindet den Stand an Site, Page, vollständiges EditorDocument und alle geladenen Versionen. Import erfolgt ausschließlich in leere, saubere Sessions und löst keine Save-Aktion aus.
- `EditorStore.restoreHistory()` prüft vor Übernahme Struktur, eigene Referenzen und Umkehrbarkeit sämtlicher lokalen Schritte in beiden Richtungen auf Kopien. Ungültige Daten verändern weder Dokument noch History.
- Vereinbarter History-/State-/Canvas-/Variablen-Browser-Gate nach dem letzten Testdiff grün; Typecheck, Lint und Graphify AST-Update ausgeführt. Messwerte stehen ausschließlich in `docs/current/qualitaet.md`; Doku-/Patch-Gate nach dem Abgleich grün.
- App-Persistenz, externe Belege, Runner und Unknown-Recovery bleiben getrennte Folgearbeit. Keine Behauptung über abgeschlossene gemeinsame Variablen-History oder Elementor-/Framer-Parität.
