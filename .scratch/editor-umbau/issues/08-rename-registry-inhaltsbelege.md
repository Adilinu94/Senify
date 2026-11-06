# Rückwärtsverträgliche Registry-Inhaltsbelege für Rename

Type: task
Status: resolved
Blocked by: 07

## Definition of Ready

- Beginn erst nach Abschluss-Gate und Commit von Scheibe 07 sowie leer geprüftem Arbeitsbaum.
- Scope: Registry-Inhaltsbelege von `Store.renameVariable`; keine App-History- oder Tokenmigration in dieser Scheibe.
- Testlücke: Eine vollständig zurückgenommene Klassenänderung erzeugt ein neues Regel-`updatedAt`; der bisherige Rename-Beleg vergleicht dieses Zeitfeld und verweigert Undo trotz gleichem Inhalt.
- Bestehende Belege sind dauerhaft gespeichert und im Backup enthalten. Ihr ursprünglicher Hash-Vertrag darf nicht rückwirkend gelockert oder durch neue Hashes ersetzt werden.

## Vertrag und Gate

- Neue Rename-Belege kennzeichnen den Registry-Hash-Vertrag ausdrücklich: rohe Registry, einschließlich Identität und aller Zusatzfelder; ausschließlich Regel-`updatedAt` ist unerheblich.
- Belege ohne Kennzeichnung behalten den bisherigen vollständigen Registry-Hash-Vergleich. Fehlende, unvollständige oder unbekannte Hash-Verträge erlauben keine neue Inhaltsausnahme; die unveränderte Versionsprüfung bleibt möglich.
- Theme und alle Pages einschließlich Identität und Metadaten bleiben vollständig gebunden; aktuelle Request-Versionen und Transaktionssperren bleiben Pflicht.
- JSON-Kennzeichnung und Hashes bleiben beim Backup/Restore erhalten; keine Änderung alter Belege während Schema-Migration.
- Gate: Rename-, Delete/Restore-, Klassen-, Schema- und Backup-Vertrag in Memory und auf isoliertem PostgreSQL, einschließlich Konkurrenz und Rollback; Typecheck, Lint, Doku-/Patch-Gate, Graphify AST-Update und unabhängiger Gegenreview.

## Answer

Umgesetzt auf Start-HEAD `2da0f0d`. Neue Rename-Belege speichern neben Theme- und Registry-Hash die Kennzeichnung `raw-registry-updatedAt-excluded`; der Registry-Hash nutzt `variableRegistryContentHash` und lässt ausschließlich Regel-`updatedAt` aus. Undo wählt den Vergleich anhand der Kennzeichnung: neue Belege content-basiert, Belege ohne Kennzeichnung weiterhin über den vollständigen `canonicalHash`, unbekannte Kennzeichnungen ohne Inhaltsausnahme. Theme, alle Pages und die aktuellen Request-Versionen bleiben unverändert gebunden.

Rot/grün belegt: Der neue Test `ignoriert bei neuen Rename-Belegen nur Regel-updatedAt und hält alte Belege streng` war vor der Änderung rot und deckt neue, alte und unbekannte Belege ab. `backup-restore.test.ts` prüft, dass Kennzeichnung und 64-stelliger Hash einen Backup/Restore überstehen.

Gates am 05.11.2026: Engine-Memory 70 bestanden / 18 erwartete Skips in 5 Dateien; isoliertes PostgreSQL 88 bestanden / 0 Skips in 5 Dateien; Variablen-Browsertest 10 bestanden; `pnpm typecheck` und `pnpm lint` grün. Offen bleiben die historische Tokenmigration und atomare History-Sprünge als eigene Scheiben.

## Comments

- Vorbereitung ohne Implementierung während des Abschlussreviews von Scheibe 07. Der konkrete Start-HEAD wird erst nach dessen Commit festgehalten.
