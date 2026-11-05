# Review Scheibe 08 – rückwärtsverträgliche Registry-Inhaltsbelege für Rename

Start-HEAD: `2da0f0d`. Gegenstand: `.scratch/editor-umbau/issues/08-rename-registry-inhaltsbelege.md`.

## Runde 1 – Spec gegen Code

Geprüft: `Store.renameVariable` beim Schreiben und beim Undo, `backup-restore.test.ts`, `db.ts`-Schema und Migration.

- Neue Belege schreiben `resource_hashes = { theme, registry, registryContract }`; `registry` ist `variableRegistryContentHash(renamedRules)`, `theme` bleibt `canonicalHash`. Der Marker ist eine Konstante (`raw-registry-updatedAt-excluded`), kein neues Spaltenfeld.
- Undo wählt den Registry-Vergleich über den Marker: Marker vorhanden → Content-Hash; kein Marker → bisheriger `canonicalHash`; jeder andere Marker → keine Inhaltsausnahme. Die Versionsprüfung bleibt unabhängig davon aktiv.
- Theme, Page-Fingerprints, Page-Identität und Page-Metadaten sind unverändert vollständig gebunden; Locks, Request-Basis und Rollback sind unverändert.
- Keine Schema-Migration und kein Update alter Belege. `resource_hashes` wird beim Backup/Restore als JSON mitkopiert.

Befund: keiner im Produktcode.

## Runde 2 – Grenzfälle und Gegenprobe

- Marker gesetzt, Registry-Hash aber mit `canonicalHash` erzeugt: Vergleich schlägt fehl, keine Ausnahme. Sicher.
- Kein Marker, Registry-Hash mit `updatedAt`-Ausnahme erzeugt: Vergleich gegen `canonicalHash` schlägt fehl. Alte Belege werden nicht rückwirkend gelockert.
- Unbekannter Marker (z. B. `future-v9`): `registryMatches` ist falsch, auch bei identischem Inhalt. Durch den neuen Testfall abgedeckt.
- Fehlender oder unvollständiger Registry-Hash: `isHash` verweigert die Inhaltsausnahme; die unveränderte Versionsprüfung bleibt möglich.
- Nur `updatedAt` geändert, alle Versionen unverändert: Content-Vergleich greift, die Version allein würde bereits scheitern. Genau der geforderte Fall.
- Echte Inhaltsänderung (Name, Styles, Identität, Zusatzfeld): Content-Hash ändert sich, Undo bleibt gesperrt.
- Backup/Restore: Kennzeichnung und 64-stelliger Hash werden nach dem Restore aus der Belegtabelle gelesen und geprüft.

Befund: Der erste Testlauf war rot, aber nur testseitig: `pg-mem` liefert die JSON-Spalte bereits als Objekt, während echtes PostgreSQL Text liefert. Der Test normalisiert beide Formen (`typeof raw === "string" ? JSON.parse(raw) : raw`). Kein Produktfix nötig.

## Runde 3 – Gate-Nachweis

- Rot/grün: Der neue Fall schlug vor der Implementierung fehl und ist danach grün.
- Engine-Memory: 70 bestanden, 18 erwartete PostgreSQL-Skips in 5 Dateien.
- Isoliertes PostgreSQL 18.6: 88 bestanden, 0 Skips in 5 Dateien.
- Variablen-Browsertest: 10 bestanden.
- `pnpm typecheck` und `pnpm lint` grün.

## Ergebnis

Keine offenen Befunde im Scope. Die historische Tokenmigration und atomare History-Sprünge bleiben ausdrücklich eigene Scheiben.
