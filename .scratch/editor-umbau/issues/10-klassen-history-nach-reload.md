# Klassen-History nach Reload

Status: resolved

## Befund

Auf einer isolierten Testseite mit pg-mem führte das Anlegen und Speichern einer globalen Klasse nach einem Reload zu einer gesperrten History. Im Variablenpanel erschien der Hinweis, dass der gespeicherte Verlauf nicht zum Editorstand passt. Eine explizite Recovery konnte den gesicherten Verlauf verwerfen und den aktuellen Stand laden.

## Ursache und Korrektur

Die Engine setzt bei einer menschlich angelegten Stilregel `authoredBy: user`. Der Inspector erzeugte die neue Klasse zuvor ohne dieses Feld. Der lokale History-Checkpoint enthielt daher ein anderes Dokument als die beim Reload geladene Registry; der strenge Inhaltsvergleich lehnte ihn zu Recht ab. Der Inspector legt das Feld nun bereits vor dem gemeinsamen Anlegen und Zuweisen an (`packages/editor/src/inspector/inspector.ts`). Die Prüfung wurde nicht aufgeweicht; ältere unpassende Checkpoints bleiben gesperrt.

## Abnahme und Grenzen

`packages/app/test/class-history-reload-browser.test.ts` war vor der Korrektur rot und prüft danach im Browser: Klasse anlegen, speichern, neu laden, verfügbares Undo, keine Recovery-Warnung, Undo mit Entfernen und Redo mit Wiederherstellen der Klasse. Weitere Klassen-, Variablen-History- und Inspector-Gates und ihre Ergebnisse stehen in `docs/current/qualitaet.md`. Der Test verwendet eine isolierte pg-mem-Instanz und belegt keine konkurrierenden Schreibvorgänge oder die automatische Wiederherstellung bereits verworfener älterer Checkpoints.
