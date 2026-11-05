# Delete/Restore für gemischte History

Type: task
Status: resolved

## Definition of Ready

Scheibe 03 in `b4fc36b` gegatet und gesichert; Arbeitsbaum leer geprüft, kein konkurrierender Strang. Scope: `packages/engine/src/store.ts`, `db.ts`, `packages/engine/test/theme-variable-deletion.test.ts`, `backup-restore.test.ts` und aktueller Doku-Abgleich. Testlücken: Restore nach vollständig zurückgenommenen Page-/Klassen-/Theme-Schritten und idempotente Wiederholung mit dieser aktuellen Request-Basis.

## Vertrag

- Neue Löschbelege erfassen vollständige Inhalts-Hashes für Theme, Klassen und Pages einschließlich Identität, Pfad, Titel, Metadaten und Draft. Restore ist nur bei gleichen Versionen oder vollständig gleichem Inhalt zulässig; aktuelle Request-Basis wird weiterhin geprüft.
- Delete-Wiederholung bindet neue Belege an die ursprüngliche Page-/Theme-Request-Basis. Restore speichert Request-Basis und Ergebnis atomar; nur dieselbe Anfrage bekommt dasselbe Ergebnis, auch nach späteren Änderungen, Antwortverlust und Backup/Restore.
- Ältere oder unvollständige Inhaltsbelege behalten den strengen Versionsschutz. Bereits wiederhergestellte Altbelege behalten den vorhandenen Retry-Vertrag.
- Site-/Theme-/Page-Sperren, Mehrseitenidentität, Rollback, Bibliotheks-/Verwendungsschutz und Autorisierung bleiben bestehen. Kein neuer Endpoint und keine Änderung des kanonischen NodeTree oder eines angenommenen ADR.

## Gate

Gezielte Delete-/Restore-, Rename- und Backup-Tests, auch gegen isoliertes echtes PostgreSQL ohne Skips; DB-Schema-/SQL-Vertragsgate, bestehende Variablen-Browserfälle, Typecheck, Lint, `quality:check`, `git diff --check`. App-History-Anbindung und Gesamtabnahme bleiben getrennt.

## Comments

Ein Restore-Ergebnis darf nicht aus ursprünglicher Löschversion plus eins geraten werden, sobald Inhaltsgleichheit neuere Request-Versionen zulässt. Die dauerhafte Ergebnisbasis muss zusammen mit allen Writes in derselben Transaktion landen.

## Gegenreview, Runde 1

Linsen 1–14: Datei-/Funktionsabdeckung, Kategorien, Ressourcen, Client-/Server-Vertrag, Plattform, Fehler, Zustandswechsel, Bedienung, Infrastruktur, Security, Datenzugriff, Testqualität und Konsistenz.

- **High, rot belegt:** Delete-Retry akzeptierte die Basis einer anderen Page mit zufällig gleichen Versionen (`store.ts:deleteUnusedVariable`). Neue Belege speichern die exakte Request-Basis; Migration erhält den Altvertrag.
- **High, rot belegt:** Restore nach zurückgenommenen Theme-/Page-Schritten blieb wegen Löschversion gesperrt; neue Inhaltsbelege und aktuelle Request-Prüfung ergänzen den Schutz (`store.ts:restoreVariable`).
- **High:** Restore-Ergebnis wäre nach Erweiterung des Inhaltsvertrags falsch beziehungsweise bei Wiederholung nicht rekonstruierbar. Request-Basis und Ergebnis landen zusammen mit allen Writes in `restore_result`; Test prüft spätere Writes und abweichende Wiederholung.
- **High, im neuen Test belegt:** Klassen-`updatedAt` bleibt nach Undo verschieden. Der neue Delete-Inhaltshash entfernt ausschließlich diesen technischen Zeitstempel, nicht Stile, Zustände, Reihenfolge, Herkunft oder Identität (`variableRegistryContentHash`). Rename nutzt weiterhin seinen bisherigen Hashvertrag; dessen Klassen-Zeitstempelgrenze wird vor App-Rename separat geschlossen.
- **Testlücken:** Zusätzliche PostgreSQL-Regressionen für parallele Registry-Änderung und identische Restore-Anfragen ergänzt. Vorhandene Locks bleiben Site → Theme → Beleg → geordnete Pages.

