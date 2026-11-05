# History bei unbekanntem Serverstand sperren

Type: task
Status: resolved

## Definition of Ready

Vorbereitung in `b0f55cc` gegatet und gesichert, Arbeitsbaum leer geprüft. Kein konkurrierender Schreibstrang. Zieldateien: App-Variablenpfad, History-/Store-Clear-Vertrag und ihre Unit-/Browser-Tests. Testlücke: Unknown-Antworten und nach Reload gespeicherte Pending-Vorgänge geben derzeit History frei, obwohl der Server Tokenreferenzen geändert haben kann. Die zuerst rote Browserregression muss Unknown, Reload, erneuten Konflikt, History-Dialog und ausdrücklichen Ausweg prüfen.

## Review und Regressionen

- HIGH: Unknown/Reload gab Undo frei; der neue Browserablauf war vor Korrektur an der erhaltenen Überschrift rot. Pending wird nun auch ohne Retry an die neue Session gebunden und bei einem Retry-Konflikt behalten.
- HIGH: Ein erfolgreicher Serverwrite ohne übernehmbaren lokalen Stand wurde bisher nicht mehr als ungelöst geführt. Er bleibt jetzt Pending statt alte History-Patches freizugeben.
- HIGH: `EditorStore.replaceDocument()` konnte die Sperre über andere Reload-/Importpfade entfernen. Store-Regression zuerst rot; lokale History wird geleert, aber ihr unresolved Marker bleibt beim Laden erhalten. Nur der Besitzer des Vorgangs löst ihn auf.
- HIGH, Reviewrunde Netzwerk/Storage: Scheitert die erneute Vormerkung beim Retry eines unklaren Vorgangs, gab der Anfangs-Catch dessen bestehende Sperre frei. Zusätzliche Browserregression mit gesperrtem `Storage.setItem` zuerst rot an der entfernten Überschrift; der Anfangs-Catch löst nur noch die Sperre eines noch nicht gesendeten neuen Vorgangs auf.

## Vertrag

- Eine unbekannte Antwort ist kein nachgewiesener Fehlschlag. Die Session-eigene Sperre bleibt bis zur Auflösung erhalten und wird nach Reload neu angelegt.
- Eine erfolgreiche Serverantwort mit inzwischen unpassendem Editorstand bleibt als ungelöster Vorgang erhalten; der lokale Stand wird nicht ersetzt.
- Eine eindeutige Ablehnung vor irgendeiner unbekannten Antwort gibt die Sperre frei. Ein Konflikt beim Retry eines unbekannten Vorgangs beweist dagegen nicht, dass der ursprüngliche Write ausgeblieben ist.
- Explizites Beenden mit Warnung lädt den Serverstand nur ohne laufenden Save und ohne neue lokale Eingabe während des Abrufs. Erst dann werden Pending-Zuordnung und History verworfen.
- Diese Scheibe implementiert noch kein gemeinsames Async Undo/Redo und keine History-Migration nach Rename.

## Gate

Variablen-Browser vollständig, Canvas-Browser, History-/Store-/Session-/Pipeline-Tests, Typecheck, Lint, `quality:check`, `git diff --check`. Kein Backend-Write-Vertrag geändert; PostgreSQL-Gate für die spätere Beleg-/Undo-Integration bleibt offen.

## Comments

Die Speicherung im selben Browser-Tab bleibt das bestehende Recovery-Medium. Dynamische und externe Referenzen bleiben außerhalb des vollständigen Erkennungsvertrags.

## Gegenreview

- Runde 1: Datei-/Funktionsabdeckung, Netzwerk und Zustandsübergänge — die drei ursprünglichen HIGH-Befunde und die Storage-Retry-Lücke sind mit konkreten Regressionen abgedeckt.
- Runde 2: erneuter Durchlauf über Vollständigkeit, Kategorien, Ressourcen, Client/Server, Plattform, Netzwerk, Übergänge, UX, Konfiguration, Sicherheit, Datenzugriff, vorhandene Tests und Dokumentkonsistenz — keine weiteren durch diese Scheibe eingeführten Befunde. Store und Dialog behalten ihre synchronen Grenzen; Backend und öffentliche Schreib-API sind unverändert.
- Nicht als Gesamtabnahme werten: gemeinsame Async-Navigation, Tokenmigration und die übrigen Pakete in `map.md` bleiben offen. Der Gegenreview bezieht sich auf Sperrerhalt, nicht auf Elementor- oder Framer-Parität.

## Answer

Unknown, Retry-Konflikt, Reload, nicht übernehmbare Bestätigung und Dokumentwechsel behalten die Session-eigene Navigationssperre. Die zusätzliche Storage-Retry-Regression war zunächst rot und besteht nach Korrektur im vollständigen gezielten Gate. History-/State- und Variablen-/Canvas-Browser-Gate, Typecheck, Lint, `quality:check` und `git diff --check` grün; Messzahlen ausschließlich in `docs/current/qualitaet.md`. Graph-Update ausgeführt.
