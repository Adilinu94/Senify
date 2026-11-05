# Serverbestätigte History-Navigation

Type: task
Status: resolved

## Definition of Ready

Scheibe 02 in `f04bee6` gegatet und gesichert; Arbeitsbaum leer geprüft, kein konkurrierender Strang. Scope: History-Cursor, Store-Bestätigung und Session-Vertrag mit injiziertem externem Runner. Testlücke: bestätigte externe Einträge sind bisher nur eine synchrone Navigationsgrenze.

## Vertrag dieser Scheibe

- Bestehendes synchrones Undo/Redo bleibt für lokale Dokumentaktionen unverändert.
- Ein externer Runner wird explizit pro bestätigtem Eintrag registriert. Async Undo/Redo reserviert Navigation, ohne den Cursor vor der Bestätigung zu verändern.
- Nur ein konsistent bestätigter Folgestand verschiebt den Cursor. Eindeutige Erst-Ablehnung gibt ihn frei; Unknown, Retry-Konflikt und nicht übernehmbare Bestätigung bleiben ungelöst.
- Während einer Anfrage neue lokale Eingaben bleiben erhalten. Externe Navigation startet nicht bei offenen oder fehlerhaften Pipeline-Writes.
- Retry verwendet denselben Eintrag, dieselbe Richtung und dieselbe Request-Basis. Persistente Request-/Belegzuordnung bleibt Aufgabe der folgenden App-Integration.
- History-Sprünge über externe Einträge bleiben bis zu einem atomaren Mehrschrittvertrag gesperrt; keine teilweise erfolgreiche Sprungschleife.
- Diese additive Session-Schnittstelle ändert weder den kanonischen NodeTree noch einen angenommenen ADR-Vertrag. Kein neuer öffentlicher Engine-Schreibpfad.

## Gate

Neue Async-Session-Regressionen sowie vollständige History-/Store-/Session-/Pipeline-Tests, Typecheck, Lint, `quality:check`, `git diff --check`. App-/Canvas-Integration und Backend-Abnahme sind nachfolgende Schritte und dürfen nicht als umgesetzt gelten.

## Comments

Der Runner muss idempotente Request-Kennungen vor dem ersten Write sichern und Retry-Konflikte nicht als Rollback-Beweis behandeln. Die Session bewahrt nur ihre lokale Lease; Belege und Reload bleiben ausdrücklich offen.

## Gegenreview, Runde 1

Linsen: Datei-/Funktionsabdeckung, Kategorien, Ressourcen, Client-/Server-Vertrag, Fehlerfälle und Zustandswechsel. Neue Befunde:

- **High:** `persist.ts:externalVersions` verwendete einen nicht existierenden Theme-Schalter. Async-Tests und Typecheck rot; auf tatsächliche optionale Theme-Version korrigiert.
- **High:** `external-history.ts:#run` veröffentlichte Page-/Theme-Versionen vor dem Cursorwechsel. Direkter Pipeline-Beobachter konnte den reservierten Eintrag verdrängen; Regression rot. Die Pipeline bestätigt nun Versionen, Registry, Dokument und Cursor vor der ersten Benachrichtigung.
- **High:** Ungültige Runner-Antworten warfen außerhalb der Fehlerbehandlung oder wurden als eindeutige Ablehnung eingestuft. Drei konkrete Antwortformen rot nachgewiesen; bleiben nun Unknown und retryfähig.
- **High:** Start-/Recovery-Beobachter konnten die Lease auflösen, trotzdem wurde der alte Runner gestartet beziehungsweise erneut gesendet. Zwei Regressionen rot; Ownership vor und nach dem Runner geprüft, Recovery invalidiert die alte Navigation.
- **High:** Geänderte Registry ohne Versionsbeleg wurde übernommen. Regression rot; geänderter Klasseninhalt verlangt bestätigte Registry-Anhebung und die Anhebung einen gelieferten Dokumentstand.
- **Low (Testbefund):** Der Registry-Write-Test erwartete `themeVersion` statt des vorhandenen Transportfeldes `baseThemeVersion`; Assertion gegen den tatsächlichen Vertrag korrigiert. Kein zusätzlicher Produktfehler.

Abgrenzung: kein neuer Engine-Endpoint, keine Datenbankmigration, keine UI-Anbindung. Persistente Belege, historische Tokenverweise und atomare Mehrschrittsprünge bleiben offen und werden nicht durch diese Library-Abnahme geschlossen.

## Gegenreview, Runde 2

Linsen: Plattformpfade, Bedienung, Infrastruktur, Security, Datenzugriff, Testqualität und interne Konsistenz. Neuer Befund:

- **High:** `external-history.ts:#run` behandelte ein ausdrücklich geliefertes `document: null` wie ein fehlendes optionales Dokument. Regression rot; nur `undefined` erlaubt nun den unveränderten Dokumentstand, ungültige Dokumente bleiben Unknown.
- Ergänzte Vertragsprüfungen: fremde Lease/Eintrag/Richtung, unveränderte Retry-Basis, Start-Eingabe vor dem ersten Runner-Aufruf, Registry-/Version-Anomalien, gemischte Schritte, Sprung-Barriere und Austausch des registrierten Runners während einer Anfrage.
- Auf Dispose wird die Navigation samt Dokument-/Runnerreferenz freigegeben; der Store-Marker wird nicht als Rollback aufgelöst.
- Keine neuen Credentials, Config-, Netzwerk-, Engine- oder DB-Schreibpfade. Canvas und App verwenden weiterhin die bestehenden synchronen APIs; deren Integration benötigt eigene Browser-Abnahme.

## Gegenreview, Runde 3

Alle Linsen erneut auf den korrigierten Scope angewendet: keine neuen Befunde. Der Cursorwechsel besitzt eine eigene Lease; lokale Navigation bleibt synchron und externe Sprünge bleiben vorab gesperrt. Session-, Store- und Pipeline-Beobachter erhalten den konsistent übernommenen Stand. Ungültige oder nicht übernehmbare Ergebnisse behalten den Pending-Schutz; Erst-Ablehnung und ausdrückliche Recovery bleiben davon getrennt. Der aktive Runner bleibt während einer Anfrage gebunden und Dispose übernimmt keine verspätete Antwort. Abgrenzungen zu App, Belegpersistenz, Tokenmigration und Backend sind unverändert offen.

## Answer

Library-Scope abgeschlossen: Async-Controller, Session-Fassade, Navigationslease und atomare Store-/Pipeline-Bestätigung mit den oben genannten Regressionen. Festgelegter Gate einschließlich bestehender Variablen-/Canvas-Browserfälle, Typecheck und Lint grün; Messergebnis ausschließlich in `docs/current/qualitaet.md`. Graph per `graphify update .` aktualisiert. Stand, Fahrplan und Map gleichen den begrenzten Scope ab. Delete/Restore, App-Anbindung, persistierte History-Belege, Tokenmigration und atomare Mehrschrittsprünge sind ausdrücklich nicht abgeschlossen.
