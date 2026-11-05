# Rückwärtsverträgliche Registry-Inhaltsbelege für Rename

Type: task
Status: ready-for-agent
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

## Comments

- Vorbereitung ohne Implementierung während des Abschlussreviews von Scheibe 07. Der konkrete Start-HEAD wird erst nach dessen Commit festgehalten.