Kein neuer Endpoint/Transport, keine Config oder Credentials. Migration ist additiv; JSON-Spalten und Backup leiten sich weiterhin aus `db.ts` ab. Browserabläufe bleiben separate Aktionen, nicht fälschlich als gemeinsame History abgenommen.

## Gegenreview, Runde 2

Linsen 1–14 erneut: vollständiger Diff samt Client-/Server-Aufrufen, Parser, Schema, Backup, SQL-Gate, Testharness, Fehler-/Retry- und Sperrpfaden sowie Doku-Grenzen geprüft.

- **High, rot belegt:** Der tolerante Registry-Parser normalisierte Reihenfolge und verwarf ungültige Einträge beziehungsweise unbekannte Felder vor dem Inhaltsvergleich (`store.ts:variableRegistryContentHash`, `style-rule.ts:parseStyleRuleRegistry`). Restore durfte dadurch trotz verändertem Rohinhalt schreiben. Der Inhaltsbeleg vergleicht jetzt die vollständige rohe Registry und entfernt nur `updatedAt` direkt an Regeln. Regression schützt ungültige Einträge, unbekannte Inhaltsfelder und gespeichertes `order`.

Die Verwendungserkennung bleibt wie zuvor begrenzt; sie wird nicht als vollständiger Referenznachweis ausgegeben. Der neue Rohinhaltsschutz betrifft die Restore-Inhaltsgleichheit, nicht eine heimliche Erweiterung des Rename- oder Verwendungsschutzes.

## Gegenreview, Runde 3

Vollständige Runde über Linsen 1–14 ohne neue Befunde im Backend-Scope:

- Abdeckung, Funktionen und Kategorien: Delete, Restore, Retry, Legacy, Migration und Backup anhand der vollständigen Tests geprüft (`theme-variable-deletion.test.ts`, `backup-restore.test.ts`).
- Ressourcen und Plattform: geordnete Page-Locks, vorhandene Transaktionsverwaltung und Fixture-Cleanup beibehalten; In-Memory- und PostgreSQL-Pfade ausgeführt (`store.ts:2368–2631`, `db.ts`). Kein neuer laufender Timer oder Client.
- Client-/Server-Vertrag, Netzfehler und Zustandswechsel: Endpoint und Body unverändert; exakte Delete-Basis sowie gespeicherte Restore-Basis/Antwort verhindern erneute Versionsanhebung und fremde Wiederholung (`http.ts:1646–1672`, `store.ts:2383–2396`, `2580–2597`, `2624–2630`).
- UX: unveränderte separate App-Aktionen nicht als gemeinsame History ausgegeben; bestehender Browser-Gate bleibt gültig, App-/Canvas-Anbindung folgt getrennt.
- Infrastruktur, Security und Zugriff: additive JSON-Spalten in der Schemaquelle; Publish-/Write-Autorisierung unverändert; keine Zugangsdaten oder neue Config im Diff (`db.ts:88–105`, `http.ts:1655–1672`).
- Daten, bestehende Qualität und Konsistenz: Rohinhaltshash entfernt ausschließlich Regel-`updatedAt`; Page-Identität und vollständige Inhalte bleiben geschützt. Aktuelle Request-Versionen bleiben Pflicht; Rollback bei Beleg-/Auditfehler und identisches paralleles Restore gegen PostgreSQL grün. Doku grenzt Backend, Library und App ab.

## Answer

Der Backend-Vertrag ist mit rot/grünen Regressionen, isoliertem PostgreSQL-, In-Memory-/SQL-, bestehendem Variablen-Browser-Gate, Typecheck und Lint abgenommen. Messergebnisse stehen ausschließlich in `docs/current/qualitaet.md`. Abschluss mit Doku-/Patch-Gate und eigenem Schritt-Commit. App-/Canvas-Runner, gemeinsame persistierte History, Reload-Recovery, Rename-Migration und atomare History-Sprünge bleiben offen.
