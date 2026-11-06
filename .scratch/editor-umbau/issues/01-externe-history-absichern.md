# Vorhandene externe History absichern

Type: task
Status: resolved

## Definition of Ready

Fortsetzung des bereits vorhandenen, nicht abgeschlossenen Schritts, kein neuer unabhängiger Strang. Zieldateien: `history.ts`, `state/store.ts`, `state/session.ts`, `state/persist.ts`, App-Variablenpfad und deren Tests. Der übernommene Diff wurde gelesen und separat gesichert. Kein Subagent oder weiterer Schreibstrang wurde gestartet. Ausgangs-Gates werden vor Korrekturen ausgeführt; nach Abschluss müssen Gate, Dokumentationsabgleich und Schritt-Commit einen sauberen Baum herstellen.

## Review-Runde 1: Vollständigkeit, Zustandsübergänge und bestehende Qualität

- HIGH: `packages/editor/src/state/store.ts:327–339` navigiert schrittweise, ohne den gesamten Weg vorab zu prüfen. Hinter einem lokalen Schritt kann eine externe Grenze erst nach bereits ausgeführtem Undo entdeckt werden; ein fehlgeschlagener Sprung verändert dann trotzdem Dokument und Cursor.
- HIGH: `packages/editor/src/history.ts:347–377` liefert bei ausstehendem externem Vorgang lokale Restore-Patches, obwohl Undo/Redo zu diesem Zeitpunkt gesperrt sind. Der direkte Restore-Pfad umgeht die Sperre.
- MEDIUM: `packages/editor/src/history.ts:257–300` beendet die Coalesce-Gruppe nicht nach Auflösung eines externen Vorgangs. Während der Anfrage entstandene Eingaben können anschließend mit einer neuen Gruppe zusammenfallen.
- HIGH: `packages/app/public/app.js:6404–6412` vertraut einer gespeicherten `externalHistoryId`, auch wenn nach Reload kein entsprechender Pending-Eintrag in der neuen Session vorhanden ist. Der Retry erhält dann keine echte Navigationssperre.
- LOW: `packages/app/public/app.js:6414–6418` enthält einen unbenutzten Commit-Helfer; er ist nicht an einen bestätigten Async-Undo-Vertrag angebunden. Lint muss den konkreten Ausgang bestätigen.

## Gate

Gezielte History-, Store-, Pipeline-, Session- und Variablen-Browser-Tests, Typecheck, Lint, `quality:check` und `git diff --check`. Regressionen müssen zuerst rot sein. Das Gate belegt nur diese Vorbereitungs-Scheibe, nicht die vollständige globale Token-History oder Elementor-Parität.

## Review-Runde 2: Funktionsaudit, Verträge, Fehler und Bedienung

- HIGH: `packages/editor/src/history/dialog.ts:100–125` bot während Pending weiterhin aktive Restore-Buttons an. Regression im Retry-Browsertest zuerst rot; Buttons sind nun disabled/ARIA-disabled und der Click-Handler prüft denselben ganzen Weg wie der Store.
- `packages/editor/src/state/persist.ts:497–503` ignoriert externe Lifecycle-Aktionen ausdrücklich. Die ergänzte Session-Regression prüft Begin/Fail/Commit, Subscription, Cursor-Sperre, unverändertes Dokument und unveränderten Save-State einschließlich fehlender zusätzlicher Writes.
- Plattformprüfung: Browser-Evaluation läuft mit Node-Typecheck. Die Browser-Storage-Struktur ist wie die bestehenden Browser-Tests lokal typisiert, ohne DOM-Lib im gesamten Projekt einzuschalten.
- Verbleibende Vertragslücken sind **nicht** Teil des Abschlusses dieser Vorbereitung: unbekannter Serverstand gibt die Navigationssperre noch frei; Rename leert History; bestätigte Marker besitzen noch keinen Async-Runner. Sie bleiben unter den eigenen Paketen der Map offen.

## Review-Runde 3: vollständiger Gegencheck nach Korrekturen

Alle Review-Linsen erneut auf den begrenzten Diff angewendet: Datei-/Funktionsabdeckung, Kategorien, Ressourcen, Client/Server-Vertrag, Plattformen, Fehler, Zustandsübergänge, UX, Konfiguration, Security, Datenzugriff, vorhandene Qualität und Konsistenz. Kein neuer Befund innerhalb dieser Vorbereitung. Keine Backend-, Renderer-, Token- oder Framer-Migration in diesem Diff. Pending ist nicht mit einem Persistenzbeleg oder fertig implementiertem Async Undo gleichgesetzt. Keine Zugangsdaten im Diff; keine neue unbereinigte Browser-/Server-Ressource im ergänzten Test.

## Answer

Die konkreten Regressionen wurden zuerst rot nachgewiesen und korrigiert: keine Teilnavigation über externe Grenzen, keine Restore-Patches bei Pending, getrennte Eingabegruppen nach Auflösung, Session-eigene Pending-ID beim Retry und gesperrter History-Dialog. Das Session-/Pipeline-Verhalten besitzt einen ergänzten grünen Beleg. Der kombinierte gezielte Gate sowie der nachfolgende Unit- und Browser-Gegencheck, Typecheck und Lint sind ausgeführt und grün; Messzahlen ausschließlich in `docs/current/qualitaet.md`. Doku- und Patch-Gate werden unmittelbar vor dem Schritt-Commit ausgeführt. Die vollständige Async-Integration ist dadurch nicht geschlossen.

## Comments

Die eigentliche Async-Integration bleibt ein eigenes Paket. Noch nicht angebundene Funktionalität wird nicht als fertig dokumentiert.
